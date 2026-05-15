-- Store the member birthday month/day entered during activation-code redemption.
-- This is additive and keeps activation-code data service-role-only.
-- Format is fixed as MM-DD, for example 08-21.

alter table public.membership_activation_codes
  add column if not exists member_birthday text;

notify pgrst, 'reload schema';
