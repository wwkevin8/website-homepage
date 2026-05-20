create index if not exists idx_admin_operation_logs_target_type_target_id_created_at
  on public.admin_operation_logs(target_type, target_id, created_at desc);
