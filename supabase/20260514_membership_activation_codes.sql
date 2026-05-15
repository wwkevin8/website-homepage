-- NGN membership activation codes for the 2026-27 membership cycle.
-- This migration is additive and keeps activation codes service-role-only.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.membership_activation_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_prefix text not null,
  membership_cycle text not null default '2026-27',
  status text not null default 'active',
  bound_email text,
  bound_phone text,
  booking_reference text,
  notes text,
  generated_by_admin_id uuid,
  redeemed_by_user_id uuid,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_activation_codes_cycle_format_chk
    check (membership_cycle ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint membership_activation_codes_status_chk
    check (status in ('active', 'redeemed', 'revoked', 'expired'))
);

create index if not exists membership_activation_codes_status_idx
  on public.membership_activation_codes (status);

create index if not exists membership_activation_codes_cycle_status_idx
  on public.membership_activation_codes (membership_cycle, status);

create index if not exists membership_activation_codes_bound_email_idx
  on public.membership_activation_codes (lower(bound_email))
  where bound_email is not null;

drop trigger if exists set_membership_activation_codes_updated_at on public.membership_activation_codes;
create trigger set_membership_activation_codes_updated_at
before update on public.membership_activation_codes
for each row execute function public.set_updated_at();

alter table public.membership_activation_codes enable row level security;
alter table public.membership_activation_codes force row level security;

revoke all on public.membership_activation_codes from public;
revoke all on public.membership_activation_codes from anon;
revoke all on public.membership_activation_codes from authenticated;

notify pgrst, 'reload schema';
