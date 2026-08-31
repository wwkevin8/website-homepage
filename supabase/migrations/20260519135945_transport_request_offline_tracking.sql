alter table if exists public.transport_requests
  add column if not exists offline_recorded boolean not null default false;

alter table if exists public.transport_requests
  add column if not exists last_operated_by text;

alter table if exists public.transport_requests
  add column if not exists last_operated_at timestamptz;

create index if not exists idx_transport_requests_offline_recorded
  on public.transport_requests (offline_recorded, flight_datetime desc);

create index if not exists idx_transport_requests_last_operated_by
  on public.transport_requests (last_operated_by);;
