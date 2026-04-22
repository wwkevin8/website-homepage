create extension if not exists pg_trgm;

create index if not exists idx_transport_requests_order_no_trgm
  on public.transport_requests
  using gin (order_no gin_trgm_ops);

create index if not exists idx_transport_groups_group_id_trgm
  on public.transport_groups
  using gin (group_id gin_trgm_ops);

create index if not exists idx_transport_group_members_group_id_created_at
  on public.transport_group_members (group_id, created_at);

create index if not exists idx_transport_requests_site_user_future_lookup
  on public.transport_requests (site_user_id, status, flight_datetime, service_type);
