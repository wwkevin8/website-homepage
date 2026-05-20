alter table if exists public.storage_orders
  add column if not exists offline_recorded boolean not null default false;

alter table if exists public.storage_orders
  add column if not exists last_operated_by text;

alter table if exists public.storage_orders
  add column if not exists last_operated_at timestamptz;

create index if not exists idx_storage_orders_offline_recorded_service
  on public.storage_orders (offline_recorded, service_date desc);

create index if not exists idx_storage_orders_last_operated_by
  on public.storage_orders (last_operated_by);

create index if not exists idx_storage_orders_box_service_date
  on public.storage_orders (box_delivery_date desc)
  where box_delivery_date is not null;

create index if not exists idx_storage_orders_storage_start_date
  on public.storage_orders (storage_start_date desc)
  where storage_start_date is not null;

create index if not exists idx_storage_orders_storage_end_date
  on public.storage_orders (storage_end_date desc)
  where storage_end_date is not null;
