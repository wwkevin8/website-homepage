create extension if not exists pgcrypto;

create or replace function generate_transport_group_id()
returns text
language plpgsql
as $$
declare
  v_group_id text;
begin
  loop
    v_group_id := concat(
      'GRP-',
      to_char(timezone('Europe/London', now()), 'YYMMDD'),
      '-',
      upper(substr(md5(gen_random_uuid()::text), 1, 4))
    );

    exit when not exists (
      select 1
      from transport_groups
      where group_id = v_group_id
    );
  end loop;

  return v_group_id;
end;
$$;

with pickup_requests_without_group as (
  select tr.*
  from transport_requests tr
  left join transport_group_members tgm
    on tgm.request_id = tr.id
  where tr.service_type = 'pickup'
    and tgm.request_id is null
),
prepared_groups as (
  select
    tr.id as request_id,
    generate_transport_group_id() as group_id,
    tr.service_type,
    coalesce(tr.business_date, timezone('Europe/London', tr.flight_datetime)::date) as group_date,
    tr.airport_code,
    tr.airport_name,
    tr.terminal,
    tr.location_from,
    tr.location_to,
    tr.flight_datetime as flight_time_reference,
    coalesce(tr.preferred_time_start, tr.flight_datetime) as preferred_time_start,
    tr.preferred_time_end,
    6 as max_passengers,
    case when tr.status = 'closed' then false else true end as visible_on_frontend,
    case when tr.status = 'closed' then 'closed' else 'single_member' end as status,
    tr.notes
  from pickup_requests_without_group tr
),
inserted_groups as (
  insert into transport_groups (
    group_id,
    service_type,
    group_date,
    airport_code,
    airport_name,
    terminal,
    location_from,
    location_to,
    flight_time_reference,
    preferred_time_start,
    preferred_time_end,
    max_passengers,
    visible_on_frontend,
    status,
    notes
  )
  select
    group_id,
    service_type,
    group_date,
    airport_code,
    airport_name,
    terminal,
    location_from,
    location_to,
    flight_time_reference,
    preferred_time_start,
    preferred_time_end,
    max_passengers,
    visible_on_frontend,
    status,
    notes
  from prepared_groups
  returning group_id
)
insert into transport_group_members (
  group_id,
  request_id,
  passenger_count_snapshot,
  luggage_count_snapshot,
  is_initiator
)
select
  pg.group_id,
  pg.request_id,
  tr.passenger_count,
  tr.luggage_count,
  true
from prepared_groups pg
join pickup_requests_without_group tr
  on tr.id = pg.request_id
where not exists (
  select 1
  from transport_group_members existing_member
  where existing_member.request_id = pg.request_id
);
