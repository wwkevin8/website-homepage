begin;

create table if not exists public.transport_membership_manual_operations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  idempotency_key uuid not null,
  payload_hash text not null,
  request_id uuid references public.transport_requests(id) on delete set null,
  group_id text,
  claim_id uuid references public.membership_benefit_claims(id) on delete set null,
  result_json jsonb,
  created_at timestamptz not null default now(),
  constraint transport_membership_manual_operations_admin_key_unique unique (admin_user_id, idempotency_key)
);

alter table public.transport_membership_manual_operations enable row level security;
alter table public.transport_membership_manual_operations force row level security;
revoke all on table public.transport_membership_manual_operations from public, anon, authenticated;
grant select, insert, update on table public.transport_membership_manual_operations to service_role;

create index if not exists idx_transport_membership_manual_operations_request_created
  on public.transport_membership_manual_operations (request_id, created_at desc);

create or replace function public.admin_create_membership_transport_request_atomic(
  p_admin_user_id uuid,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_site_user_id uuid,
  p_entitlement_id uuid,
  p_claim_id uuid default null,
  p_request jsonb default '{}'::jsonb,
  p_pricing jsonb default '{}'::jsonb,
  p_group_action text default 'create_single',
  p_target_group_id text default null,
  p_reason text default null,
  p_confirm_contact_mismatch boolean default false,
  p_confirm_duplicate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_admin public.admin_users%rowtype;
  v_member public.site_users%rowtype;
  v_entitlement public.membership_entitlements%rowtype;
  v_claim public.membership_benefit_claims%rowtype;
  v_advisor public.admin_users%rowtype;
  v_existing_operation public.transport_membership_manual_operations%rowtype;
  v_duplicate public.transport_requests%rowtype;
  v_group public.transport_groups%rowtype;
  v_request public.transport_requests%rowtype;
  v_order jsonb;
  v_result jsonb;
  v_group_id text;
  v_current integer := 0;
  v_passengers integer := coalesce((p_request ->> 'passenger_count')::integer, 0);
  v_luggage integer := coalesce((p_request ->> 'luggage_count')::integer, 0);
  v_group_action text := lower(trim(coalesce(p_group_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_flight_datetime timestamptz;
  v_service_time timestamptz;
  v_mismatch_fields jsonb := '[]'::jsonb;
  v_duplicate_result jsonb := '{}'::jsonb;
  v_claim_before jsonb;
  v_failpoint text := nullif(current_setting('app.transport_membership_manual_failpoint', true), '');
begin
  if session_user <> 'postgres' and v_jwt_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'trusted server database role is required';
  end if;
  if p_admin_user_id is null or p_idempotency_key is null or nullif(trim(coalesce(p_payload_hash, '')), '') is null then
    raise exception using errcode = '22023', message = 'administrator, idempotency key and payload hash are required';
  end if;
  if p_site_user_id is null or p_entitlement_id is null or v_reason is null then
    raise exception using errcode = '22023', message = 'member, entitlement and reason are required';
  end if;
  if v_group_action not in ('create_single', 'join_existing') then
    raise exception using errcode = '22023', message = 'invalid group action';
  end if;
  if v_group_action = 'join_existing' and nullif(trim(coalesce(p_target_group_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'target group is required';
  end if;
  if lower(trim(coalesce(p_request ->> 'service_type', ''))) <> 'pickup' then
    raise exception using errcode = '22023', message = 'membership manual entry only supports pickup';
  end if;
  if v_passengers <= 0 or v_luggage < 0 then
    raise exception using errcode = '22023', message = 'invalid passenger or luggage count';
  end if;

  begin
    v_flight_datetime := (p_request ->> 'flight_datetime')::timestamptz;
    v_service_time := (p_request ->> 'preferred_time_start')::timestamptz;
  exception when others then
    raise exception using errcode = '22023', message = 'invalid flight or service time';
  end;
  if v_flight_datetime is null or v_service_time is null
     or nullif(trim(coalesce(p_request ->> 'student_name', '')), '') is null
     or nullif(trim(coalesce(p_request ->> 'airport_code', '')), '') is null
     or nullif(trim(coalesce(p_request ->> 'terminal', '')), '') is null
     or nullif(trim(coalesce(p_request ->> 'flight_no', '')), '') is null
     or nullif(trim(coalesce(p_request ->> 'location_to', '')), '') is null
     or (nullif(trim(coalesce(p_request ->> 'phone', '')), '') is null and nullif(trim(coalesce(p_request ->> 'wechat', '')), '') is null) then
    raise exception using errcode = '22023', message = 'required pickup order fields are missing';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('membership_manual_key:' || p_admin_user_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing_operation
  from public.transport_membership_manual_operations
  where admin_user_id = p_admin_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_operation.payload_hash is distinct from p_payload_hash then
      raise exception using errcode = '23505', message = 'idempotency key payload conflict';
    end if;
    return coalesce(v_existing_operation.result_json, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  select * into v_admin from public.admin_users where id = p_admin_user_id for update;
  if not found or v_admin.status <> 'active' or v_admin.role not in ('operations_admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'active operations administrator is required';
  end if;
  select * into v_member from public.site_users where id = p_site_user_id;
  if not found then raise exception using errcode = '23503', message = 'member not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'membership_manual_duplicate:' || p_site_user_id::text || ':pickup:' || upper(trim(p_request ->> 'flight_no')) || ':' || to_char(v_flight_datetime at time zone 'UTC', 'YYYYMMDDHH24MI'), 0
  ));

  select * into v_entitlement
  from public.membership_entitlements
  where id = p_entitlement_id
  for update;
  if not found or v_entitlement.site_user_id <> p_site_user_id or v_entitlement.status <> 'active'
     or (v_entitlement.valid_from is not null and v_entitlement.valid_from > current_date)
     or (v_entitlement.valid_until is not null and v_entitlement.valid_until < current_date) then
    raise exception using errcode = '23514', message = 'membership entitlement is not active for this member';
  end if;

  select a.* into v_advisor
  from public.admin_users a
  where a.id = coalesce(v_entitlement.advisor_admin_id, v_entitlement.created_by_admin_id, v_entitlement.granted_by_admin_id)
    and a.status = 'active';
  if not found then raise exception using errcode = '23514', message = 'membership entitlement has no active advisor'; end if;

  if p_claim_id is not null then
    select * into v_claim from public.membership_benefit_claims where id = p_claim_id for update;
    if not found or v_claim.entitlement_id <> p_entitlement_id or v_claim.site_user_id <> p_site_user_id
       or v_claim.membership_cycle <> v_entitlement.membership_cycle or v_claim.benefit_type <> 'pickup'
       or v_claim.status <> 'selected' or v_claim.linked_order_id is not null then
      raise exception using errcode = '23514', message = 'selected pickup claim is not available';
    end if;
  else
    select * into v_claim
    from public.membership_benefit_claims
    where entitlement_id = p_entitlement_id and status in ('selected', 'reserved', 'used', 'manual')
    order by created_at desc limit 1 for update;
    if found then
      if v_claim.benefit_type <> 'pickup' or v_claim.status <> 'selected' or v_claim.linked_order_id is not null then
        raise exception using errcode = '23514', message = 'membership cycle already has an unavailable live claim';
      end if;
    else
      insert into public.membership_benefit_claims (
        entitlement_id, benefit_type, status, selected_at, created_by_admin_id, updated_by_admin_id
      ) values (p_entitlement_id, 'pickup', 'selected', now(), p_admin_user_id, p_admin_user_id)
      returning * into v_claim;
    end if;
  end if;
  v_claim_before := to_jsonb(v_claim);

  if lower(trim(coalesce(p_request ->> 'email', ''))) is distinct from lower(trim(coalesce(v_member.email, ''))) then
    v_mismatch_fields := v_mismatch_fields || '"email"'::jsonb;
  end if;
  if regexp_replace(coalesce(p_request ->> 'phone', ''), '[^0-9+]', '', 'g') is distinct from regexp_replace(coalesce(v_member.phone, ''), '[^0-9+]', '', 'g') then
    v_mismatch_fields := v_mismatch_fields || '"phone"'::jsonb;
  end if;
  if lower(trim(coalesce(p_request ->> 'wechat', ''))) is distinct from lower(trim(coalesce(v_member.wechat_id, ''))) then
    v_mismatch_fields := v_mismatch_fields || '"wechat"'::jsonb;
  end if;
  if lower(trim(coalesce(p_request ->> 'student_name', ''))) is distinct from lower(trim(coalesce(v_member.nickname, ''))) then
    v_mismatch_fields := v_mismatch_fields || '"student_name"'::jsonb;
  end if;
  if jsonb_array_length(v_mismatch_fields) > 0 and not p_confirm_contact_mismatch then
    raise exception using errcode = 'P0001', message = 'member contact mismatch confirmation is required', detail = v_mismatch_fields::text;
  end if;

  select * into v_duplicate
  from public.transport_requests
  where site_user_id = p_site_user_id and service_type = 'pickup' and status in ('published', 'matched')
    and upper(trim(coalesce(flight_no, ''))) = upper(trim(p_request ->> 'flight_no'))
    and abs(extract(epoch from (flight_datetime - v_flight_datetime))) <= 3600
  order by abs(extract(epoch from (flight_datetime - v_flight_datetime))) limit 1
  for update;
  if found then
    v_duplicate_result := jsonb_build_object('level', 'possible', 'request_id', v_duplicate.id, 'order_no', v_duplicate.order_no);
    if v_duplicate.flight_datetime = v_flight_datetime then
      raise exception using errcode = '23505', message = 'exact duplicate membership pickup order exists', detail = v_duplicate.order_no;
    end if;
    if not p_confirm_duplicate then
      raise exception using errcode = 'P0001', message = 'possible duplicate membership pickup order requires confirmation', detail = v_duplicate_result::text;
    end if;
  else
    v_duplicate_result := jsonb_build_object('level', 'none');
  end if;

  if v_group_action = 'join_existing' then
    select * into v_group from public.transport_groups
    where group_id = trim(p_target_group_id) or id::text = trim(p_target_group_id)
    for update;
    if not found then raise exception using errcode = '23503', message = 'target transport group not found'; end if;
    if v_group.status not in ('single_member', 'active') then raise exception using errcode = 'P0001', message = 'target transport group is not open'; end if;
    if v_group.service_type <> 'pickup' or upper(trim(v_group.airport_code)) <> upper(trim(p_request ->> 'airport_code'))
       or v_group.group_date <> (v_service_time at time zone 'Europe/London')::date then
      raise exception using errcode = '23514', message = 'target transport group is incompatible';
    end if;
    select coalesce(sum(m.passenger_count_snapshot), 0)::integer into v_current
    from public.transport_group_members m join public.transport_requests r on r.id = m.request_id
    where m.group_id = v_group.group_id and r.status not in ('closed', 'cancelled');
    if v_current + v_passengers > v_group.max_passengers then
      raise exception using errcode = 'P0001', message = 'target transport group is full';
    end if;
    v_group_id := v_group.group_id;
  end if;

  v_order := public.allocate_order_no('pickup', 4);
  insert into public.transport_requests (
    order_no, order_type, business_date, site_user_id, service_type, student_name, email, phone, wechat,
    passenger_count, luggage_count, airport_code, airport_name, terminal, flight_no, flight_datetime,
    location_from, location_to, preferred_time_start, preferred_time_end, shareable, status, notes, admin_note,
    offline_recorded, source, created_by_admin_id, created_by_admin_name, contact_status, payment_collection_status,
    last_operated_by, last_operated_at, membership_benefit_claim_id, membership_discount_amount,
    extra_charge_amount, final_price, membership_discount_breakdown_json, membership_advisor_admin_id,
    membership_linked_at, membership_linked_by_admin_id
  ) values (
    v_order ->> 'order_no', 'pickup', (v_order ->> 'business_date')::date, p_site_user_id, 'pickup',
    trim(p_request ->> 'student_name'), nullif(trim(p_request ->> 'email'), ''), nullif(trim(p_request ->> 'phone'), ''), nullif(trim(p_request ->> 'wechat'), ''),
    v_passengers, v_luggage, upper(trim(p_request ->> 'airport_code')), nullif(trim(p_request ->> 'airport_name'), ''), trim(p_request ->> 'terminal'),
    upper(trim(p_request ->> 'flight_no')), v_flight_datetime, nullif(trim(p_request ->> 'location_from'), ''), trim(p_request ->> 'location_to'),
    v_service_time, nullif(p_request ->> 'preferred_time_end', '')::timestamptz, false, 'matched', nullif(p_request ->> 'notes', ''), nullif(p_request ->> 'admin_note', ''),
    true, 'admin_manual', p_admin_user_id, coalesce(v_admin.name, v_admin.username, v_admin.email), 'uncontacted', 'unpaid',
    coalesce(v_admin.name, v_admin.username, v_admin.email), now(), v_claim.id,
    coalesce((p_pricing ->> 'membership_discount_amount')::numeric, 0), coalesce((p_pricing ->> 'extra_charge_amount')::numeric, 0),
    nullif(p_pricing ->> 'final_price', '')::numeric, coalesce(p_pricing -> 'breakdown', '{}'::jsonb), v_advisor.id, now(), p_admin_user_id
  ) returning * into v_request;

  if v_failpoint = 'after_order' then raise exception 'test failpoint after_order'; end if;

  update public.membership_benefit_claims set
    status = 'reserved', reserved_at = now(), linked_order_table = 'transport_requests', linked_order_id = v_request.id,
    linked_order_no = v_request.order_no, membership_discount_amount = v_request.membership_discount_amount,
    extra_charge_amount = v_request.extra_charge_amount, final_price = v_request.final_price,
    discount_breakdown_json = v_request.membership_discount_breakdown_json, updated_by_admin_id = p_admin_user_id
  where id = v_claim.id and status = 'selected' and linked_order_id is null;
  if not found then raise exception using errcode = '23505', message = 'pickup claim was concurrently occupied'; end if;

  if v_failpoint = 'after_claim' then raise exception 'test failpoint after_claim'; end if;

  if v_group_action = 'create_single' then
    v_group_id := public.generate_transport_group_id();
    insert into public.transport_groups (
      group_id, service_type, group_date, airport_code, airport_name, terminal, location_from, location_to,
      flight_time_reference, preferred_time_start, preferred_time_end, max_passengers, visible_on_frontend, status, notes
    ) values (
      v_group_id, 'pickup', (v_service_time at time zone 'Europe/London')::date, v_request.airport_code, v_request.airport_name,
      v_request.terminal, v_request.location_from, v_request.location_to, v_request.flight_datetime,
      v_request.preferred_time_start, v_request.preferred_time_end, 8, true, 'single_member', v_request.notes
    ) returning * into v_group;
  end if;

  if v_failpoint = 'after_group' then raise exception 'test failpoint after_group'; end if;

  insert into public.transport_group_members (
    group_id, request_id, passenger_count_snapshot, luggage_count_snapshot, is_initiator
  ) values (v_group_id, v_request.id, v_passengers, v_luggage, v_group_action = 'create_single');

  if v_group_action = 'join_existing' then
    update public.transport_groups set status = case when v_current + v_passengers >= max_passengers then 'full' else 'active' end
    where id = v_group.id;
  end if;

  insert into public.admin_operation_logs (
    admin_user_id, order_id, target_type, target_id, action, before_data, after_data, metadata
  ) values (
    p_admin_user_id, null, 'transport_request', v_request.id, 'transport_membership_manual_create', null,
    jsonb_build_object('request_id', v_request.id, 'order_no', v_request.order_no, 'site_user_id', p_site_user_id,
      'entitlement_id', p_entitlement_id, 'claim_id', v_claim.id, 'advisor_admin_id', v_advisor.id,
      'group_id', v_group_id, 'group_action', v_group_action),
    jsonb_build_object('reason', v_reason, 'admin_role', v_admin.role, 'contact_mismatch_fields', v_mismatch_fields,
      'duplicate_result', v_duplicate_result, 'idempotency_key', p_idempotency_key)
  );
  insert into public.membership_audit_logs (
    admin_user_id, site_user_id, entitlement_id, claim_id, action, before_data, after_data, metadata
  ) values (
    p_admin_user_id, p_site_user_id, p_entitlement_id, v_claim.id, 'transport_membership_manual_order_created', v_claim_before,
    (select to_jsonb(c) from public.membership_benefit_claims c where c.id = v_claim.id),
    jsonb_build_object('request_id', v_request.id, 'order_no', v_request.order_no, 'advisor_admin_id', v_advisor.id,
      'group_id', v_group_id, 'group_action', v_group_action, 'reason', v_reason, 'contact_mismatch_fields', v_mismatch_fields,
      'duplicate_result', v_duplicate_result, 'idempotency_key', p_idempotency_key)
  );

  if v_failpoint = 'audit' then raise exception 'test failpoint audit'; end if;

  v_result := jsonb_build_object(
    'replayed', false, 'request_id', v_request.id, 'order_no', v_request.order_no, 'group_id', v_group_id,
    'group_action', v_group_action, 'claim_id', v_claim.id, 'entitlement_id', p_entitlement_id,
    'site_user_id', p_site_user_id, 'membership_advisor_admin_id', v_advisor.id,
    'contact_mismatch_fields', v_mismatch_fields, 'duplicate_result', v_duplicate_result
  );
  if v_failpoint = 'idempotency' then raise exception 'test failpoint idempotency'; end if;
  insert into public.transport_membership_manual_operations (
    admin_user_id, idempotency_key, payload_hash, request_id, group_id, claim_id, result_json
  ) values (p_admin_user_id, p_idempotency_key, p_payload_hash, v_request.id, v_group_id, v_claim.id, v_result);
  return v_result;
end;
$$;

revoke all on function public.admin_create_membership_transport_request_atomic(
  uuid, uuid, text, uuid, uuid, uuid, jsonb, jsonb, text, text, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.admin_create_membership_transport_request_atomic(
  uuid, uuid, text, uuid, uuid, uuid, jsonb, jsonb, text, text, text, boolean, boolean
) to service_role;

comment on function public.admin_create_membership_transport_request_atomic(
  uuid, uuid, text, uuid, uuid, uuid, jsonb, jsonb, text, text, text, boolean, boolean
) is 'Atomically creates an administrator-entered pickup order backed by a membership claim, group membership, audit logs and idempotency.';

notify pgrst, 'reload schema';
commit;
