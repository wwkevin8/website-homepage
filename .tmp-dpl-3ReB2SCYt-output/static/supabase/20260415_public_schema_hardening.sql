-- Harden the public schema for Supabase Data API access.
-- References:
-- - Supabase RLS docs: tables in public should always have RLS enabled.
-- - Supabase view docs: views bypass RLS by default unless security_invoker is set.
-- - Supabase function docs: functions in public are executable by default unless revoked.

-- Enable and force RLS on every application table in the public schema.
alter table if exists public.admin_users enable row level security;
alter table if exists public.admin_users force row level security;

alter table if exists public.order_number_counters enable row level security;
alter table if exists public.order_number_counters force row level security;

alter table if exists public.users enable row level security;
alter table if exists public.users force row level security;

alter table if exists public.orders enable row level security;
alter table if exists public.orders force row level security;

alter table if exists public.order_status_logs enable row level security;
alter table if exists public.order_status_logs force row level security;

alter table if exists public.order_notes enable row level security;
alter table if exists public.order_notes force row level security;

alter table if exists public.order_attachments enable row level security;
alter table if exists public.order_attachments force row level security;

alter table if exists public.admin_operation_logs enable row level security;
alter table if exists public.admin_operation_logs force row level security;

alter table if exists public.storage_orders enable row level security;
alter table if exists public.storage_orders force row level security;

alter table if exists public.transport_requests enable row level security;
alter table if exists public.transport_requests force row level security;

alter table if exists public.site_users enable row level security;
alter table if exists public.site_users force row level security;

alter table if exists public.email_login_codes enable row level security;
alter table if exists public.email_login_codes force row level security;

alter table if exists public.user_login_events enable row level security;
alter table if exists public.user_login_events force row level security;

alter table if exists public.password_reset_tokens enable row level security;
alter table if exists public.password_reset_tokens force row level security;

alter table if exists public.transport_groups enable row level security;
alter table if exists public.transport_groups force row level security;

alter table if exists public.transport_group_members enable row level security;
alter table if exists public.transport_group_members force row level security;

-- Prevent the public view from bypassing the underlying table RLS policies.
alter view if exists public.transport_groups_public_view
set (security_invoker = true);

-- Revoke direct Data API access to sensitive tables/views.
revoke all on table public.admin_users from public, anon, authenticated;
revoke all on table public.order_number_counters from public, anon, authenticated;
revoke all on table public.users from public, anon, authenticated;
revoke all on table public.orders from public, anon, authenticated;
revoke all on table public.order_status_logs from public, anon, authenticated;
revoke all on table public.order_notes from public, anon, authenticated;
revoke all on table public.order_attachments from public, anon, authenticated;
revoke all on table public.admin_operation_logs from public, anon, authenticated;
revoke all on table public.storage_orders from public, anon, authenticated;
revoke all on table public.transport_requests from public, anon, authenticated;
revoke all on table public.site_users from public, anon, authenticated;
revoke all on table public.email_login_codes from public, anon, authenticated;
revoke all on table public.user_login_events from public, anon, authenticated;
revoke all on table public.password_reset_tokens from public, anon, authenticated;
revoke all on table public.transport_groups from public, anon, authenticated;
revoke all on table public.transport_group_members from public, anon, authenticated;
revoke all on table public.transport_groups_public_view from public, anon, authenticated;

-- Revoke public RPC execution in the exposed schema.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon, authenticated;

-- Keep future objects private by default unless explicitly granted.
alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
