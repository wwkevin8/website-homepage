-- NGN membership entitlement system v1.
-- Access model: service-role API only. Frontend and admin UI must use server APIs.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.membership_entitlements (
  id uuid primary key default gen_random_uuid(),
  site_user_id uuid not null references public.site_users(id) on delete cascade,
  membership_cycle text not null,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  grant_source text not null default 'admin'
    check (grant_source in ('admin', 'activation_code')),
  granted_by_admin_id uuid references public.admin_users(id) on delete set null,
  granted_at timestamptz not null default now(),
  valid_from date,
  valid_until date,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_entitlements_cycle_format_check
    check (membership_cycle ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint membership_entitlements_user_cycle_unique
    unique (site_user_id, membership_cycle)
);

create table if not exists public.membership_benefit_claims (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.membership_entitlements(id) on delete cascade,
  site_user_id uuid not null references public.site_users(id) on delete cascade,
  membership_cycle text not null,
  benefit_type text not null
    check (benefit_type in ('storage', 'pickup', 'moving', 'welcome_pack', 'cashback')),
  status text not null default 'selected'
    check (status in ('selected', 'reserved', 'used', 'manual', 'cancelled')),
  selected_at timestamptz,
  reserved_at timestamptz,
  used_at timestamptz,
  cancelled_at timestamptz,
  linked_order_table text
    check (linked_order_table in (
      'storage_orders',
      'transport_requests',
      'manual'
    )),
  linked_order_id uuid,
  linked_order_no text,
  membership_discount_amount numeric(10, 2) not null default 0,
  extra_charge_amount numeric(10, 2) not null default 0,
  final_price numeric(10, 2),
  discount_breakdown_json jsonb not null default '{}'::jsonb,
  admin_note text,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  updated_by_admin_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_claims_cycle_format_check
    check (membership_cycle ~ '^[0-9]{4}-[0-9]{2}$')
);

create unique index if not exists idx_membership_one_live_claim_per_user_cycle
  on public.membership_benefit_claims(site_user_id, membership_cycle)
  where status in ('selected', 'reserved', 'used', 'manual');

create index if not exists idx_membership_entitlements_user_cycle_status
  on public.membership_entitlements(site_user_id, membership_cycle, status);

create index if not exists idx_membership_entitlements_granted_by_admin
  on public.membership_entitlements(granted_by_admin_id);

create index if not exists idx_membership_claims_entitlement
  on public.membership_benefit_claims(entitlement_id);

create index if not exists idx_membership_claims_order_link
  on public.membership_benefit_claims(linked_order_table, linked_order_id);

create index if not exists idx_membership_claims_created_by_admin
  on public.membership_benefit_claims(created_by_admin_id);

create index if not exists idx_membership_claims_updated_by_admin
  on public.membership_benefit_claims(updated_by_admin_id);

create or replace function public.sync_membership_claim_identity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  entitlement_record public.membership_entitlements%rowtype;
begin
  select *
    into entitlement_record
    from public.membership_entitlements
   where id = new.entitlement_id;

  if not found then
    raise exception 'membership entitlement % does not exist', new.entitlement_id;
  end if;

  new.site_user_id = entitlement_record.site_user_id;
  new.membership_cycle = entitlement_record.membership_cycle;

  if new.status = 'selected' and new.selected_at is null then
    new.selected_at = now();
  end if;

  if new.status = 'reserved' and new.reserved_at is null then
    new.reserved_at = now();
  end if;

  if new.status in ('used', 'manual') and new.used_at is null then
    new.used_at = now();
  end if;

  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_membership_claim_identity on public.membership_benefit_claims;
create trigger trg_membership_claim_identity
before insert or update of entitlement_id, status
on public.membership_benefit_claims
for each row
execute function public.sync_membership_claim_identity();

create table if not exists public.membership_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  site_user_id uuid references public.site_users(id) on delete set null,
  entitlement_id uuid references public.membership_entitlements(id) on delete set null,
  claim_id uuid references public.membership_benefit_claims(id) on delete set null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_membership_audit_logs_created
  on public.membership_audit_logs(created_at desc);

create index if not exists idx_membership_audit_logs_claim
  on public.membership_audit_logs(claim_id);

create index if not exists idx_membership_audit_logs_admin
  on public.membership_audit_logs(admin_user_id);

create index if not exists idx_membership_audit_logs_user
  on public.membership_audit_logs(site_user_id);

create index if not exists idx_membership_audit_logs_entitlement
  on public.membership_audit_logs(entitlement_id);

alter table if exists public.storage_orders
  add column if not exists membership_benefit_claim_id uuid references public.membership_benefit_claims(id) on delete set null,
  add column if not exists membership_discount_amount numeric(10, 2) not null default 0,
  add column if not exists extra_charge_amount numeric(10, 2) not null default 0,
  add column if not exists final_price numeric(10, 2),
  add column if not exists membership_discount_breakdown_json jsonb not null default '{}'::jsonb;

alter table if exists public.transport_requests
  add column if not exists membership_benefit_claim_id uuid references public.membership_benefit_claims(id) on delete set null,
  add column if not exists membership_discount_amount numeric(10, 2) not null default 0,
  add column if not exists extra_charge_amount numeric(10, 2) not null default 0,
  add column if not exists final_price numeric(10, 2),
  add column if not exists membership_discount_breakdown_json jsonb not null default '{}'::jsonb;

create index if not exists idx_storage_orders_membership_claim
  on public.storage_orders(membership_benefit_claim_id);

create index if not exists idx_transport_requests_membership_claim
  on public.transport_requests(membership_benefit_claim_id);

drop trigger if exists trg_membership_entitlements_updated_at on public.membership_entitlements;
create trigger trg_membership_entitlements_updated_at
before update on public.membership_entitlements
for each row
execute function public.set_updated_at();

drop trigger if exists trg_membership_benefit_claims_updated_at on public.membership_benefit_claims;
create trigger trg_membership_benefit_claims_updated_at
before update on public.membership_benefit_claims
for each row
execute function public.set_updated_at();

alter table public.membership_entitlements enable row level security;
alter table public.membership_entitlements force row level security;
alter table public.membership_benefit_claims enable row level security;
alter table public.membership_benefit_claims force row level security;
alter table public.membership_audit_logs enable row level security;
alter table public.membership_audit_logs force row level security;

revoke all on table public.membership_entitlements from public, anon, authenticated;
revoke all on table public.membership_benefit_claims from public, anon, authenticated;
revoke all on table public.membership_audit_logs from public, anon, authenticated;
revoke execute on function public.sync_membership_claim_identity() from public, anon, authenticated;
