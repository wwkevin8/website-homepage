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

create table if not exists transport_requests (
  id uuid primary key default gen_random_uuid(),
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
create index if not exists idx_transport_requests_airport_code_flight_datetime
  on transport_requests(airport_code, flight_datetime);
create index if not exists idx_transport_requests_status_flight_datetime
  on transport_requests(status, flight_datetime);

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
