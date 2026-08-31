alter table public.membership_entitlements
  drop constraint if exists membership_entitlements_grant_source_check;

alter table public.membership_entitlements
  add constraint membership_entitlements_grant_source_check
  check (grant_source in ('admin', 'activation_code'));

notify pgrst, 'reload schema';;
