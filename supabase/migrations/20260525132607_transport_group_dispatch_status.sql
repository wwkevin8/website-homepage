-- P6B-B2: formal internal dispatch status for transport groups.
-- This field is intentionally separate from transport_groups.status, which
-- continues to represent group lifecycle/capacity state.

alter table transport_groups
  add column if not exists dispatch_status text;

update transport_groups
set dispatch_status = 'pending_dispatch'
where dispatch_status is null;

alter table transport_groups
  alter column dispatch_status set default 'pending_dispatch';

alter table transport_groups
  alter column dispatch_status set not null;

alter table transport_groups
  drop constraint if exists transport_groups_dispatch_status_check;

alter table transport_groups
  add constraint transport_groups_dispatch_status_check
  check (
    dispatch_status in (
      'pending_dispatch',
      'driver_assigned',
      'driver_notified',
      'in_progress',
      'completed',
      'cancelled'
    )
  );

create index if not exists idx_transport_groups_dispatch_status_group_date
  on transport_groups(dispatch_status, group_date desc);

create or replace view transport_groups_public_view as
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
  greatest(g.max_passengers - coalesce(sum(m.passenger_count_snapshot), 0), 0) as remaining_passenger_count,
  g.dispatch_status
from transport_groups g
left join transport_group_members m on m.group_id = g.group_id
group by g.id, g.group_id;

comment on column transport_groups.dispatch_status is 'Internal admin dispatch workflow status; separate from group lifecycle/capacity status.';
comment on view transport_groups_public_view is 'Aggregate group data for admin listings and public carpool board. Public handlers must strip internal dispatch fields.';;
