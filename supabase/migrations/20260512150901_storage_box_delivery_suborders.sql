alter table if exists public.storage_orders
  add column if not exists parent_order_no text,
  add column if not exists box_order_no text,
  add column if not exists storage_pickup_order_no text,
  add column if not exists box_delivery_date date,
  add column if not exists box_delivery_time_slot text,
  add column if not exists box_delivery_method text,
  add column if not exists purchased_boxes jsonb not null default '[]'::jsonb,
  add column if not exists storage_intake_date date,
  add column if not exists storage_end_date date;

create index if not exists idx_storage_orders_box_order_no
  on public.storage_orders(box_order_no)
  where box_order_no is not null;

create index if not exists idx_storage_orders_storage_pickup_order_no
  on public.storage_orders(storage_pickup_order_no)
  where storage_pickup_order_no is not null;

create index if not exists idx_storage_orders_box_delivery_date
  on public.storage_orders(box_delivery_date desc)
  where box_delivery_date is not null;;
