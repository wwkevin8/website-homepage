create extension if not exists pg_trgm;

create index if not exists idx_transport_groups_public_joinable_time
  on public.transport_groups (
    visible_on_frontend,
    status,
    group_date,
    preferred_time_start,
    created_at desc
  )
  where visible_on_frontend = true
    and status in ('single_member', 'active');

create index if not exists idx_transport_groups_public_service_airport_time
  on public.transport_groups (
    service_type,
    airport_code,
    group_date,
    preferred_time_start,
    created_at desc
  )
  where visible_on_frontend = true
    and status in ('single_member', 'active');

create index if not exists idx_transport_groups_group_id_trgm
  on public.transport_groups
  using gin (group_id gin_trgm_ops);

create index if not exists idx_transport_group_members_group_created_request
  on public.transport_group_members (group_id, created_at, request_id);;
