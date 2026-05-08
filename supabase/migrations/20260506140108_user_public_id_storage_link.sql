create sequence if not exists site_user_public_id_seq;

alter table if exists site_users
  add column if not exists public_user_id text;

with numbered_users as (
  select
    id,
    row_number() over (order by created_at nulls last, id) as public_number
  from site_users
  where public_user_id is null or btrim(public_user_id) = ''
)
update site_users as target
set public_user_id = 'NGN-U-' || lpad(numbered_users.public_number::text, 6, '0')
from numbered_users
where target.id = numbered_users.id;

do $$
declare
  max_public_number bigint;
begin
  select coalesce(max((regexp_match(public_user_id, '^NGN-U-([0-9]+)$'))[1]::bigint), 0)
  into max_public_number
  from site_users
  where public_user_id ~ '^NGN-U-[0-9]+$';

  if max_public_number <= 0 then
    perform setval('site_user_public_id_seq', 1, false);
  else
    perform setval('site_user_public_id_seq', max_public_number, true);
  end if;
end $$;

create or replace function assign_site_user_public_id()
returns trigger
language plpgsql
as $$
begin
  if new.public_user_id is null or btrim(new.public_user_id) = '' then
    loop
      new.public_user_id := 'NGN-U-' || lpad(nextval('site_user_public_id_seq')::text, 6, '0');
      exit when not exists (
        select 1
        from site_users
        where public_user_id = new.public_user_id
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_site_users_public_user_id on site_users;
create trigger trg_site_users_public_user_id
  before insert on site_users
  for each row
  execute function assign_site_user_public_id();

create unique index if not exists idx_site_users_public_user_id_unique
  on site_users(public_user_id);

alter table if exists site_users
  alter column public_user_id set not null;

alter table if exists users
  add column if not exists public_user_id text;

update users as target
set public_user_id = source.public_user_id
from site_users as source
where target.source_user_table = 'site_users'
  and target.source_user_id = source.id
  and (target.public_user_id is null or target.public_user_id is distinct from source.public_user_id);

create unique index if not exists idx_users_public_user_id_unique
  on users(public_user_id)
  where public_user_id is not null;

create or replace function sync_user_from_site_users()
returns trigger
language plpgsql
as $$
begin
  insert into users (
    source_user_table,
    source_user_id,
    public_user_id,
    email,
    nickname,
    phone,
    contact_preference,
    wechat_id,
    whatsapp_contact,
    avatar_url,
    nationality,
    first_login_at,
    last_login_at,
    last_login_provider,
    login_count,
    created_at,
    updated_at
  )
  values (
    'site_users',
    new.id,
    new.public_user_id,
    new.email,
    new.nickname,
    new.phone,
    new.contact_preference,
    new.wechat_id,
    new.whatsapp_contact,
    new.avatar_url,
    new.nationality,
    new.first_login_at,
    new.last_login_at,
    new.last_login_provider,
    coalesce(new.login_count, 0),
    new.created_at,
    coalesce(new.updated_at, now())
  )
  on conflict (source_user_table, source_user_id)
  do update set
    public_user_id = excluded.public_user_id,
    email = excluded.email,
    nickname = excluded.nickname,
    phone = excluded.phone,
    contact_preference = excluded.contact_preference,
    wechat_id = excluded.wechat_id,
    whatsapp_contact = excluded.whatsapp_contact,
    avatar_url = excluded.avatar_url,
    nationality = excluded.nationality,
    first_login_at = excluded.first_login_at,
    last_login_at = excluded.last_login_at,
    last_login_provider = excluded.last_login_provider,
    login_count = excluded.login_count,
    updated_at = now();

  return new;
end;
$$;

alter table if exists storage_orders
  add column if not exists site_user_id uuid references site_users(id) on delete set null,
  add column if not exists student_email text;

create index if not exists idx_storage_orders_site_user_id
  on storage_orders(site_user_id);

create index if not exists idx_storage_orders_order_no
  on storage_orders(order_no);

create index if not exists idx_storage_orders_customer_name
  on storage_orders(customer_name);

create index if not exists idx_storage_orders_phone
  on storage_orders(phone);

create index if not exists idx_storage_orders_student_email
  on storage_orders(student_email);

create index if not exists idx_storage_orders_wechat_id
  on storage_orders(wechat_id);
