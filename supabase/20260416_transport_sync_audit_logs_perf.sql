create index if not exists transport_sync_audit_logs_mismatch_only_checked_at_idx
  on public.transport_sync_audit_logs (checked_at desc)
  where mismatch_count > 0;
