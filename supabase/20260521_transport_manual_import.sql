alter table if exists public.transport_requests
  add column if not exists source text not null default 'public_form';

alter table if exists public.transport_requests
  add column if not exists created_by_admin_id uuid;

alter table if exists public.transport_requests
  add column if not exists created_by_admin_name text;

alter table if exists public.transport_requests
  add column if not exists import_batch_id text;

alter table if exists public.transport_requests
  add column if not exists raw_import_payload jsonb;

alter table if exists public.transport_requests
  add column if not exists manual_price_gbp numeric(10, 2);

alter table if exists public.transport_requests
  add column if not exists manual_payment_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_source_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_source_check
      check (source in ('public_form', 'admin_manual', 'sheet_import'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_manual_payment_status_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_manual_payment_status_check
      check (manual_payment_status is null or manual_payment_status in ('paid', 'unpaid', 'pending', 'waived'));
  end if;
end $$;

create index if not exists idx_transport_requests_import_batch_id
  on public.transport_requests (import_batch_id);

create index if not exists idx_transport_requests_source_created_at
  on public.transport_requests (source, created_at desc);
