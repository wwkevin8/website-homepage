alter table if exists public.transport_sync_audit_logs enable row level security;

revoke all on table public.transport_sync_audit_logs from anon;
revoke all on table public.transport_sync_audit_logs from authenticated;;
