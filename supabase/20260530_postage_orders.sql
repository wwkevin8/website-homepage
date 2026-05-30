create extension if not exists pgcrypto;

create table if not exists postage_order_counters (
  business_date date primary key,
  last_value integer not null default 0 check (last_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_postage_counter_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_postage_order_counters_updated_at on postage_order_counters;
create trigger trg_postage_order_counters_updated_at
before update on postage_order_counters
for each row
execute function set_postage_counter_updated_at();

create or replace function set_postage_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function allocate_postage_order_no()
returns jsonb
language plpgsql
as $$
declare
  v_business_date date;
  v_business_date_code text;
  v_next_value integer;
begin
  v_business_date := (timezone('Europe/London', now()))::date;
  v_business_date_code := to_char(v_business_date, 'YYYYMMDD');

  insert into postage_order_counters (business_date, last_value)
  values (v_business_date, 1)
  on conflict (business_date)
  do update
    set last_value = postage_order_counters.last_value + 1,
        updated_at = now()
  returning last_value
  into v_next_value;

  return jsonb_build_object(
    'business_date', to_char(v_business_date, 'YYYY-MM-DD'),
    'sequence_no', v_next_value,
    'order_no', 'POST-' || v_business_date_code || '-' || lpad(v_next_value::text, 3, '0')
  );
end;
$$;

revoke all on function allocate_postage_order_no() from anon, authenticated;

create table if not exists postage_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid references site_users(id) on delete set null,
  member_id uuid references site_users(id) on delete set null,
  status text not null default 'new' check (status in (
    'new',
    'contacted',
    'pending_pickup',
    'picked_up',
    'weighed_pending_quote',
    'pending_payment',
    'paid',
    'shipped',
    'completed',
    'cancelled'
  )),
  box_delivery_status text not null default 'not_required' check (box_delivery_status in (
    'not_required',
    'pending',
    'arranged',
    'delivered',
    'issue'
  )),
  payment_status text not null default 'unpaid' check (payment_status in (
    'unpaid',
    'pending_confirmation',
    'paid',
    'refunded',
    'not_required'
  )),
  assigned_to text,
  source_page text not null default 'postage_submit',
  cancelled_at timestamptz,
  completed_at timestamptz,

  customer_name text not null,
  wechat_id text,
  phone text,
  email text,

  service_type text not null,
  preferred_route text,
  box_count integer not null check (box_count >= 1),
  single_box_weight numeric(8, 2) check (single_box_weight is null or single_box_weight > 0),
  different_box_weights boolean not null default false,
  need_boxes boolean not null default false,
  box_type text,
  need_packing_materials boolean not null default false,
  packing_materials text,
  item_types jsonb not null default '[]'::jsonb,
  has_sensitive_items boolean not null default false,
  user_note text,

  need_box_delivery boolean not null default false,
  box_delivery_same_as_pickup boolean not null default true,
  box_delivery_address text,
  box_delivery_postcode text,
  box_delivery_building text,
  box_delivery_room text,
  box_delivery_need_upstairs boolean not null default false,
  box_delivery_has_lift boolean,
  preferred_box_delivery_date date,
  preferred_box_delivery_time_slot text,
  box_delivery_note text,

  need_pickup boolean not null default true,
  pickup_address text,
  pickup_postcode text,
  pickup_building text,
  pickup_room text,
  pickup_need_upstairs boolean not null default false,
  pickup_has_lift boolean,
  preferred_pickup_date date,
  preferred_pickup_time_slot text,
  pickup_note text,

  recipient_country text,
  recipient_city text,
  recipient_name text,
  recipient_phone text,
  recipient_address text,

  actual_box_count integer check (actual_box_count is null or actual_box_count >= 0),
  actual_weight_note text,
  weighing_note text,

  final_route text,
  final_postage numeric(10, 2) not null default 0,
  final_box_fee numeric(10, 2) not null default 0,
  final_packing_fee numeric(10, 2) not null default 0,
  box_delivery_fee numeric(10, 2) not null default 0,
  box_delivery_upstairs_fee numeric(10, 2) not null default 0,
  pickup_upstairs_fee numeric(10, 2) not null default 0,
  other_fee numeric(10, 2) not null default 0,
  discount numeric(10, 2) not null default 0,
  final_total numeric(10, 2),
  fee_note text,

  paid_at timestamptz,
  payment_method text,
  payment_note text,

  carrier text,
  tracking_number text,
  shipped_at date,
  tracking_url text,
  logistics_note text,

  risk_confirmed boolean not null default false,
  internal_note text,
  customer_email_status text not null default 'pending' check (customer_email_status in ('pending', 'sent', 'failed', 'skipped')),
  customer_email_error text,
  customer_email_sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_postage_orders_created_at on postage_orders(created_at desc);
create index if not exists idx_postage_orders_status_created_at on postage_orders(status, created_at desc);
create index if not exists idx_postage_orders_box_delivery_status on postage_orders(box_delivery_status);
create index if not exists idx_postage_orders_payment_status on postage_orders(payment_status);
create index if not exists idx_postage_orders_box_delivery_date on postage_orders(preferred_box_delivery_date);
create index if not exists idx_postage_orders_pickup_date on postage_orders(preferred_pickup_date);
create index if not exists idx_postage_orders_sensitive on postage_orders(has_sensitive_items);
create index if not exists idx_postage_orders_user_id on postage_orders(user_id);
create index if not exists idx_postage_orders_tracking_number on postage_orders(tracking_number);

drop trigger if exists trg_postage_orders_updated_at on postage_orders;
create trigger trg_postage_orders_updated_at
before update on postage_orders
for each row
execute function set_postage_order_updated_at();

create table if not exists postage_order_logs (
  id uuid primary key default gen_random_uuid(),
  postage_order_id uuid not null references postage_orders(id) on delete cascade,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  operator_id uuid,
  operator_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_postage_order_logs_order_created_at
  on postage_order_logs(postage_order_id, created_at desc);

alter table postage_order_counters enable row level security;
alter table postage_order_counters force row level security;
alter table postage_orders enable row level security;
alter table postage_orders force row level security;
alter table postage_order_logs enable row level security;
alter table postage_order_logs force row level security;

revoke all on postage_order_counters from anon, authenticated;
revoke all on postage_orders from anon, authenticated;
revoke all on postage_order_logs from anon, authenticated;
