begin;

alter table public.transport_requests
  add column if not exists join_submission_id uuid,
  add column if not exists join_submission_payload_hash text;

create unique index if not exists idx_transport_requests_join_submission_unique
  on public.transport_requests (site_user_id, join_submission_id)
  where join_submission_id is not null;

create or replace function public.enforce_transport_group_member_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_group public.transport_groups%rowtype;
  v_current integer;
  v_new_status text;
  v_new_passengers integer;
begin
  select * into v_group
  from public.transport_groups
  where group_id = new.group_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'transport_group_not_found';
  end if;

  select status, passenger_count
    into v_new_status, v_new_passengers
  from public.transport_requests
  where id = new.request_id;

  if not found then
    raise exception using errcode = '23503', message = 'transport_request_not_found';
  end if;

  select coalesce(sum(m.passenger_count_snapshot), 0)::integer
    into v_current
  from public.transport_group_members m
  join public.transport_requests r on r.id = m.request_id
  where m.group_id = new.group_id
    and r.status not in ('closed', 'cancelled')
    and (tg_op <> 'UPDATE' or m.id <> old.id);

  if v_new_status not in ('closed', 'cancelled') then
    v_current := v_current + new.passenger_count_snapshot;
  end if;

  if v_current > v_group.max_passengers then
    raise exception using errcode = 'P0001', message = 'transport_group_capacity_exceeded';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_transport_group_member_capacity on public.transport_group_members;
create trigger trg_transport_group_member_capacity
before insert or update of group_id, request_id, passenger_count_snapshot
on public.transport_group_members
for each row execute function public.enforce_transport_group_member_capacity();

create or replace function public.join_transport_group_atomic(
  p_site_user_id uuid,
  p_submission_id uuid,
  p_payload_hash text,
  p_target_request_id uuid,
  p_request jsonb,
  p_membership_claim_id uuid default null,
  p_membership jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service_type text := lower(trim(coalesce(p_request->>'service_type', '')));
  v_existing public.transport_requests%rowtype;
  v_target public.transport_requests%rowtype;
  v_group public.transport_groups%rowtype;
  v_request public.transport_requests%rowtype;
  v_order jsonb;
  v_current integer;
  v_passengers integer := coalesce((p_request->>'passenger_count')::integer, 0);
  v_luggage integer := coalesce((p_request->>'luggage_count')::integer, 0);
  v_replay_group_id text;
begin
  if p_site_user_id is null or p_submission_id is null or nullif(trim(p_payload_hash), '') is null then
    raise exception using errcode = '22023', message = 'transport_join_invalid_submission';
  end if;
  if v_service_type not in ('pickup', 'dropoff') or v_passengers <= 0 or v_luggage < 0 then
    raise exception using errcode = '22023', message = 'transport_join_invalid_payload';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('transport_join_user:' || p_site_user_id::text || ':' || v_service_type, 0));

  select * into v_existing
  from public.transport_requests
  where site_user_id = p_site_user_id and join_submission_id = p_submission_id
  limit 1;

  if found then
    if v_existing.join_submission_payload_hash is distinct from p_payload_hash then
      raise exception using errcode = 'P0001', message = 'transport_join_submission_conflict';
    end if;
    select group_id into v_replay_group_id
    from public.transport_group_members where request_id = v_existing.id limit 1;
    return jsonb_build_object(
      'replayed', true, 'request_id', v_existing.id, 'order_no', v_existing.order_no,
      'group_id', v_replay_group_id, 'status', v_existing.status
    );
  end if;

  select * into v_target from public.transport_requests where id = p_target_request_id;
  if not found then raise exception using errcode = 'P0001', message = 'transport_join_target_not_found'; end if;

  select g.* into v_group
  from public.transport_group_members m
  join public.transport_groups g on g.group_id = m.group_id
  where m.request_id = p_target_request_id
  for update of g;
  if not found then raise exception using errcode = 'P0001', message = 'transport_join_target_not_found'; end if;
  if v_group.status not in ('single_member', 'active', 'open') then raise exception using errcode = 'P0001', message = 'transport_join_group_not_open'; end if;
  if v_group.visible_on_frontend is not true then raise exception using errcode = 'P0001', message = 'transport_join_group_hidden'; end if;
  if coalesce(v_group.flight_time_reference, v_target.flight_datetime) <= now() then raise exception using errcode = 'P0001', message = 'transport_join_group_expired'; end if;
  if v_group.service_type <> v_service_type then raise exception using errcode = 'P0001', message = 'transport_join_service_mismatch'; end if;
  if upper(trim(v_group.airport_code)) <> upper(trim(coalesce(p_request->>'airport_code', ''))) then raise exception using errcode = 'P0001', message = 'transport_join_airport_mismatch'; end if;

  select * into v_existing
  from public.transport_requests
  where site_user_id = p_site_user_id
    and service_type = v_service_type
    and status in ('published', 'matched')
    and flight_datetime > now()
  order by flight_datetime, created_at
  limit 1;
  if found then raise exception using errcode = 'P0001', message = 'transport_join_existing_future_request'; end if;

  select coalesce(sum(m.passenger_count_snapshot), 0)::integer into v_current
  from public.transport_group_members m
  join public.transport_requests r on r.id = m.request_id
  where m.group_id = v_group.group_id and r.status not in ('closed', 'cancelled');
  if v_current + v_passengers > v_group.max_passengers then
    raise exception using errcode = 'P0001', message = 'transport_join_group_full';
  end if;

  if p_membership_claim_id is not null then
    perform 1 from public.membership_benefit_claims
    where id = p_membership_claim_id and site_user_id = p_site_user_id
      and status in ('selected', 'reserved') and linked_order_id is null
    for update;
    if not found then raise exception using errcode = 'P0001', message = 'transport_join_membership_claim_unavailable'; end if;
  end if;

  v_order := public.allocate_order_no('pickup', 4);
  insert into public.transport_requests (
    order_no, order_type, business_date, site_user_id, service_type, student_name, email, phone, wechat,
    passenger_count, luggage_count, airport_code, airport_name, terminal, flight_no, flight_datetime,
    location_from, location_to, preferred_time_start, preferred_time_end, shareable, status, notes,
    email_verified_snapshot, profile_verified_snapshot, membership_benefit_claim_id,
    membership_discount_amount, extra_charge_amount, final_price, membership_discount_breakdown_json,
    join_submission_id, join_submission_payload_hash
  ) values (
    v_order->>'order_no', 'pickup', (v_order->>'business_date')::date, p_site_user_id, v_service_type,
    p_request->>'student_name', nullif(p_request->>'email',''), nullif(p_request->>'phone',''), nullif(p_request->>'wechat',''),
    v_passengers, v_luggage, p_request->>'airport_code', p_request->>'airport_name', nullif(p_request->>'terminal',''),
    nullif(p_request->>'flight_no',''), (p_request->>'flight_datetime')::timestamptz,
    p_request->>'location_from', p_request->>'location_to', nullif(p_request->>'preferred_time_start','')::timestamptz,
    nullif(p_request->>'preferred_time_end','')::timestamptz, true, 'matched', nullif(p_request->>'notes',''),
    true, true, p_membership_claim_id, coalesce((p_membership->>'membership_discount_amount')::numeric,0),
    coalesce((p_membership->>'extra_charge_amount')::numeric,0), nullif(p_membership->>'final_price','')::numeric,
    coalesce(p_membership->'breakdown','{}'::jsonb), p_submission_id, p_payload_hash
  ) returning * into v_request;

  insert into public.transport_group_members(group_id, request_id, passenger_count_snapshot, luggage_count_snapshot, is_initiator)
  values(v_group.group_id, v_request.id, v_passengers, v_luggage, false);

  update public.transport_requests set status = 'matched'
  where id in (select request_id from public.transport_group_members where group_id = v_group.group_id)
    and status <> 'closed';
  update public.transport_groups
  set status = case when v_current + v_passengers >= max_passengers then 'full' else 'active' end
  where id = v_group.id;

  if p_membership_claim_id is not null then
    update public.membership_benefit_claims set
      status='reserved', reserved_at=now(), linked_order_table='transport_requests', linked_order_id=v_request.id,
      linked_order_no=v_request.order_no,
      membership_discount_amount=coalesce((p_membership->>'membership_discount_amount')::numeric,0),
      extra_charge_amount=coalesce((p_membership->>'extra_charge_amount')::numeric,0),
      final_price=nullif(p_membership->>'final_price','')::numeric,
      discount_breakdown_json=coalesce(p_membership->'breakdown','{}'::jsonb)
    where id=p_membership_claim_id;
  end if;

  return jsonb_build_object(
    'replayed', false, 'request_id', v_request.id, 'order_no', v_request.order_no,
    'group_id', v_group.group_id, 'status', v_request.status,
    'current_passenger_count', v_current + v_passengers, 'max_passengers', v_group.max_passengers
  );
end;
$$;

revoke all on function public.join_transport_group_atomic(uuid,uuid,text,uuid,jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.join_transport_group_atomic(uuid,uuid,text,uuid,jsonb,uuid,jsonb) to service_role;

commit;
