alter table public.transport_requests
  add column if not exists student_pinyin text,
  add column if not exists contact_status text default 'uncontacted',
  add column if not exists payment_collection_status text default 'unpaid',
  add column if not exists deposit_amount_gbp numeric(10,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_contact_status_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_contact_status_check
      check (contact_status in ('uncontacted', 'contacted'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_payment_collection_status_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_payment_collection_status_check
      check (payment_collection_status in ('unpaid', 'deposit_paid', 'fully_paid'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transport_requests_deposit_amount_gbp_check'
      and conrelid = 'public.transport_requests'::regclass
  ) then
    alter table public.transport_requests
      add constraint transport_requests_deposit_amount_gbp_check
      check (deposit_amount_gbp is null or deposit_amount_gbp >= 0);
  end if;
end
$$;
