create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists users (
  id uuid primary key,
  source_user_table text not null default 'site_users',
  source_user_id uuid not null unique,
  email text,
  nickname text,
  phone text,
  contact_preference text,
  wechat_id text,
  whatsapp_contact text,
  avatar_url text,
  nationality text,
  first_login_at timestamptz,
  last_login_at timestamptz,
  last_login_provider text,
  login_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_source_user_table_check check (source_user_table in ('site_users'))
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  order_no text not null,
  user_id uuid references users(id) on delete set null,
  service_type text not null,
  customer_name text not null,
  phone text,
  wechat_or_whatsapp text,
  status text not null,
  flight_no text,
  pickup_date date,
  storage_start_date date,
  storage_end_date date,
  archived boolean not null default false,
  archived_at timestamptz,
  completed_at timestamptz,
  latest_note_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_payload jsonb not null default '{}'::jsonb,
  constraint orders_source_record_unique unique (source_table, source_id),
  constraint orders_order_no_unique unique (order_no),
  constraint orders_source_table_check check (source_table in ('storage_orders', 'transport_requests'))
);

create table if not exists order_status_logs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  previous_status text,
  changed_at timestamptz not null default now(),
  changed_by_admin_id uuid references admin_users(id) on delete set null,
  change_source text not null default 'system',
  source_table text,
  source_record_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  note text not null,
  note_type text not null default 'admin',
  created_by_admin_id uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_notes_note_type_check check (note_type in ('admin', 'customer_service', 'system'))
);

create table if not exists order_attachments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  source_table text,
  source_record_id uuid,
  file_name text not null,
  file_url text not null,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by_admin_id uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists admin_operation_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_users(id) on delete set null,
  order_id uuid references orders(id) on delete cascade,
  target_type text not null default 'order',
  target_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_users_source_user_id
  on users(source_user_id);

create index if not exists idx_users_last_login_at
  on users(last_login_at desc);

create index if not exists idx_orders_archived_created_at
  on orders(archived, created_at desc);

create index if not exists idx_orders_status_created_at
  on orders(status, created_at desc);

create index if not exists idx_orders_service_type_created_at
  on orders(service_type, created_at desc);

create index if not exists idx_orders_created_at
  on orders(created_at desc);

create index if not exists idx_orders_completed_at
  on orders(completed_at desc);

create index if not exists idx_orders_pickup_date
  on orders(pickup_date desc);

create index if not exists idx_orders_storage_start_date
  on orders(storage_start_date desc);

create index if not exists idx_orders_storage_end_date
  on orders(storage_end_date desc);

create index if not exists idx_orders_flight_no
  on orders(flight_no);

create unique index if not exists idx_orders_order_no
  on orders(order_no);

create index if not exists idx_orders_phone
  on orders(phone);

create index if not exists idx_orders_customer_name
  on orders(customer_name);

create index if not exists idx_orders_user_id
  on orders(user_id);

create index if not exists idx_orders_source_table_source_id
  on orders(source_table, source_id);

create index if not exists idx_order_status_logs_order_id_changed_at
  on order_status_logs(order_id, changed_at desc);

create index if not exists idx_order_notes_order_id_created_at
  on order_notes(order_id, created_at desc);

create index if not exists idx_admin_operation_logs_order_id_created_at
  on admin_operation_logs(order_id, created_at desc);

create index if not exists idx_admin_operation_logs_admin_user_id_created_at
  on admin_operation_logs(admin_user_id, created_at desc);

create index if not exists idx_order_attachments_order_id_created_at
  on order_attachments(order_id, created_at desc);

create index if not exists idx_orders_order_no_trgm
  on orders using gin (order_no gin_trgm_ops);

create index if not exists idx_orders_phone_trgm
  on orders using gin (phone gin_trgm_ops);

create index if not exists idx_orders_customer_name_trgm
  on orders using gin (customer_name gin_trgm_ops);

create index if not exists idx_transport_requests_flight_no
  on transport_requests(flight_no);

create index if not exists idx_transport_requests_student_name
  on transport_requests(student_name);

create index if not exists idx_transport_requests_phone
  on transport_requests(phone);

create index if not exists idx_storage_orders_service_date
  on storage_orders(service_date desc);

create or replace function sync_user_from_site_users()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    delete from users where source_user_id = old.id and source_user_table = 'site_users';
    return old;
  end if;

  insert into users (
    id,
    source_user_table,
    source_user_id,
    email,
    nickname,
    phone,
    contact_preference,
    wechat_id,
    whatsapp_contact,
    avatar_url,
    nationality,
    first_login_at,
    last_login_at,
    last_login_provider,
    login_count,
    created_at,
    updated_at
  ) values (
    new.id,
    'site_users',
    new.id,
    new.email,
    new.nickname,
    new.phone,
    new.contact_preference,
    new.wechat_id,
    new.whatsapp_contact,
    new.avatar_url,
    new.nationality,
    new.first_login_at,
    new.last_login_at,
    new.last_login_provider,
    coalesce(new.login_count, 0),
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (source_user_id) do update
  set
    id = excluded.id,
    email = excluded.email,
    nickname = excluded.nickname,
    phone = excluded.phone,
    contact_preference = excluded.contact_preference,
    wechat_id = excluded.wechat_id,
    whatsapp_contact = excluded.whatsapp_contact,
    avatar_url = excluded.avatar_url,
    nationality = excluded.nationality,
    first_login_at = excluded.first_login_at,
    last_login_at = excluded.last_login_at,
    last_login_provider = excluded.last_login_provider,
    login_count = excluded.login_count,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

create or replace function sync_storage_order_to_orders()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_completed_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from orders where source_table = 'storage_orders' and source_id = old.id;
    return old;
  end if;

  v_completed_at := case
    when new.status in ('confirmed', 'cancelled') then coalesce(new.updated_at, new.created_at, now())
    else null
  end;

  insert into orders (
    source_table,
    source_id,
    order_no,
    user_id,
    service_type,
    customer_name,
    phone,
    wechat_or_whatsapp,
    status,
    storage_start_date,
    storage_end_date,
    completed_at,
    created_at,
    updated_at,
    legacy_payload
  ) values (
    'storage_orders',
    new.id,
    new.order_no,
    null,
    'storage',
    new.customer_name,
    new.phone,
    new.wechat_id,
    new.status,
    new.service_date,
    new.service_date,
    v_completed_at,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    jsonb_build_object(
      'order_type', new.order_type,
      'business_date', new.business_date,
      'address_full', new.address_full,
      'service_date', new.service_date,
      'service_time', new.service_time,
      'service_label', new.service_label,
      'estimated_box_count', new.estimated_box_count,
      'estimated_total_price', new.estimated_total_price,
      'notification_status', new.notification_status,
      'notification_error', new.notification_error
    )
  )
  on conflict (source_table, source_id) do update
  set
    order_no = excluded.order_no,
    user_id = excluded.user_id,
    service_type = excluded.service_type,
    customer_name = excluded.customer_name,
    phone = excluded.phone,
    wechat_or_whatsapp = excluded.wechat_or_whatsapp,
    status = excluded.status,
    storage_start_date = excluded.storage_start_date,
    storage_end_date = excluded.storage_end_date,
    completed_at = case
      when excluded.status in ('confirmed', 'cancelled') then coalesce(orders.completed_at, excluded.completed_at)
      else null
    end,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    legacy_payload = excluded.legacy_payload;

  select id into v_order_id
  from orders
  where source_table = 'storage_orders' and source_id = new.id;

  if tg_op = 'INSERT' then
    insert into order_status_logs (
      order_id,
      status,
      previous_status,
      changed_at,
      change_source,
      source_table,
      source_record_id,
      metadata
    ) values (
      v_order_id,
      new.status,
      null,
      coalesce(new.created_at, now()),
      'system_sync',
      'storage_orders',
      new.id,
      jsonb_build_object('reason', 'initial_insert')
    );
  elsif new.status is distinct from old.status then
    insert into order_status_logs (
      order_id,
      status,
      previous_status,
      changed_at,
      change_source,
      source_table,
      source_record_id
    ) values (
      v_order_id,
      new.status,
      old.status,
      coalesce(new.updated_at, now()),
      'system_sync',
      'storage_orders',
      new.id
    );
  end if;

  return new;
end;
$$;

create or replace function sync_transport_request_to_orders()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
  v_completed_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from orders where source_table = 'transport_requests' and source_id = old.id;
    return old;
  end if;

  v_completed_at := case
    when new.status in ('closed', 'cancelled') then coalesce(new.updated_at, new.created_at, now())
    else null
  end;

  insert into orders (
    source_table,
    source_id,
    order_no,
    user_id,
    service_type,
    customer_name,
    phone,
    wechat_or_whatsapp,
    status,
    flight_no,
    pickup_date,
    completed_at,
    created_at,
    updated_at,
    legacy_payload
  ) values (
    'transport_requests',
    new.id,
    new.order_no,
    new.site_user_id,
    new.service_type,
    new.student_name,
    new.phone,
    new.wechat,
    new.status,
    new.flight_no,
    coalesce((new.preferred_time_start at time zone 'Europe/London')::date, (new.flight_datetime at time zone 'Europe/London')::date),
    v_completed_at,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    jsonb_build_object(
      'order_type', new.order_type,
      'business_date', new.business_date,
      'airport_code', new.airport_code,
      'airport_name', new.airport_name,
      'terminal', new.terminal,
      'flight_datetime', new.flight_datetime,
      'location_from', new.location_from,
      'location_to', new.location_to,
      'preferred_time_start', new.preferred_time_start,
      'preferred_time_end', new.preferred_time_end,
      'passenger_count', new.passenger_count,
      'luggage_count', new.luggage_count,
      'shareable', new.shareable,
      'notes', new.notes
    )
  )
  on conflict (source_table, source_id) do update
  set
    order_no = excluded.order_no,
    user_id = excluded.user_id,
    service_type = excluded.service_type,
    customer_name = excluded.customer_name,
    phone = excluded.phone,
    wechat_or_whatsapp = excluded.wechat_or_whatsapp,
    status = excluded.status,
    flight_no = excluded.flight_no,
    pickup_date = excluded.pickup_date,
    completed_at = case
      when excluded.status in ('closed', 'cancelled') then coalesce(orders.completed_at, excluded.completed_at)
      else null
    end,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    legacy_payload = excluded.legacy_payload;

  select id into v_order_id
  from orders
  where source_table = 'transport_requests' and source_id = new.id;

  if tg_op = 'INSERT' then
    insert into order_status_logs (
      order_id,
      status,
      previous_status,
      changed_at,
      change_source,
      source_table,
      source_record_id,
      metadata
    ) values (
      v_order_id,
      new.status,
      null,
      coalesce(new.created_at, now()),
      'system_sync',
      'transport_requests',
      new.id,
      jsonb_build_object('reason', 'initial_insert')
    );
  elsif new.status is distinct from old.status then
    insert into order_status_logs (
      order_id,
      status,
      previous_status,
      changed_at,
      change_source,
      source_table,
      source_record_id
    ) values (
      v_order_id,
      new.status,
      old.status,
      coalesce(new.updated_at, now()),
      'system_sync',
      'transport_requests',
      new.id
    );
  end if;

  return new;
end;
$$;

create or replace function sync_order_latest_note_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update orders
    set latest_note_at = (
      select max(created_at)
      from order_notes
      where order_id = old.order_id
    )
    where id = old.order_id;
    return old;
  end if;

  update orders
  set latest_note_at = greatest(coalesce(latest_note_at, new.created_at), new.created_at)
  where id = new.order_id;

  return new;
end;
$$;

create or replace function archive_orders_older_than(older_than_months integer default 6)
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
begin
  update orders
  set
    archived = true,
    archived_at = now()
  where archived = false
    and status in ('confirmed', 'closed', 'cancelled')
    and completed_at is not null
    and completed_at < now() - make_interval(months => greatest(older_than_months, 1));

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

insert into users (
  id,
  source_user_table,
  source_user_id,
  email,
  nickname,
  phone,
  contact_preference,
  wechat_id,
  whatsapp_contact,
  avatar_url,
  nationality,
  first_login_at,
  last_login_at,
  last_login_provider,
  login_count,
  created_at,
  updated_at
)
select
  su.id,
  'site_users',
  su.id,
  su.email,
  su.nickname,
  su.phone,
  su.contact_preference,
  su.wechat_id,
  su.whatsapp_contact,
  su.avatar_url,
  su.nationality,
  su.first_login_at,
  su.last_login_at,
  su.last_login_provider,
  coalesce(su.login_count, 0),
  coalesce(su.created_at, now()),
  coalesce(su.updated_at, now())
from site_users su
on conflict (source_user_id) do update
set
  id = excluded.id,
  email = excluded.email,
  nickname = excluded.nickname,
  phone = excluded.phone,
  contact_preference = excluded.contact_preference,
  wechat_id = excluded.wechat_id,
  whatsapp_contact = excluded.whatsapp_contact,
  avatar_url = excluded.avatar_url,
  nationality = excluded.nationality,
  first_login_at = excluded.first_login_at,
  last_login_at = excluded.last_login_at,
  last_login_provider = excluded.last_login_provider,
  login_count = excluded.login_count,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;

insert into orders (
  source_table,
  source_id,
  order_no,
  user_id,
  service_type,
  customer_name,
  phone,
  wechat_or_whatsapp,
  status,
  storage_start_date,
  storage_end_date,
  completed_at,
  created_at,
  updated_at,
  legacy_payload
)
select
  'storage_orders',
  so.id,
  so.order_no,
  null,
  'storage',
  so.customer_name,
  so.phone,
  so.wechat_id,
  so.status,
  so.service_date,
  so.service_date,
  case when so.status in ('confirmed', 'cancelled') then coalesce(so.updated_at, so.created_at, now()) else null end,
  coalesce(so.created_at, now()),
  coalesce(so.updated_at, now()),
  jsonb_build_object(
    'order_type', so.order_type,
    'business_date', so.business_date,
    'address_full', so.address_full,
    'service_date', so.service_date,
    'service_time', so.service_time,
    'service_label', so.service_label,
    'estimated_box_count', so.estimated_box_count,
    'estimated_total_price', so.estimated_total_price,
    'notification_status', so.notification_status,
    'notification_error', so.notification_error
  )
from storage_orders so
on conflict (source_table, source_id) do update
set
  order_no = excluded.order_no,
  user_id = excluded.user_id,
  service_type = excluded.service_type,
  customer_name = excluded.customer_name,
  phone = excluded.phone,
  wechat_or_whatsapp = excluded.wechat_or_whatsapp,
  status = excluded.status,
  storage_start_date = excluded.storage_start_date,
  storage_end_date = excluded.storage_end_date,
  completed_at = case
    when excluded.status in ('confirmed', 'cancelled') then coalesce(orders.completed_at, excluded.completed_at)
    else null
  end,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  legacy_payload = excluded.legacy_payload;

insert into orders (
  source_table,
  source_id,
  order_no,
  user_id,
  service_type,
  customer_name,
  phone,
  wechat_or_whatsapp,
  status,
  flight_no,
  pickup_date,
  completed_at,
  created_at,
  updated_at,
  legacy_payload
)
select
  'transport_requests',
  tr.id,
  tr.order_no,
  tr.site_user_id,
  tr.service_type,
  tr.student_name,
  tr.phone,
  tr.wechat,
  tr.status,
  tr.flight_no,
  coalesce((tr.preferred_time_start at time zone 'Europe/London')::date, (tr.flight_datetime at time zone 'Europe/London')::date),
  case when tr.status in ('closed', 'cancelled') then coalesce(tr.updated_at, tr.created_at, now()) else null end,
  coalesce(tr.created_at, now()),
  coalesce(tr.updated_at, now()),
  jsonb_build_object(
    'order_type', tr.order_type,
    'business_date', tr.business_date,
    'airport_code', tr.airport_code,
    'airport_name', tr.airport_name,
    'terminal', tr.terminal,
    'flight_datetime', tr.flight_datetime,
    'location_from', tr.location_from,
    'location_to', tr.location_to,
    'preferred_time_start', tr.preferred_time_start,
    'preferred_time_end', tr.preferred_time_end,
    'passenger_count', tr.passenger_count,
    'luggage_count', tr.luggage_count,
    'shareable', tr.shareable,
    'notes', tr.notes
  )
from transport_requests tr
on conflict (source_table, source_id) do update
set
  order_no = excluded.order_no,
  user_id = excluded.user_id,
  service_type = excluded.service_type,
  customer_name = excluded.customer_name,
  phone = excluded.phone,
  wechat_or_whatsapp = excluded.wechat_or_whatsapp,
  status = excluded.status,
  flight_no = excluded.flight_no,
  pickup_date = excluded.pickup_date,
  completed_at = case
    when excluded.status in ('closed', 'cancelled') then coalesce(orders.completed_at, excluded.completed_at)
    else null
  end,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  legacy_payload = excluded.legacy_payload;

insert into order_status_logs (
  order_id,
  status,
  previous_status,
  changed_at,
  change_source,
  source_table,
  source_record_id,
  metadata
)
select
  o.id,
  o.status,
  null,
  coalesce(o.completed_at, o.created_at, now()),
  'system_backfill',
  o.source_table,
  o.source_id,
  jsonb_build_object('reason', 'backfill')
from orders o
where not exists (
  select 1
  from order_status_logs osl
  where osl.order_id = o.id
);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
before update on users
for each row
execute function set_updated_at();

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
before update on orders
for each row
execute function set_updated_at();

drop trigger if exists trg_order_notes_updated_at on order_notes;
create trigger trg_order_notes_updated_at
before update on order_notes
for each row
execute function set_updated_at();

drop trigger if exists trg_sync_site_users_to_users on site_users;
create trigger trg_sync_site_users_to_users
after insert or update or delete on site_users
for each row
execute function sync_user_from_site_users();

drop trigger if exists trg_sync_storage_orders_to_orders on storage_orders;
create trigger trg_sync_storage_orders_to_orders
after insert or update or delete on storage_orders
for each row
execute function sync_storage_order_to_orders();

drop trigger if exists trg_sync_transport_requests_to_orders on transport_requests;
create trigger trg_sync_transport_requests_to_orders
after insert or update or delete on transport_requests
for each row
execute function sync_transport_request_to_orders();

drop trigger if exists trg_sync_order_latest_note_at on order_notes;
create trigger trg_sync_order_latest_note_at
after insert or update or delete on order_notes
for each row
execute function sync_order_latest_note_at();

alter table users enable row level security;
alter table orders enable row level security;
alter table order_status_logs enable row level security;
alter table order_notes enable row level security;
alter table order_attachments enable row level security;
alter table admin_operation_logs enable row level security;
