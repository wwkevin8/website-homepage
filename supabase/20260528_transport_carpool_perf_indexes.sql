create index if not exists idx_transport_groups_frontend_latest_active
  on public.transport_groups (
    visible_on_frontend,
    status,
    group_date desc,
    preferred_time_start desc,
    created_at desc
  )
  where visible_on_frontend = true
    and status in ('single_member', 'active');

create index if not exists idx_transport_groups_admin_validity_latest
  on public.transport_groups (
    status,
    group_date desc,
    preferred_time_start desc,
    created_at desc
  );

create index if not exists idx_transport_groups_flight_time_reference
  on public.transport_groups (flight_time_reference desc);

create index if not exists idx_transport_requests_public_active_latest
  on public.transport_requests (
    status,
    shareable,
    flight_datetime desc,
    created_at desc
  )
  where status in ('published', 'matched')
    and shareable = true;

create index if not exists idx_transport_requests_preferred_time_status
  on public.transport_requests (
    status,
    preferred_time_start desc,
    flight_datetime desc
  );

create index if not exists idx_transport_group_members_group_created_request
  on public.transport_group_members (group_id, created_at, request_id);
