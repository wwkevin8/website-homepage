create table if not exists auth_risk_events (
  id uuid primary key default gen_random_uuid(),
  email text,
  ip text,
  user_agent text,
  action text not null,
  success boolean not null default false,
  need_captcha boolean not null default false,
  captcha_success boolean not null default false,
  error_code text,
  cleared_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_risk_events_action_created_at
  on auth_risk_events(action, created_at desc);

create index if not exists idx_auth_risk_events_email_action_created_at
  on auth_risk_events(email, action, created_at desc);

create index if not exists idx_auth_risk_events_ip_action_created_at
  on auth_risk_events(ip, action, created_at desc);

create index if not exists idx_auth_risk_events_login_failures
  on auth_risk_events(email, created_at desc)
  where action = 'login' and success = false and cleared_at is null;

alter table if exists auth_risk_events enable row level security;
alter table if exists auth_risk_events force row level security;

revoke all on table public.auth_risk_events from public, anon, authenticated;
;
