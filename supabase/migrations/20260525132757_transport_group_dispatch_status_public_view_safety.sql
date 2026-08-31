-- Keep the shared group view public-safe after P6B-B2.
-- Admin APIs should read transport_groups.dispatch_status from the base table,
-- not from the public-facing aggregate view.

drop view if exists transport_groups_public_view;

create view transport_groups_public_view as
select
  g.id,
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
  count(distinct m.request_id) as member_request_count,
  coalesce(sum(m.passenger_count_snapshot), 0) as current_passenger_count,
  coalesce(sum(m.luggage_count_snapshot), 0) as current_luggage_count,
  greatest(g.max_passengers - coalesce(sum(m.passenger_count_snapshot), 0), 0) as remaining_passenger_count
from transport_groups g
left join transport_group_members m on m.group_id = g.group_id
group by g.id, g.group_id;

comment on view transport_groups_public_view is 'Aggregate public-safe group data for admin listings and public carpool board; internal dispatch fields are read from base tables by admin APIs only.';;
