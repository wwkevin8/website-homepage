create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists storage_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  order_type text not null default 'storage' check (order_type = 'storage'),
  business_date date not null,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'cancelled')),
  source text not null default 'storage_non_member_calculator',
  customer_name text not null,
  wechat_id text not null,
  phone text not null,
  address_full text not null,
  service_date date not null,
  service_time text not null,
  need_moving_help boolean not null default false,
  service_label text not null,
  service_flags_json jsonb not null default '{}'::jsonb,
  estimated_box_count integer not null default 0 check (estimated_box_count >= 0),
  estimated_total_price numeric(10, 2) not null default 0,
  friend_pickup boolean not null default false,
  friend_phone text,
  notes text,
  estimate_summary_json jsonb not null default '{}'::jsonb,
  customer_form_json jsonb not null default '{}'::jsonb,
  calculator_snapshot_json jsonb not null default '{}'::jsonb,
  final_readable_message text not null,
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed')),
  notification_error text,
  notification_sent_at timestamptz,
  webhook_payload_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_storage_orders_created_at
  on storage_orders(created_at desc);

create index if not exists idx_storage_orders_order_type_business_date
  on storage_orders(order_type, business_date desc);

create index if not exists idx_storage_orders_business_date
  on storage_orders(business_date desc);

create index if not exists idx_storage_orders_status_created_at
  on storage_orders(status, created_at desc);

create index if not exists idx_storage_orders_notification_status_created_at
  on storage_orders(notification_status, created_at desc);

create index if not exists idx_storage_orders_order_no
  on storage_orders(order_no);

create index if not exists idx_storage_orders_customer_name
  on storage_orders(customer_name);

create index if not exists idx_storage_orders_wechat_id
  on storage_orders(wechat_id);

create index if not exists idx_storage_orders_phone
  on storage_orders(phone);

drop trigger if exists trg_storage_orders_updated_at on storage_orders;
create trigger trg_storage_orders_updated_at
before update on storage_orders
for each row
execute function set_updated_at();
