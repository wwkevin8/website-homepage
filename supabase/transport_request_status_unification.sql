create extension if not exists pgcrypto;

alter table transport_requests
  add column if not exists email_verified_snapshot boolean not null default false;

alter table transport_requests
  add column if not exists profile_verified_snapshot boolean not null default false;

alter table transport_requests
  add column if not exists admin_note text;

alter table transport_requests
  add column if not exists closed_reason text;

alter table transport_requests
  add column if not exists closed_at timestamptz;

update transport_requests
set status = case
  when status in ('grouped') then 'matched'
  when status in ('closed', 'cancelled') then 'closed'
  else 'published'
end
where status not in ('published', 'matched', 'closed');

alter table transport_requests
  drop constraint if exists transport_requests_status_check;

alter table transport_requests
  add constraint transport_requests_status_check
  check (status in ('published', 'matched', 'closed'));

create index if not exists idx_transport_requests_active_pickup_window
  on transport_requests(site_user_id, service_type, status, flight_datetime);

create index if not exists idx_transport_requests_public_status_window
  on transport_requests(status, flight_datetime);

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

create or replace function create_site_transport_request(
  p_order_no text,
  p_order_type text,
  p_business_date date,
  p_site_user_id uuid,
  p_service_type text,
  p_student_name text,
  p_phone text,
  p_wechat text,
  p_passenger_count integer,
  p_luggage_count integer,
  p_airport_code text,
  p_airport_name text,
  p_terminal text,
  p_flight_no text,
  p_flight_datetime timestamptz,
  p_location_from text,
  p_location_to text,
  p_preferred_time_start timestamptz,
  p_preferred_time_end timestamptz,
  p_shareable boolean,
  p_notes text,
  p_email_verified_snapshot boolean,
  p_profile_verified_snapshot boolean
)
returns setof transport_requests
language plpgsql
as $$
declare
  v_existing transport_requests;
  v_created transport_requests;
  v_group_id text;
begin
  if p_service_type = 'pickup' then
    perform pg_advisory_xact_lock(hashtext(concat('pickup:', coalesce(p_site_user_id::text, 'anonymous'))));

    select *
      into v_existing
    from transport_requests
    where site_user_id = p_site_user_id
      and service_type = 'pickup'
      and status in ('published', 'matched')
      and flight_datetime > now()
    order by flight_datetime asc
    limit 1;

    if found then
      raise exception 'active pickup order already exists';
    end if;
  end if;

  insert into transport_requests (
    order_no,
    order_type,
    business_date,
    site_user_id,
    service_type,
    student_name,
    phone,
    wechat,
    passenger_count,
    luggage_count,
    airport_code,
    airport_name,
    terminal,
    flight_no,
    flight_datetime,
    location_from,
    location_to,
    preferred_time_start,
    preferred_time_end,
    shareable,
    status,
    notes,
    email_verified_snapshot,
    profile_verified_snapshot
  )
  values (
    p_order_no,
    p_order_type,
    p_business_date,
    p_site_user_id,
    p_service_type,
    p_student_name,
    p_phone,
    p_wechat,
    p_passenger_count,
    p_luggage_count,
    p_airport_code,
    p_airport_name,
    p_terminal,
    p_flight_no,
    p_flight_datetime,
    p_location_from,
    p_location_to,
    p_preferred_time_start,
    p_preferred_time_end,
    p_shareable,
    'published',
    p_notes,
    p_email_verified_snapshot,
    p_profile_verified_snapshot
  )
  returning *
    into v_created;

  if p_service_type = 'pickup' then
    v_group_id := generate_transport_group_id();

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
    values (
      v_group_id,
      p_service_type,
      coalesce(p_business_date, timezone('Europe/London', p_flight_datetime)::date),
      p_airport_code,
      p_airport_name,
      p_terminal,
      p_location_from,
      p_location_to,
      p_flight_datetime,
      coalesce(p_preferred_time_start, p_flight_datetime),
      p_preferred_time_end,
      6,
      true,
      'single_member',
      p_notes
    );

    insert into transport_group_members (
      group_id,
      request_id,
      passenger_count_snapshot,
      luggage_count_snapshot,
      is_initiator
    )
    values (
      v_group_id,
      v_created.id,
      p_passenger_count,
      p_luggage_count,
      true
    );
  end if;

  return next v_created;
end;
$$;
