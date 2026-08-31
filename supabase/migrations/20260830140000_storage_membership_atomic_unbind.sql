begin;

create table if not exists public.storage_membership_unbind_operations (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  idempotency_key uuid not null,
  payload_hash text not null,
  claim_id uuid references public.membership_benefit_claims(id) on delete set null,
  storage_order_id uuid references public.storage_orders(id) on delete set null,
  result_json jsonb,
  created_at timestamptz not null default now(),
  constraint storage_membership_unbind_operations_admin_key_unique unique (admin_user_id, idempotency_key)
);

create index if not exists idx_storage_membership_unbind_operations_order_created
  on public.storage_membership_unbind_operations (storage_order_id, created_at desc);

alter table public.storage_membership_unbind_operations enable row level security;
alter table public.storage_membership_unbind_operations force row level security;
revoke all on table public.storage_membership_unbind_operations from public, anon, authenticated;
grant select, insert, update on table public.storage_membership_unbind_operations to service_role;

create or replace function public.admin_unbind_storage_membership_claim_atomic(
  p_admin_user_id uuid,
  p_idempotency_key uuid,
  p_claim_id uuid,
  p_expected_storage_order_id uuid,
  p_expected_claim_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin public.admin_users%rowtype;
  v_claim public.membership_benefit_claims%rowtype;
  v_order public.storage_orders%rowtype;
  v_existing public.storage_membership_unbind_operations%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_expected_status text := lower(trim(coalesce(p_expected_claim_status, '')));
  v_payload_hash text;
  v_now timestamptz := clock_timestamp();
  v_claim_after jsonb;
  v_order_after jsonb;
  v_result jsonb;
  v_service_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
begin
  if session_user <> 'postgres' and v_service_jwt_role is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'trusted server database role is required';
  end if;
  if p_idempotency_key is null or p_claim_id is null or p_expected_storage_order_id is null then
    raise exception using errcode = '22023', message = 'idempotency_key, claim_id, and expected_storage_order_id are required';
  end if;
  if v_expected_status = '' then
    raise exception using errcode = '22023', message = 'expected_claim_status is required';
  end if;
  if v_reason = '' then
    raise exception using errcode = '22023', message = 'operation reason is required';
  end if;

  select * into v_admin from public.admin_users where id = p_admin_user_id for update;
  if not found or v_admin.status <> 'active' then
    raise exception using errcode = '42501', message = 'active administrator is required';
  end if;
  if v_admin.role not in ('operations_admin', 'super_admin') then
    raise exception using errcode = '42501', message = 'administrator role cannot unlink storage membership claims';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'claim_id', p_claim_id,
    'expected_storage_order_id', p_expected_storage_order_id,
    'expected_claim_status', v_expected_status,
    'reason', v_reason
  )::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(p_admin_user_id::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing
  from public.storage_membership_unbind_operations
  where admin_user_id = p_admin_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = '23505', message = 'idempotency key was already used with a different payload';
    end if;
    if v_existing.result_json is null then
      raise exception using errcode = '40001', message = 'matching idempotent operation is still in progress';
    end if;
    return v_existing.result_json || jsonb_build_object('idempotent_replay', true);
  end if;

  select * into v_claim from public.membership_benefit_claims where id = p_claim_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'membership claim not found';
  end if;
  if v_claim.benefit_type <> 'storage' or v_claim.linked_order_table <> 'storage_orders' then
    raise exception using errcode = '23514', message = 'claim is not a linked storage membership claim';
  end if;
  if v_claim.status <> 'reserved' or v_claim.status <> v_expected_status then
    raise exception using errcode = '23514', message = 'storage membership claim state changed; refresh and retry';
  end if;
  if v_claim.linked_order_id is distinct from p_expected_storage_order_id then
    raise exception using errcode = '23514', message = 'storage membership order changed; refresh and retry';
  end if;

  select * into v_order from public.storage_orders where id = p_expected_storage_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'storage order not found';
  end if;
  if v_order.membership_benefit_claim_id is distinct from v_claim.id then
    raise exception using errcode = '23514', message = 'storage order and membership claim are not mutually linked';
  end if;
  if v_claim.linked_order_no is distinct from v_order.order_no then
    raise exception using errcode = '23514', message = 'storage order number and membership claim are not mutually linked';
  end if;

  insert into public.storage_membership_unbind_operations (
    admin_user_id, idempotency_key, payload_hash, claim_id, storage_order_id
  ) values (
    p_admin_user_id, p_idempotency_key, v_payload_hash, v_claim.id, v_order.id
  );

  update public.storage_orders
  set membership_benefit_claim_id = null
  where id = v_order.id and membership_benefit_claim_id = v_claim.id
  returning to_jsonb(storage_orders) into v_order_after;
  if v_order_after is null then
    raise exception using errcode = '40001', message = 'storage order membership link changed concurrently';
  end if;

  update public.membership_benefit_claims
  set status = 'selected',
      reserved_at = null,
      linked_order_table = null,
      linked_order_id = null,
      linked_order_no = null,
      updated_by_admin_id = p_admin_user_id
  where id = v_claim.id
    and status = 'reserved'
    and linked_order_table = 'storage_orders'
    and linked_order_id = v_order.id
  returning to_jsonb(membership_benefit_claims) into v_claim_after;
  if v_claim_after is null then
    raise exception using errcode = '40001', message = 'storage membership claim changed concurrently';
  end if;

  insert into public.membership_audit_logs (
    admin_user_id, site_user_id, entitlement_id, claim_id, action, before_data, after_data, metadata
  ) values (
    p_admin_user_id, v_claim.site_user_id, v_claim.entitlement_id, v_claim.id,
    'membership_claim_order_unbound', to_jsonb(v_claim), v_claim_after,
    jsonb_build_object('reason', v_reason, 'order_table', 'storage_orders', 'order_id', v_order.id,
      'order_no', v_order.order_no, 'idempotency_key', p_idempotency_key, 'operated_at', v_now)
  );

  insert into public.admin_operation_logs (
    admin_user_id, target_type, target_id, action, before_data, after_data, metadata
  ) values (
    p_admin_user_id, 'storage_order', v_order.id, 'storage_membership_claim_unbound',
    jsonb_build_object('order', to_jsonb(v_order), 'claim', to_jsonb(v_claim)),
    jsonb_build_object('order', v_order_after, 'claim', v_claim_after),
    jsonb_build_object('reason', v_reason, 'claim_id', v_claim.id, 'entitlement_id', v_claim.entitlement_id,
      'site_user_id', v_claim.site_user_id, 'order_no', v_order.order_no,
      'old_status', v_claim.status, 'new_status', 'selected', 'idempotency_key', p_idempotency_key)
  );

  v_result := jsonb_build_object(
    'ok', true, 'claim_id', v_claim.id, 'storage_order_id', v_order.id,
    'storage_order_no', v_order.order_no, 'previous_status', v_claim.status,
    'claim_status', 'selected', 'idempotent_replay', false
  );
  update public.storage_membership_unbind_operations
  set result_json = v_result
  where admin_user_id = p_admin_user_id and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

revoke all on function public.admin_unbind_storage_membership_claim_atomic(uuid, uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_unbind_storage_membership_claim_atomic(uuid, uuid, uuid, uuid, text, text)
  to service_role;

comment on function public.admin_unbind_storage_membership_claim_atomic(uuid, uuid, uuid, uuid, text, text)
  is 'Atomically unbind both sides of a reserved storage membership claim with administrator authorization, audit, concurrency, and idempotency guards.';

notify pgrst, 'reload schema';
commit;
