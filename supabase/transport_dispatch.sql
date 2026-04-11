create extension if not exists pgcrypto;

-- Active schema for the current Google-login-first production flow.
-- Notes:
-- 1) site_users.email remains the primary business identifier.
-- 2) site_users.wechat_openid is still retained for backward compatibility and can be dropped later.
-- 3) email_login_codes is retained only as a legacy table and is no longer used by the active login flow.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists transport_requests (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  order_type text not null default 'pickup' check (order_type = 'pickup'),
  business_date date not null,
  site_user_id uuid,
  service_type text not null check (service_type in ('pickup', 'dropoff')),
  student_name text not null,
  phone text,
  wechat text,
  passenger_count integer not null default 1 check (passenger_count > 0),
  luggage_count integer not null default 0 check (luggage_count >= 0),
  airport_code text not null,
  airport_name text not null,
  terminal text,
  flight_no text,
  flight_datetime timestamptz not null,
  location_from text not null,
  location_to text not null,
  preferred_time_start timestamptz,
  preferred_time_end timestamptz,
  shareable boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'open', 'grouped', 'closed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists site_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  wechat_openid text unique,
  nickname text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_login_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  request_ip text,
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table email_login_codes
  add column if not exists email text;

alter table email_login_codes
  add column if not exists code_hash text;

alter table email_login_codes
  add column if not exists request_ip text;

alter table email_login_codes
  add column if not exists attempt_count integer not null default 0;

alter table email_login_codes
  add column if not exists expires_at timestamptz;

alter table email_login_codes
  add column if not exists consumed_at timestamptz;

alter table email_login_codes
  add column if not exists created_at timestamptz not null default now();

alter table site_users
  add column if not exists email text;

alter table site_users
  add column if not exists wechat_openid text;

alter table site_users
  add column if not exists nickname text;

alter table site_users
  add column if not exists avatar_url text;

alter table site_users
  add column if not exists phone text;

alter table site_users
  add column if not exists first_login_at timestamptz;

alter table site_users
  add column if not exists last_login_at timestamptz;

alter table site_users
  add column if not exists last_login_provider text;

alter table site_users
  add column if not exists login_count integer not null default 0;

alter table site_users
  alter column wechat_openid drop not null;

create table if not exists user_login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references site_users(id) on delete cascade,
  provider text not null,
  login_at timestamptz not null default now(),
  ip text,
  user_agent text,
  service_context_type text,
  service_context_id uuid,
  created_at timestamptz not null default now()
);

alter table transport_requests
  drop constraint if exists transport_requests_site_user_id_fkey;

alter table transport_requests
  add constraint transport_requests_site_user_id_fkey
  foreign key (site_user_id) references site_users(id) on delete set null;

alter table transport_requests
  add column if not exists order_no text;

alter table transport_requests
  add column if not exists order_type text;

alter table transport_requests
  add column if not exists business_date date;

create table if not exists transport_groups (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('pickup', 'dropoff')),
  group_date date not null,
  airport_code text not null,
  airport_name text not null,
  terminal text,
  location_from text not null,
  location_to text not null,
  flight_time_reference timestamptz,
  preferred_time_start timestamptz,
  preferred_time_end timestamptz,
  vehicle_type text,
  max_passengers integer not null check (max_passengers > 0),
  visible_on_frontend boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'open', 'full', 'closed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transport_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references transport_groups(id) on delete cascade,
  request_id uuid not null references transport_requests(id) on delete cascade,
  passenger_count_snapshot integer not null check (passenger_count_snapshot > 0),
  luggage_count_snapshot integer not null check (luggage_count_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (request_id),
  unique (group_id, request_id)
);

create index if not exists idx_transport_requests_service_type_flight_datetime
  on transport_requests(service_type, flight_datetime);
create unique index if not exists idx_transport_requests_order_no
  on transport_requests(order_no);
create index if not exists idx_transport_requests_site_user_id
  on transport_requests(site_user_id);
create index if not exists idx_transport_requests_airport_code_flight_datetime
  on transport_requests(airport_code, flight_datetime);
create index if not exists idx_transport_requests_status_flight_datetime
  on transport_requests(status, flight_datetime);
create index if not exists idx_transport_requests_order_type_business_date
  on transport_requests(order_type, business_date desc);
create index if not exists idx_transport_requests_created_at
  on transport_requests(created_at desc);
create unique index if not exists idx_site_users_email_unique
  on site_users(email);
create index if not exists idx_site_users_phone
  on site_users(phone);
create index if not exists idx_site_users_last_login_at
  on site_users(last_login_at desc);
create index if not exists idx_email_login_codes_email_created_at
  on email_login_codes(email, created_at desc);
create index if not exists idx_email_login_codes_request_ip_created_at
  on email_login_codes(request_ip, created_at desc);
create index if not exists idx_user_login_events_user_id_login_at
  on user_login_events(user_id, login_at desc);
create index if not exists idx_user_login_events_provider_login_at
  on user_login_events(provider, login_at desc);

create index if not exists idx_transport_groups_service_type_group_date
  on transport_groups(service_type, group_date);
create index if not exists idx_transport_groups_airport_code_group_date
  on transport_groups(airport_code, group_date);
create index if not exists idx_transport_groups_status_visible_group_date
  on transport_groups(status, visible_on_frontend, group_date);

drop trigger if exists trg_transport_requests_updated_at on transport_requests;
create trigger trg_transport_requests_updated_at
before update on transport_requests
for each row
execute function set_updated_at();

drop trigger if exists trg_transport_groups_updated_at on transport_groups;
create trigger trg_transport_groups_updated_at
before update on transport_groups
for each row
execute function set_updated_at();

drop trigger if exists trg_site_users_updated_at on site_users;
create trigger trg_site_users_updated_at
before update on site_users
for each row
execute function set_updated_at();

create or replace view transport_groups_public_view as
select
  g.id,
  g.service_type,
  g.group_date,
  g.airport_code,
  g.airport_name,
  g.terminal,
  g.location_from,
  g.location_to,
  g.flight_time_reference,
  g.preferred_time_start,
  g.preferred_time_end,
  g.vehicle_type,
  g.max_passengers,
  g.visible_on_frontend,
  g.status,
  g.notes,
  g.created_at,
  g.updated_at,
  count(distinct m.request_id) as member_request_count,
  coalesce(sum(m.passenger_count_snapshot), 0) as current_passenger_count,
  coalesce(sum(m.luggage_count_snapshot), 0) as current_luggage_count,
  greatest(g.max_passengers - coalesce(sum(m.passenger_count_snapshot), 0), 0) as remaining_passenger_count
from transport_groups g
left join transport_group_members m on m.group_id = g.id
group by g.id;

comment on view transport_groups_public_view is 'Aggregate group data for admin listings and public carpool board.';

-- ---------------------------------------------------------------------------
-- Optional cleanup block for a later database-only cleanup pass.
-- Do NOT run this block until you are certain you no longer need historical
-- email-code records or the legacy wechat_openid column.
-- ---------------------------------------------------------------------------
--
-- drop index if exists idx_email_login_codes_email_created_at;
-- drop index if exists idx_email_login_codes_request_ip_created_at;
-- drop table if exists email_login_codes;
--
-- alter table site_users
--   drop column if exists wechat_openid;
