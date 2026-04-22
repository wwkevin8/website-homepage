-- Harden function execution context by pinning search_path.
-- This addresses Supabase Security Advisor warnings about mutable search_path.

alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.set_order_counter_updated_at()
  set search_path = public, pg_temp;

alter function public.allocate_order_no(text, integer)
  set search_path = public, pg_temp;

alter function public.generate_transport_group_id()
  set search_path = public, pg_temp;

alter function public.create_site_transport_request(
  text,
  text,
  date,
  uuid,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  text,
  text,
  text,
  timestamptz,
  text,
  text,
  timestamptz,
  timestamptz,
  boolean,
  text,
  boolean,
  boolean
)
  set search_path = public, pg_temp;

alter function public.sync_user_from_site_users()
  set search_path = public, pg_temp;

alter function public.sync_storage_order_to_orders()
  set search_path = public, pg_temp;

alter function public.sync_transport_request_to_orders()
  set search_path = public, pg_temp;

alter function public.sync_order_latest_note_at()
  set search_path = public, pg_temp;

alter function public.archive_orders_older_than(integer)
  set search_path = public, pg_temp;
