create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  name text not null,
  email text unique,
  phone text,
  role text not null check (role in ('super_admin', 'operations_admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  password_hash text not null,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_admin_users_username_unique
  on admin_users(username);

create unique index if not exists idx_admin_users_email_unique
  on admin_users(email)
  where email is not null;

create index if not exists idx_admin_users_role_status
  on admin_users(role, status);

create index if not exists idx_admin_users_last_login_at
  on admin_users(last_login_at desc);

drop trigger if exists trg_admin_users_updated_at on admin_users;
create trigger trg_admin_users_updated_at
before update on admin_users
for each row
execute function set_updated_at();
