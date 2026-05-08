alter table storage_orders
  drop constraint if exists storage_orders_order_type_check;

alter table storage_orders
  add constraint storage_orders_order_type_check
  check (order_type in ('storage', 'box_delivery', 'storage_collection', 'storage_return'));

alter table storage_orders
  drop constraint if exists storage_orders_notification_status_check;

alter table storage_orders
  add constraint storage_orders_notification_status_check
  check (notification_status in ('pending', 'sent', 'failed', 'skipped'));

alter table storage_orders
  add column if not exists service_time_slot text,
  add column if not exists storage_start_date date,
  add column if not exists expected_storage_end_date date,
  add column if not exists related_order_no text,
  add column if not exists postcode text,
  add column if not exists room_or_building text,
  add column if not exists address_key text,
  add column if not exists has_lift boolean,
  add column if not exists needs_upstairs boolean,
  add column if not exists item_description text,
  add column if not exists student_email_status text not null default 'pending',
  add column if not exists student_email_error text,
  add column if not exists student_email_sent_at timestamptz;

alter table storage_orders
  drop constraint if exists storage_orders_student_email_status_check;

alter table storage_orders
  add constraint storage_orders_student_email_status_check
  check (student_email_status in ('pending', 'sent', 'failed', 'skipped'));

update storage_orders
set service_time_slot = service_time
where service_time_slot is null
  and service_time is not null;

create index if not exists idx_storage_orders_user_date_address_active
  on storage_orders(order_type, site_user_id, service_date, address_key)
  where status in ('pending_confirmation', 'confirmed');

create index if not exists idx_storage_orders_return_related_active
  on storage_orders(site_user_id, related_order_no)
  where order_type = 'storage_return'
    and related_order_no is not null
    and status in ('pending_confirmation', 'confirmed');

create or replace function sync_storage_order_to_orders()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_completed_at timestamptz;
begin
  if tg_op = 'DELETE' then
    delete from orders where source_table = 'storage_orders' and source_id = old.id;
    return old;
  end if;

  v_completed_at := case
    when new.status in ('confirmed', 'cancelled') then coalesce(new.updated_at, new.created_at, now())
    else null
  end;

  insert into orders (
    source_table,
    source_id,
    order_no,
    user_id,
    service_type,
    customer_name,
    phone,
    wechat_or_whatsapp,
    status,
    storage_start_date,
    storage_end_date,
    completed_at,
    created_at,
    updated_at,
    legacy_payload
  ) values (
    'storage_orders',
    new.id,
    new.order_no,
    new.site_user_id,
    'storage',
    new.customer_name,
    new.phone,
    new.wechat_id,
    new.status,
    coalesce(new.storage_start_date, new.service_date),
    coalesce(new.expected_storage_end_date, new.storage_start_date, new.service_date),
    v_completed_at,
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now()),
    jsonb_build_object(
      'storage_order_type', new.order_type,
      'business_date', new.business_date,
      'address_full', new.address_full,
      'service_date', new.service_date,
      'service_time', new.service_time,
      'service_time_slot', coalesce(new.service_time_slot, new.service_time),
      'service_label', new.service_label,
      'postcode', new.postcode,
      'room_or_building', new.room_or_building,
      'related_order_no', new.related_order_no,
      'item_description', new.item_description,
      'estimated_box_count', new.estimated_box_count,
      'estimated_total_price', new.estimated_total_price,
      'student_email', new.student_email,
      'student_email_status', new.student_email_status,
      'notification_status', new.notification_status,
      'notification_error', new.notification_error
    )
  )
  on conflict (source_table, source_id) do update
  set
    order_no = excluded.order_no,
    user_id = excluded.user_id,
    service_type = excluded.service_type,
    customer_name = excluded.customer_name,
    phone = excluded.phone,
    wechat_or_whatsapp = excluded.wechat_or_whatsapp,
    status = excluded.status,
    storage_start_date = excluded.storage_start_date,
    storage_end_date = excluded.storage_end_date,
    completed_at = case
      when excluded.status in ('confirmed', 'cancelled') then coalesce(orders.completed_at, excluded.completed_at)
      else null
    end,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    legacy_payload = excluded.legacy_payload;

  select id into v_order_id
  from orders
  where source_table = 'storage_orders' and source_id = new.id;

  if tg_op = 'INSERT' then
    insert into order_status_logs (
      order_id,
      status,
      previous_status,
      changed_at,
      change_source,
      source_table,
      source_record_id,
      metadata
    ) values (
      v_order_id,
      new.status,
      null,
      coalesce(new.created_at, now()),
      'system_sync',
      'storage_orders',
      new.id,
      jsonb_build_object('reason', 'initial_insert')
    );
  elsif new.status is distinct from old.status then
    insert into order_status_logs (
      order_id,
      status,
      previous_status,
      changed_at,
      change_source,
      source_table,
      source_record_id
    ) values (
      v_order_id,
      new.status,
      old.status,
      coalesce(new.updated_at, now()),
      'system_sync',
      'storage_orders',
      new.id
    );
  end if;

  return new;
end;
$$;
