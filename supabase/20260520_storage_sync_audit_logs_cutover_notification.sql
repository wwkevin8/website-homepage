alter table public.storage_sync_audit_logs
  add column if not exists cutover_at timestamptz;

alter table public.storage_sync_audit_logs
  add column if not exists notification jsonb not null default '{"sent": false, "skipped": true, "reason": "not_attempted"}'::jsonb;
