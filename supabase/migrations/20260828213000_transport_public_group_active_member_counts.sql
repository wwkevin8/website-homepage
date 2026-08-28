-- Keep public transport Group aggregates aligned with the active-member rule used
-- by join evaluation, capacity enforcement, board mapping and lifecycle syncing.
-- CREATE OR REPLACE preserves the existing view owner and grants.

create or replace view public.transport_groups_public_view as
select
  g.id as id,
  g.group_id,
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
  count(distinct m.request_id) filter (
    where r.id is not null and r.status not in ('closed', 'cancelled')
  ) as member_request_count,
  coalesce(sum(m.passenger_count_snapshot) filter (
    where r.id is not null and r.status not in ('closed', 'cancelled')
  ), 0)::bigint as current_passenger_count,
  coalesce(sum(m.luggage_count_snapshot) filter (
    where r.id is not null and r.status not in ('closed', 'cancelled')
  ), 0)::bigint as current_luggage_count,
  greatest(
    g.max_passengers - coalesce(sum(m.passenger_count_snapshot) filter (
      where r.id is not null and r.status not in ('closed', 'cancelled')
    ), 0),
    0
  )::bigint as remaining_passenger_count
from public.transport_groups g
left join public.transport_group_members m on m.group_id = g.group_id
left join public.transport_requests r on r.id = m.request_id
group by g.id, g.group_id;

comment on view public.transport_groups_public_view is
  'Aggregate group data for admin listings and public carpool board.';
