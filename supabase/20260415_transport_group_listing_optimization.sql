create extension if not exists pg_trgm;

create index if not exists idx_transport_groups_listing_sort
on public.transport_groups(group_date asc, preferred_time_start asc, created_at desc);

create index if not exists idx_transport_groups_listing_filters
on public.transport_groups(service_type, airport_code, status, group_date asc, preferred_time_start asc, created_at desc);

create index if not exists idx_transport_group_members_group_id_created_at
on public.transport_group_members(group_id, created_at asc);

create index if not exists idx_transport_group_members_request_id_group_id
on public.transport_group_members(request_id, group_id);

create index if not exists idx_transport_requests_order_no_trgm
on public.transport_requests using gin (upper(order_no) gin_trgm_ops);

create or replace function public.admin_list_transport_groups(
  p_order_no text default null,
  p_service_type text default null,
  p_airport_code text default null,
  p_airport_name text default null,
  p_status text default null,
  p_visible_on_frontend boolean default null,
  p_date_from date default null,
  p_date_to date default null,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language sql
stable
as $$
  with normalized as (
    select
      nullif(trim(upper(p_order_no)), '') as order_no,
      nullif(trim(p_service_type), '') as service_type,
      nullif(trim(p_airport_code), '') as airport_code,
      nullif(trim(p_airport_name), '') as airport_name,
      nullif(trim(p_status), '') as status,
      p_visible_on_frontend as visible_on_frontend,
      p_date_from as date_from,
      p_date_to as date_to,
      greatest(coalesce(p_page, 1), 1) as page_no,
      least(greatest(coalesce(p_page_size, 10), 1), 100) as page_size
  ),
  filtered_groups as (
    select g.*
    from public.transport_groups g
    cross join normalized n
    where exists (
      select 1
      from public.transport_group_members m
      where m.group_id = g.group_id
    )
      and (n.service_type is null or g.service_type = n.service_type)
      and (
        (n.airport_code is not null and g.airport_code = n.airport_code)
        or (n.airport_code is null and n.airport_name is not null and g.airport_name = n.airport_name)
        or (n.airport_code is null and n.airport_name is null)
      )
      and (
        n.status is null
        or (n.status = 'active' and g.status in ('single_member', 'active', 'full'))
        or (n.status = 'closed' and g.status in ('closed', 'cancelled'))
        or (n.status not in ('active', 'closed') and g.status = n.status)
      )
      and (n.visible_on_frontend is null or g.visible_on_frontend = n.visible_on_frontend)
      and (n.date_from is null or g.group_date >= n.date_from)
      and (n.date_to is null or g.group_date <= n.date_to)
      and (
        n.order_no is null
        or exists (
          select 1
          from public.transport_group_members m
          join public.transport_requests tr on tr.id = m.request_id
          where m.group_id = g.group_id
            and upper(tr.order_no) like '%' || n.order_no || '%'
        )
      )
  ),
  total_rows as (
    select count(*)::bigint as total
    from filtered_groups
  ),
  paged_groups as (
    select g.*
    from filtered_groups g
    cross join normalized n
    order by g.group_date asc, g.preferred_time_start asc nulls last, g.created_at desc
    limit (select page_size from normalized)
    offset (select (page_no - 1) * page_size from normalized)
  ),
  member_rollups as (
    select
      m.group_id,
      count(distinct m.request_id)::bigint as member_request_count,
      coalesce(sum(m.passenger_count_snapshot), 0)::bigint as current_passenger_count,
      coalesce(sum(m.luggage_count_snapshot), 0)::bigint as current_luggage_count,
      coalesce(
        array_agg(tr.order_no order by m.created_at) filter (where tr.order_no is not null),
        '{}'::text[]
      ) as source_order_nos,
      coalesce(
        array_agg(tr.student_name order by m.created_at) filter (where tr.student_name is not null),
        '{}'::text[]
      ) as student_names
    from public.transport_group_members m
    left join public.transport_requests tr on tr.id = m.request_id
    where m.group_id in (select group_id from paged_groups)
    group by m.group_id
  ),
  enriched as (
    select
      pg.group_id as id,
      pg.group_id,
      pg.service_type,
      pg.group_date,
      pg.airport_code,
      pg.airport_name,
      pg.terminal,
      pg.location_from,
      pg.location_to,
      pg.flight_time_reference,
      pg.preferred_time_start,
      pg.preferred_time_end,
      pg.vehicle_type,
      pg.max_passengers,
      pg.visible_on_frontend,
      pg.status,
      pg.notes,
      pg.created_at,
      pg.updated_at,
      coalesce(mr.member_request_count, 0) as member_request_count,
      coalesce(mr.current_passenger_count, 0) as current_passenger_count,
      coalesce(mr.current_luggage_count, 0) as current_luggage_count,
      greatest(pg.max_passengers - coalesce(mr.current_passenger_count, 0), 0)::bigint as remaining_passenger_count,
      coalesce(mr.source_order_nos, '{}'::text[]) as source_order_nos,
      coalesce(mr.student_names, '{}'::text[]) as student_names
    from paged_groups pg
    left join member_rollups mr on mr.group_id = pg.group_id
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(enriched_row) order by enriched_row.group_date asc, enriched_row.preferred_time_start asc nulls last, enriched_row.created_at desc)
        from enriched enriched_row
      ),
      '[]'::jsonb
    ),
    'total',
    coalesce((select total from total_rows), 0)
  );
$$;
