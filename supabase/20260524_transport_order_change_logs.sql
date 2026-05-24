create table if not exists public.order_change_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.transport_requests(id) on delete set null,
  order_no text,
  change_type text not null,
  status text not null default 'draft',
  reason text,
  preview_token text,
  source_snapshot_hash text,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  pricing_before jsonb not null default '{}'::jsonb,
  pricing_after jsonb not null default '{}'::jsonb,
  old_price_gbp numeric(10, 2),
  new_price_gbp numeric(10, 2),
  price_delta_gbp numeric(10, 2),
  paid_amount_gbp numeric(10, 2),
  balance_due_gbp numeric(10, 2),
  refund_due_gbp numeric(10, 2),
  group_action text,
  old_group_id text,
  new_group_id text,
  created_by_admin_id uuid references public.admin_users(id) on delete set null,
  created_by_admin_name text,
  confirmed_by_admin_id uuid references public.admin_users(id) on delete set null,
  confirmed_by_admin_name text,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_change_logs_status_check
    check (status in ('draft', 'confirmed', 'cancelled')),
  constraint order_change_logs_amounts_non_negative_check
    check (
      (paid_amount_gbp is null or paid_amount_gbp >= 0)
      and (balance_due_gbp is null or balance_due_gbp >= 0)
      and (refund_due_gbp is null or refund_due_gbp >= 0)
    )
);

alter table public.order_change_logs
  add column if not exists preview_token text,
  add column if not exists source_snapshot_hash text;

create index if not exists idx_order_change_logs_request_created_at
  on public.order_change_logs (request_id, created_at desc);

create index if not exists idx_order_change_logs_order_no_created_at
  on public.order_change_logs (order_no, created_at desc);

create index if not exists idx_order_change_logs_status_created_at
  on public.order_change_logs (status, created_at desc);

create index if not exists idx_order_change_logs_created_by_admin_created_at
  on public.order_change_logs (created_by_admin_id, created_at desc);

create unique index if not exists idx_order_change_logs_preview_token
  on public.order_change_logs (preview_token)
  where preview_token is not null;

alter table public.order_change_logs enable row level security;
alter table public.order_change_logs force row level security;

revoke all on table public.order_change_logs from public, anon, authenticated;

drop trigger if exists trg_order_change_logs_updated_at on public.order_change_logs;
create trigger trg_order_change_logs_updated_at
before update on public.order_change_logs
for each row
execute function public.set_updated_at();

comment on table public.order_change_logs is 'Admin-only transport order change preview/confirmation records. Not exposed to public clients.';
