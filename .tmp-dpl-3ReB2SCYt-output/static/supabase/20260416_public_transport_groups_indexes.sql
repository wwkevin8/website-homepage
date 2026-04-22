create index if not exists idx_transport_groups_public_frontend_upcoming
  on public.transport_groups (
    group_date,
    preferred_time_start,
    created_at desc
  )
  where visible_on_frontend = true
    and status in ('single_member', 'active', 'full', 'open');

create index if not exists idx_transport_groups_public_frontend_service_airport_date
  on public.transport_groups (
    service_type,
    airport_code,
    group_date,
    preferred_time_start
  )
  where visible_on_frontend = true
    and status in ('single_member', 'active', 'full', 'open');

create index if not exists idx_transport_group_members_group_id_request_id
  on public.transport_group_members (group_id, request_id);
