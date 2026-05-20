-- Lightweight membership birthday reminder service.
-- Service-role API only. Reminder emails go to advisors/admins, not students.

alter table public.membership_entitlements
  add column if not exists birthday_month smallint
    check (birthday_month is null or (birthday_month between 1 and 12)),
  add column if not exists birthday_day smallint
    check (birthday_day is null or (birthday_day between 1 and 31)),
  add column if not exists birthday_reminder_enabled boolean not null default true,
  add column if not exists advisor_admin_id uuid references public.admin_users(id) on delete set null,
  add column if not exists created_by_admin_id uuid references public.admin_users(id) on delete set null;

update public.membership_entitlements
   set created_by_admin_id = coalesce(created_by_admin_id, granted_by_admin_id),
       advisor_admin_id = coalesce(advisor_admin_id, granted_by_admin_id)
 where created_by_admin_id is null
    or advisor_admin_id is null;

update public.membership_entitlements
   set birthday_month = split_part(metadata->>'member_birthday', '-', 1)::smallint,
       birthday_day = split_part(metadata->>'member_birthday', '-', 2)::smallint
 where (birthday_month is null or birthday_day is null)
   and metadata ? 'member_birthday'
   and (metadata->>'member_birthday') ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$';

create table if not exists public.membership_birthday_reminders (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.membership_entitlements(id) on delete cascade,
  advisor_admin_id uuid references public.admin_users(id) on delete set null,
  reminder_date date not null,
  sent_to_email text,
  resend_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  created_at timestamptz not null default now(),
  constraint membership_birthday_reminders_once_per_day
    unique (membership_id, reminder_date)
);

create index if not exists idx_membership_entitlements_birthday_active
  on public.membership_entitlements (birthday_month, birthday_day, status)
  where birthday_month is not null and birthday_day is not null;

create index if not exists idx_membership_birthday_reminders_date
  on public.membership_birthday_reminders (reminder_date desc);

create index if not exists idx_membership_birthday_reminders_advisor
  on public.membership_birthday_reminders (advisor_admin_id, reminder_date desc);

alter table public.membership_birthday_reminders enable row level security;
alter table public.membership_birthday_reminders force row level security;

revoke all on table public.membership_birthday_reminders from public, anon, authenticated;

notify pgrst, 'reload schema';
