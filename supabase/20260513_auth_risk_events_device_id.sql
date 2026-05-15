alter table if exists public.auth_risk_events
  add column if not exists device_id text;

create index if not exists idx_auth_risk_events_device_action_created_at
  on public.auth_risk_events(device_id, action, created_at desc);
