create extension if not exists pgcrypto;

create table if not exists order_number_counters (
  order_type text not null check (order_type in ('pickup', 'storage', 'housing')),
  business_date date not null,
  last_value integer not null default 0 check (last_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_type, business_date)
);

create or replace function set_order_counter_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_order_number_counters_updated_at on order_number_counters;
create trigger trg_order_number_counters_updated_at
before update on order_number_counters
for each row
execute function set_order_counter_updated_at();

create or replace function allocate_order_no(
  p_order_type text,
  p_sequence_width integer default 4
)
returns jsonb
language plpgsql
as $$
declare
  v_order_type text := lower(trim(coalesce(p_order_type, '')));
  v_prefix text;
  v_business_date date;
  v_business_date_code text;
  v_next_value integer;
  v_width integer := greatest(coalesce(p_sequence_width, 4), 4);
begin
  case v_order_type
    when 'pickup' then v_prefix := 'PU';
    when 'storage' then v_prefix := 'ST';
    when 'housing' then v_prefix := 'HS';
    else
      raise exception 'Unsupported order type: %', p_order_type;
  end case;

  v_business_date := (timezone('Europe/London', now()))::date;
  v_business_date_code := to_char(v_business_date, 'YYMMDD');

  insert into order_number_counters (order_type, business_date, last_value)
  values (v_order_type, v_business_date, 1)
  on conflict (order_type, business_date)
  do update
    set last_value = order_number_counters.last_value + 1,
        updated_at = now()
  returning last_value
  into v_next_value;

  return jsonb_build_object(
    'order_type', v_order_type,
    'prefix', v_prefix,
    'business_date', to_char(v_business_date, 'YYYY-MM-DD'),
    'sequence_no', v_next_value,
    'order_no', v_prefix || v_business_date_code || '-' || lpad(v_next_value::text, v_width, '0')
  );
end;
$$;

alter table transport_requests
  add column if not exists order_no text,
  add column if not exists order_type text,
  add column if not exists business_date date;

alter table storage_orders
  add column if not exists order_type text,
  add column if not exists business_date date;

update transport_requests
set order_type = 'pickup'
where order_type is null;

update storage_orders
set order_type = 'storage'
where order_type is null;

update transport_requests
set business_date = (timezone('Europe/London', created_at))::date
where business_date is null;

update storage_orders
set business_date = (timezone('Europe/London', created_at))::date
where business_date is null;

with transport_ranked as (
  select
    id,
    'PU' || to_char(business_date, 'YYMMDD') || '-' || lpad(row_number() over (
      partition by business_date
      order by created_at asc, id asc
    )::text, 4, '0') as next_order_no
  from transport_requests
  where business_date is not null
    and (
      order_no is null
      or order_no !~ '^PU\d{6}-\d{4}$'
    )
)
update transport_requests t
set order_no = r.next_order_no
from transport_ranked r
where t.id = r.id;

with storage_ranked as (
  select
    id,
    'ST' || to_char(business_date, 'YYMMDD') || '-' || lpad(row_number() over (
      partition by business_date
      order by created_at asc, id asc
    )::text, 4, '0') as next_order_no
  from storage_orders
  where business_date is not null
    and (
      order_no is null
      or order_no !~ '^ST\d{6}-\d{4}$'
    )
)
update storage_orders s
set order_no = r.next_order_no
from storage_ranked r
where s.id = r.id;

insert into order_number_counters (order_type, business_date, last_value)
select
  order_type,
  business_date,
  max(sequence_no) as last_value
from (
  select
    order_type,
    business_date,
    cast(split_part(order_no, '-', 2) as integer) as sequence_no
  from transport_requests
  where order_no ~ '^PU\d{6}-\d{4}$'

  union all

  select
    order_type,
    business_date,
    cast(split_part(order_no, '-', 2) as integer) as sequence_no
  from storage_orders
  where order_no ~ '^ST\d{6}-\d{4}$'
) sequenced_orders
group by order_type, business_date
on conflict (order_type, business_date)
do update
  set last_value = greatest(order_number_counters.last_value, excluded.last_value),
      updated_at = now();

alter table transport_requests
  alter column order_no set not null,
  alter column order_type set not null,
  alter column business_date set not null,
  alter column order_type set default 'pickup';

alter table storage_orders
  alter column order_no set not null,
  alter column order_type set not null,
  alter column business_date set not null,
  alter column order_type set default 'storage';

alter table transport_requests
  drop constraint if exists transport_requests_order_type_check;

alter table transport_requests
  add constraint transport_requests_order_type_check
  check (order_type = 'pickup');

alter table storage_orders
  drop constraint if exists storage_orders_order_type_check;

alter table storage_orders
  add constraint storage_orders_order_type_check
  check (order_type = 'storage');

create unique index if not exists idx_transport_requests_order_no
  on transport_requests(order_no);

create index if not exists idx_transport_requests_business_date
  on transport_requests(business_date desc);

create index if not exists idx_transport_requests_order_type_business_date
  on transport_requests(order_type, business_date desc);

create index if not exists idx_transport_requests_created_at
  on transport_requests(created_at desc);

create index if not exists idx_storage_orders_business_date
  on storage_orders(business_date desc);

create index if not exists idx_storage_orders_order_type_business_date
  on storage_orders(order_type, business_date desc);
