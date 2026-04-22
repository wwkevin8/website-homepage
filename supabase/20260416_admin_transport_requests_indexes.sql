create index if not exists idx_transport_requests_admin_created_at
  on public.transport_requests (created_at desc);

create index if not exists idx_transport_requests_admin_filter_combo
  on public.transport_requests (status, service_type, airport_code, flight_datetime desc, created_at desc);

create index if not exists idx_transport_group_members_request_id_group_id
  on public.transport_group_members (request_id, group_id);
