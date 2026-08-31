-- Atomic administrator-managed transport request <-> membership benefit linking.
-- This migration deliberately stops when historical conflicts exist. It never
-- chooses, rewrites, or deletes conflicting production data automatically.

do $$
declare
  conflict_summary text;
begin
  select string_agg(format('%s => %s orders', membership_benefit_claim_id, order_count), '; ')
    into conflict_summary
  from (
    select membership_benefit_claim_id, count(*) as order_count
    from public.transport_requests
    where membership_benefit_claim_id is not null
    group by membership_benefit_claim_id
    having count(*) > 1
    order by membership_benefit_claim_id
    limit 20
  ) conflicts;

  if conflict_summary is not null then
    raise exception using
      errcode = '23505',
      message = 'transport membership migration blocked: one claim is referenced by multiple orders',
      detail = conflict_summary,
      hint = 'Run the read-only preflight queries in this migration, resolve each conflict explicitly, then retry.';
  end if;

  select string_agg(format('%s => %s live claims', linked_order_id, claim_count), '; ')
    into conflict_summary
  from (
    select linked_order_id, count(*) as claim_count
    from public.membership_benefit_claims
    where linked_order_table = 'transport_requests'
      and linked_order_id is not null
      and status in ('selected', 'reserved', 'used', 'manual')
    group by linked_order_id
    having count(*) > 1
    order by linked_order_id
    limit 20
  ) conflicts;

  if conflict_summary is not null then
    raise exception using
      errcode = '23505',
      message = 'transport membership migration blocked: one order has multiple live reverse claims',
      detail = conflict_summary,
      hint = 'Run the read-only preflight queries in this migration, resolve each conflict explicitly, then retry.';
  end if;

  with direct_transport_links as (
    select tr.id as request_id, tr.membership_benefit_claim_id as claim_id
    from public.transport_requests tr
    where tr.membership_benefit_claim_id is not null
  ), reverse_transport_links as (
    select claim.linked_order_id as request_id, claim.id as claim_id
    from public.membership_benefit_claims claim
    where claim.linked_order_table = 'transport_requests'
      and claim.linked_order_id is not null
      and claim.status in ('selected', 'reserved', 'used', 'manual')
  ), mismatched_request_ids as (
    select direct_link.request_id
    from direct_transport_links direct_link
    where not exists (
      select 1
      from reverse_transport_links reverse_link
      where reverse_link.request_id = direct_link.request_id
        and reverse_link.claim_id = direct_link.claim_id
    )
    union
    select reverse_link.request_id
    from reverse_transport_links reverse_link
    where not exists (
      select 1
      from direct_transport_links direct_link
      where direct_link.request_id = reverse_link.request_id
        and direct_link.claim_id = reverse_link.claim_id
    )
  )
  select string_agg(format('%s direct=%s reverse=%s', request_id, direct_claim_id, reverse_claim_id), '; ')
    into conflict_summary
  from (
    select
      mismatch.request_id,
      (select direct_link.claim_id from direct_transport_links direct_link where direct_link.request_id = mismatch.request_id limit 1) as direct_claim_id,
      (select reverse_link.claim_id from reverse_transport_links reverse_link where reverse_link.request_id = mismatch.request_id limit 1) as reverse_claim_id
    from mismatched_request_ids mismatch
    order by mismatch.request_id
    limit 20
  ) conflicts;

  if conflict_summary is not null then
    raise exception using
      errcode = '23514',
      message = 'transport membership migration blocked: direct and reverse membership links are inconsistent',
      detail = conflict_summary,
      hint = 'Do not auto-repair. Review each order and claim, preserve audit history, then retry the migration.';
  end if;
end;
$$;

-- Read-only preflight queries (safe to run before applying this migration):
-- select membership_benefit_claim_id, array_agg(id order by created_at, id) as request_ids
-- from public.transport_requests
-- where membership_benefit_claim_id is not null
-- group by membership_benefit_claim_id having count(*) > 1;
--
-- select linked_order_id, array_agg(id order by created_at, id) as claim_ids
-- from public.membership_benefit_claims
-- where linked_order_table = 'transport_requests'
--   and linked_order_id is not null
--   and status in ('selected', 'reserved', 'used', 'manual')
-- group by linked_order_id having count(*) > 1;
--
-- with direct_transport_links as (
--   select id as request_id, membership_benefit_claim_id as claim_id
--   from public.transport_requests where membership_benefit_claim_id is not null
-- ), reverse_transport_links as (
--   select linked_order_id as request_id, id as claim_id
--   from public.membership_benefit_claims
--   where linked_order_table = 'transport_requests'
--     and linked_order_id is not null
--     and status in ('selected', 'reserved', 'used', 'manual')
-- )
-- select 'direct_without_matching_reverse' as mismatch_type, direct_link.request_id, direct_link.claim_id
-- from direct_transport_links direct_link
-- where not exists (
--   select 1 from reverse_transport_links reverse_link
--   where reverse_link.request_id = direct_link.request_id and reverse_link.claim_id = direct_link.claim_id
-- )
-- union all
-- select 'reverse_without_matching_direct', reverse_link.request_id, reverse_link.claim_id
-- from reverse_transport_links reverse_link
-- where not exists (
--   select 1 from direct_transport_links direct_link
--   where direct_link.request_id = reverse_link.request_id and direct_link.claim_id = reverse_link.claim_id
-- );

alter table public.transport_requests
  add column if not exists membership_advisor_admin_id uuid references public.admin_users(id) on delete set null,
  add column if not exists membership_linked_at timestamptz,
  add column if not exists membership_linked_by_admin_id uuid references public.admin_users(id) on delete set null,
  add column if not exists membership_site_user_id_before_link uuid references public.site_users(id) on delete set null;

create unique index if not exists idx_transport_requests_one_order_per_membership_claim
  on public.transport_requests (membership_benefit_claim_id)
  where membership_benefit_claim_id is not null;

create unique index if not exists idx_membership_claims_one_live_transport_order
  on public.membership_benefit_claims (linked_order_id)
  where linked_order_table = 'transport_requests'
    and linked_order_id is not null
    and status in ('selected', 'reserved', 'used', 'manual');

create index if not exists idx_transport_requests_membership_advisor
  on public.transport_requests (membership_advisor_admin_id, created_at desc)
  where membership_advisor_admin_id is not null;

-- Rebuild the admin-only projection so historical transport ownership uses the
-- order snapshot first while still exposing the current entitlement advisor as
-- a separate field for later UI work.
drop view if exists public.admin_transport_requests_membership_view;
create view public.admin_transport_requests_membership_view
with (security_invoker = true, security_barrier = true)
as
select
  tr.*,
  case
    when tr.membership_benefit_claim_id is not null then 'linked'
    when coalesce(reverse_claim.reverse_claim_count, 0) > 0 then 'linked'
    else 'unlinked'
  end as membership_relation,
  (tr.membership_benefit_claim_id is not null or coalesce(reverse_claim.reverse_claim_count, 0) > 0) as is_membership_order,
  case
    when tr.membership_benefit_claim_id is not null then tr.membership_benefit_claim_id
    when reverse_claim.reverse_claim_count = 1 then reverse_claim.sole_reverse_claim_id
    else null
  end as resolved_membership_claim_id,
  selected_claim.entitlement_id as membership_entitlement_id,
  case
    when selected_claim.id is null or entitlement.id is null then null
    else coalesce(
      tr.membership_advisor_admin_id,
      entitlement.advisor_admin_id,
      entitlement.created_by_admin_id,
      entitlement.granted_by_admin_id,
      activation_code.generated_by_admin_id
    )
  end as effective_membership_advisor_id,
  case
    when selected_claim.id is null or entitlement.id is null then null
    else coalesce(
      entitlement.advisor_admin_id,
      entitlement.created_by_admin_id,
      entitlement.granted_by_admin_id,
      activation_code.generated_by_admin_id
    )
  end as current_membership_advisor_id,
  case
    when tr.membership_benefit_claim_id is not null and selected_claim.id is not null then 'direct'
    when tr.membership_benefit_claim_id is not null and selected_claim.id is null then 'direct_missing'
    when reverse_claim.reverse_claim_count = 1 then 'reverse_unique'
    when reverse_claim.reverse_claim_count > 1 then 'reverse_ambiguous'
    else 'unlinked'
  end as membership_claim_resolution,
  case
    when tr.membership_benefit_claim_id is null and coalesce(reverse_claim.reverse_claim_count, 0) = 0 then null
    when tr.membership_benefit_claim_id is null and reverse_claim.reverse_claim_count > 1 then 'ambiguous'
    when selected_claim.id is null or entitlement.id is null then 'ambiguous'
    when coalesce(
      tr.membership_advisor_admin_id,
      entitlement.advisor_admin_id,
      entitlement.created_by_admin_id,
      entitlement.granted_by_admin_id,
      activation_code.generated_by_admin_id
    ) is null then 'unassigned'
    else 'assigned'
  end as membership_advisor_resolution,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'group_id', member.group_id,
        'is_initiator', member.is_initiator,
        'request_id', member.request_id
      ) order by member.created_at)
      from public.transport_group_members member
      where member.request_id = tr.id
    ),
    '[]'::jsonb
  ) as transport_group_members,
  case when site_user.id is null then null else jsonb_build_object('email', site_user.email) end as site_users,
  exists (
    select 1 from public.transport_group_members grouped_member where grouped_member.request_id = tr.id
  ) as is_grouped
from public.transport_requests tr
left join lateral (
  select
    count(*)::integer as reverse_claim_count,
    case when count(*) = 1 then (array_agg(claim.id order by claim.created_at, claim.id))[1] else null end as sole_reverse_claim_id
  from public.membership_benefit_claims claim
  where tr.membership_benefit_claim_id is null
    and claim.linked_order_table = 'transport_requests'
    and claim.linked_order_id = tr.id
) reverse_claim on true
left join public.membership_benefit_claims selected_claim
  on selected_claim.id = case
    when tr.membership_benefit_claim_id is not null then tr.membership_benefit_claim_id
    when reverse_claim.reverse_claim_count = 1 then reverse_claim.sole_reverse_claim_id
    else null
  end
left join public.membership_entitlements entitlement on entitlement.id = selected_claim.entitlement_id
left join public.membership_activation_codes activation_code on activation_code.id::text = entitlement.metadata ->> 'activation_code_id'
left join public.site_users site_user on site_user.id = tr.site_user_id;

revoke all on table public.admin_transport_requests_membership_view from public, anon, authenticated;
grant select on table public.admin_transport_requests_membership_view to service_role;

create table if not exists public.transport_membership_admin_operations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  idempotency_key uuid not null,
  payload_hash text not null,
  action text not null check (action in ('link', 'replace', 'unlink')),
  request_id uuid references public.transport_requests(id) on delete set null,
  result_json jsonb,
  created_at timestamptz not null default now(),
  constraint transport_membership_admin_operations_admin_key_unique
    unique (admin_user_id, idempotency_key)
);

create index if not exists idx_transport_membership_admin_operations_request_created
  on public.transport_membership_admin_operations (request_id, created_at desc);

alter table public.transport_membership_admin_operations enable row level security;
alter table public.transport_membership_admin_operations force row level security;
revoke all on table public.transport_membership_admin_operations from public, anon, authenticated;
grant select, insert, update on table public.transport_membership_admin_operations to service_role;

-- transport_requests is an admin/service-owned table. Repeat the project-wide
-- hardening here so the newly added membership linkage columns cannot become
-- reachable when this migration is applied without the legacy baseline script.
revoke all on table public.transport_requests from public, anon, authenticated;
revoke all on table public.membership_audit_logs from public, anon, authenticated;

create or replace function public.admin_manage_transport_membership_link(
  p_admin_user_id uuid,
  p_idempotency_key uuid,
  p_action text,
  p_request_id uuid,
  p_entitlement_id uuid default null,
  p_claim_id uuid default null,
  p_expected_current_claim_id uuid default null,
  p_reason text default null,
  p_confirm_used boolean default false,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin public.admin_users%rowtype;
  v_request public.transport_requests%rowtype;
  v_entitlement public.membership_entitlements%rowtype;
  v_target_claim public.membership_benefit_claims%rowtype;
  v_old_claim public.membership_benefit_claims%rowtype;
  v_live_claim public.membership_benefit_claims%rowtype;
  v_existing_operation public.transport_membership_admin_operations%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_payload_hash text;
  v_advisor_id uuid;
  v_activation_code_id uuid;
  v_now timestamptz := clock_timestamp();
  v_reverse_claim_ids uuid[];
  v_result jsonb;
  v_before jsonb;
  v_after jsonb;
  v_old_claim_after jsonb;
  v_reverse_claims_after jsonb := '[]'::jsonb;
  v_linked_site_user_changed boolean := false;
  v_service_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
begin
  -- PostgREST invokes this SECURITY DEFINER function through the service-role
  -- JWT. Direct maintenance/test calls are allowed only from a postgres-owned
  -- database session. This guard remains effective even if EXECUTE is granted
  -- too broadly by a later migration.
  if session_user <> 'postgres' and v_service_jwt_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'trusted server database role is required';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'idempotency_key is required';
  end if;
  if v_action not in ('link', 'replace', 'unlink') then
    raise exception using errcode = '22023', message = 'action must be link, replace, or unlink';
  end if;
  if v_reason = '' then
    raise exception using errcode = '22023', message = 'operation reason is required';
  end if;

  select * into v_admin
  from public.admin_users
  where id = p_admin_user_id
  for update;
  if not found or v_admin.status <> 'active' then
    raise exception using errcode = '42501', message = 'active administrator is required';
  end if;
  if v_admin.role not in ('operations_admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'administrator role cannot manage transport membership links';
  end if;
  if p_force and v_admin.role <> 'super_admin' then
    raise exception using errcode = '42501', message = 'only super_admin may force conflict handling';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'action', v_action,
    'request_id', p_request_id,
    'entitlement_id', p_entitlement_id,
    'claim_id', p_claim_id,
    'expected_current_claim_id', p_expected_current_claim_id,
    'reason', v_reason,
    'confirm_used', coalesce(p_confirm_used, false),
    'force', coalesce(p_force, false)
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_admin_user_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing_operation
  from public.transport_membership_admin_operations
  where admin_user_id = p_admin_user_id
    and idempotency_key = p_idempotency_key;
  if found then
    if v_existing_operation.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'idempotency key was already used with a different payload';
    end if;
    if v_existing_operation.result_json is null then
      raise exception using errcode = '40001', message = 'matching idempotent operation is still in progress';
    end if;
    return v_existing_operation.result_json || jsonb_build_object('idempotent_replay', true);
  end if;

  select * into v_request
  from public.transport_requests
  where id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'transport request not found';
  end if;
  if v_request.service_type <> 'pickup' then
    raise exception using errcode = '22023', message = 'membership benefit linking is only supported for pickup requests';
  end if;
  if v_request.membership_benefit_claim_id is distinct from p_expected_current_claim_id then
    raise exception using errcode = '23514', message = 'transport membership link changed; refresh and retry';
  end if;

  select array_agg(id order by created_at, id) into v_reverse_claim_ids
  from (
    select id, created_at
    from public.membership_benefit_claims
    where linked_order_table = 'transport_requests'
      and linked_order_id = v_request.id
      and status in ('selected', 'reserved', 'used', 'manual')
      and (v_request.membership_benefit_claim_id is null or id <> v_request.membership_benefit_claim_id)
    order by created_at, id
    for update
  ) locked_reverse_claims;
  if coalesce(array_length(v_reverse_claim_ids, 1), 0) > 0 and not (p_force and v_admin.role = 'super_admin') then
    raise exception using errcode = '23505', message = 'transport request has conflicting reverse membership claims; super_admin force handling is required';
  end if;

  if v_request.membership_benefit_claim_id is not null then
    select * into v_old_claim
    from public.membership_benefit_claims
    where id = v_request.membership_benefit_claim_id
    for update;
    if not found and not (p_force and v_admin.role = 'super_admin') then
      raise exception using errcode = '23503', message = 'current membership claim is missing; super_admin force handling is required';
    end if;
  end if;

  if v_action = 'link' and v_request.membership_benefit_claim_id is not null then
    raise exception using errcode = '23505', message = 'transport request is already linked; use replace';
  end if;
  if v_action in ('replace', 'unlink') and v_request.membership_benefit_claim_id is null
     and coalesce(array_length(v_reverse_claim_ids, 1), 0) = 0 then
    raise exception using errcode = 'P0002', message = 'transport request has no membership link to change';
  end if;

  if v_action in ('replace', 'unlink') and v_old_claim.id is not null and v_old_claim.status = 'used' then
    if v_admin.role <> 'super_admin' or not coalesce(p_confirm_used, false) then
      raise exception using errcode = '42501', message = 'unlinking a used membership claim requires super_admin confirmation';
    end if;
  end if;

  if v_action in ('replace', 'unlink')
     and v_old_claim.id is not null
     and v_request.membership_linked_at is not null
     and v_request.site_user_id is distinct from v_old_claim.site_user_id then
    v_linked_site_user_changed := true;
    if not (p_force and v_admin.role = 'super_admin') then
      raise exception using errcode = '23514', message = 'transport request site user changed after membership link; super_admin force correction is required';
    end if;
  end if;
  if coalesce(array_length(v_reverse_claim_ids, 1), 0) > 0
     and exists (
       select 1 from public.membership_benefit_claims
       where id = any(v_reverse_claim_ids) and status = 'used'
     )
     and (v_admin.role <> 'super_admin' or not coalesce(p_confirm_used, false)) then
    raise exception using errcode = '42501', message = 'force-unlinking a used reverse membership claim requires super_admin confirmation';
  end if;

  if v_action in ('link', 'replace') then
    if p_entitlement_id is null then
      raise exception using errcode = '22023', message = 'entitlement_id is required';
    end if;
    select * into v_entitlement
    from public.membership_entitlements
    where id = p_entitlement_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'membership entitlement not found';
    end if;
    if v_entitlement.status <> 'active'
       or (v_entitlement.valid_from is not null and v_entitlement.valid_from > current_date)
       or (v_entitlement.valid_until is not null and v_entitlement.valid_until < current_date) then
      raise exception using errcode = '22023', message = 'membership entitlement is not currently active';
    end if;

    select * into v_live_claim
    from public.membership_benefit_claims
    where site_user_id = v_entitlement.site_user_id
      and membership_cycle = v_entitlement.membership_cycle
      and status in ('selected', 'reserved', 'used', 'manual')
    order by created_at desc, id
    limit 1
    for update;

    if p_claim_id is not null then
      select * into v_target_claim
      from public.membership_benefit_claims
      where id = p_claim_id
      for update;
      if not found then
        raise exception using errcode = 'P0002', message = 'membership claim not found';
      end if;
      if v_target_claim.entitlement_id <> v_entitlement.id
         or v_target_claim.site_user_id <> v_entitlement.site_user_id
         or v_target_claim.membership_cycle <> v_entitlement.membership_cycle then
        raise exception using errcode = '23514', message = 'entitlement, claim, and member identity do not match';
      end if;
      if v_live_claim.id is not null and v_live_claim.id <> v_target_claim.id
         and (v_old_claim.id is null or v_live_claim.id <> v_old_claim.id) then
        raise exception using errcode = '23505', message = 'member already has another live benefit claim for this cycle';
      end if;
    else
      if v_live_claim.id is null then
        insert into public.membership_benefit_claims (
          entitlement_id, benefit_type, status, selected_at, created_by_admin_id, updated_by_admin_id
        ) values (
          v_entitlement.id, 'pickup', 'selected', v_now, p_admin_user_id, p_admin_user_id
        ) returning * into v_target_claim;
      elsif v_old_claim.id is not null and v_live_claim.id = v_old_claim.id and v_live_claim.entitlement_id <> v_entitlement.id then
        raise exception using errcode = '23505', message = 'member already has another live benefit claim for this cycle';
      else
        v_target_claim := v_live_claim;
      end if;
    end if;

    if v_target_claim.benefit_type <> 'pickup' then
      raise exception using errcode = '23514', message = 'selected membership claim is not a pickup benefit';
    end if;
    if v_target_claim.status not in ('selected', 'reserved') then
      raise exception using errcode = '23514', message = 'selected pickup claim is not available';
    end if;
    if v_target_claim.linked_order_id is not null and v_target_claim.linked_order_id <> v_request.id then
      raise exception using errcode = '23505', message = 'selected pickup claim is already linked to another order';
    end if;
    if exists (
      select 1 from public.transport_requests other
      where other.membership_benefit_claim_id = v_target_claim.id
        and other.id <> v_request.id
    ) then
      raise exception using errcode = '23505', message = 'selected pickup claim is referenced by another order';
    end if;

    begin
      v_activation_code_id := nullif(v_entitlement.metadata ->> 'activation_code_id', '')::uuid;
    exception when invalid_text_representation then
      v_activation_code_id := null;
    end;
    select coalesce(
      v_entitlement.advisor_admin_id,
      v_entitlement.created_by_admin_id,
      v_entitlement.granted_by_admin_id,
      (select generated_by_admin_id from public.membership_activation_codes where id = v_activation_code_id)
    ) into v_advisor_id;
  end if;

  v_before := jsonb_build_object(
    'request', to_jsonb(v_request),
    'claim', case when v_old_claim.id is null then null else to_jsonb(v_old_claim) end,
    'conflicting_reverse_claims', case
      when coalesce(array_length(v_reverse_claim_ids, 1), 0) = 0 then '[]'::jsonb
      else (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb)
            from public.membership_benefit_claims c where c.id = any(v_reverse_claim_ids))
    end
  );

  insert into public.transport_membership_admin_operations (
    admin_user_id, idempotency_key, payload_hash, action, request_id
  ) values (
    p_admin_user_id, p_idempotency_key, v_payload_hash, v_action, v_request.id
  );

  if v_action in ('replace', 'unlink') and v_old_claim.id is not null then
    update public.membership_benefit_claims
    set status = case when v_old_claim.status = 'used' then 'used' else 'selected' end,
        reserved_at = case when v_old_claim.status = 'used' then reserved_at else null end,
        linked_order_table = null,
        linked_order_id = null,
        linked_order_no = null,
        updated_by_admin_id = p_admin_user_id
    where id = v_old_claim.id
    returning to_jsonb(membership_benefit_claims) into v_old_claim_after;
  end if;

  if p_force and coalesce(array_length(v_reverse_claim_ids, 1), 0) > 0 then
    update public.membership_benefit_claims
    set status = case when status = 'used' then 'used' else 'selected' end,
        reserved_at = case when status = 'used' then reserved_at else null end,
        linked_order_table = null,
        linked_order_id = null,
        linked_order_no = null,
        updated_by_admin_id = p_admin_user_id
    where id = any(v_reverse_claim_ids);

    select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at, c.id), '[]'::jsonb)
      into v_reverse_claims_after
    from public.membership_benefit_claims c
    where c.id = any(v_reverse_claim_ids);
  end if;

  if v_action = 'unlink' then
    update public.transport_requests
    set site_user_id = case
          when v_linked_site_user_changed then site_user_id
          when membership_linked_at is not null then membership_site_user_id_before_link
          else site_user_id
        end,
        membership_benefit_claim_id = null,
        membership_advisor_admin_id = null,
        membership_linked_at = null,
        membership_linked_by_admin_id = null,
        membership_site_user_id_before_link = null
    where id = v_request.id
    returning to_jsonb(transport_requests) into v_after;
  else
    update public.membership_benefit_claims
    set status = 'reserved',
        reserved_at = coalesce(reserved_at, v_now),
        linked_order_table = 'transport_requests',
        linked_order_id = v_request.id,
        linked_order_no = v_request.order_no,
        updated_by_admin_id = p_admin_user_id
    where id = v_target_claim.id;

    update public.transport_requests
    set site_user_id = v_entitlement.site_user_id,
        membership_benefit_claim_id = v_target_claim.id,
        membership_advisor_admin_id = v_advisor_id,
        membership_linked_at = v_now,
        membership_linked_by_admin_id = p_admin_user_id,
        membership_site_user_id_before_link = case
          when v_action = 'link' then v_request.site_user_id
          else v_request.membership_site_user_id_before_link
        end
    where id = v_request.id
    returning to_jsonb(transport_requests) into v_after;
  end if;

  insert into public.membership_audit_logs (
    admin_user_id, site_user_id, entitlement_id, claim_id, action, before_data, after_data, metadata
  ) values (
    p_admin_user_id,
    coalesce(v_entitlement.site_user_id, v_old_claim.site_user_id, v_request.site_user_id),
    coalesce(v_entitlement.id, v_old_claim.entitlement_id),
    coalesce(v_target_claim.id, v_old_claim.id),
    'transport_membership_' || v_action,
    v_before,
    jsonb_build_object(
      'request', v_after,
      'target_claim_id', v_target_claim.id,
      'previous_claim', v_old_claim_after,
      'conflicting_reverse_claims', v_reverse_claims_after
    ),
    jsonb_build_object('reason', v_reason, 'request_id', v_request.id, 'order_no', v_request.order_no,
      'idempotency_key', p_idempotency_key, 'forced', coalesce(p_force, false),
      'confirmed_used', coalesce(p_confirm_used, false),
      'site_user_changed_after_link', v_linked_site_user_changed,
      'historical_usage', case when v_old_claim.status = 'used' then jsonb_build_object(
        'order_id', v_request.id,
        'order_no', v_request.order_no,
        'site_user_id', v_old_claim.site_user_id,
        'entitlement_id', v_old_claim.entitlement_id,
        'claim_id', v_old_claim.id,
        'advisor_admin_id', v_request.membership_advisor_admin_id,
        'operator_admin_id', p_admin_user_id,
        'operated_at', v_now,
        'reason', v_reason,
        'before', to_jsonb(v_old_claim),
        'after', v_old_claim_after
      ) else null end)
  );

  insert into public.admin_operation_logs (
    admin_user_id, target_type, target_id, action, before_data, after_data, metadata
  ) values (
    p_admin_user_id, 'transport_request', v_request.id, 'transport_membership_' || v_action,
    v_before, jsonb_build_object(
      'request', v_after,
      'target_claim_id', v_target_claim.id,
      'previous_claim', v_old_claim_after,
      'conflicting_reverse_claims', v_reverse_claims_after
    ),
    jsonb_build_object('reason', v_reason, 'entitlement_id', p_entitlement_id,
      'old_claim_id', v_old_claim.id, 'new_claim_id', v_target_claim.id,
      'advisor_snapshot_id', v_advisor_id, 'idempotency_key', p_idempotency_key,
      'forced', coalesce(p_force, false), 'confirmed_used', coalesce(p_confirm_used, false),
      'site_user_changed_after_link', v_linked_site_user_changed,
      'historical_usage', case when v_old_claim.status = 'used' then jsonb_build_object(
        'order_id', v_request.id,
        'order_no', v_request.order_no,
        'site_user_id', v_old_claim.site_user_id,
        'entitlement_id', v_old_claim.entitlement_id,
        'claim_id', v_old_claim.id,
        'advisor_admin_id', v_request.membership_advisor_admin_id,
        'operator_admin_id', p_admin_user_id,
        'operated_at', v_now,
        'reason', v_reason,
        'before', to_jsonb(v_old_claim),
        'after', v_old_claim_after
      ) else null end)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'action', v_action,
    'request_id', v_request.id,
    'order_no', v_request.order_no,
    'site_user_id', case when v_action = 'unlink' then v_request.site_user_id else v_entitlement.site_user_id end,
    'membership_claim_id', case when v_action = 'unlink' then null else v_target_claim.id end,
    'membership_entitlement_id', case when v_action = 'unlink' then null else v_entitlement.id end,
    'membership_advisor_admin_id', case when v_action = 'unlink' then null else v_advisor_id end,
    'previous_membership_claim_id', v_old_claim.id,
    'idempotent_replay', false
  );

  update public.transport_membership_admin_operations
  set result_json = v_result
  where admin_user_id = p_admin_user_id
    and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

revoke all on function public.admin_manage_transport_membership_link(
  uuid, uuid, text, uuid, uuid, uuid, uuid, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.admin_manage_transport_membership_link(
  uuid, uuid, text, uuid, uuid, uuid, uuid, text, boolean, boolean
) to service_role;

comment on function public.admin_manage_transport_membership_link(
  uuid, uuid, text, uuid, uuid, uuid, uuid, text, boolean, boolean
) is 'Atomically link, replace, or unlink a pickup transport request membership claim with administrator authorization, audit, concurrency, and idempotency guards.';

notify pgrst, 'reload schema';
