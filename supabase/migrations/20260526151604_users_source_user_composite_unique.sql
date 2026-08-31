create unique index if not exists idx_users_source_table_source_user_id_unique
  on public.users(source_user_table, source_user_id);

create or replace function public.sync_user_from_site_users()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.users
    where source_user_table = 'site_users'
      and source_user_id = old.id;
    return old;
  end if;

  insert into public.users (
    id,
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
    new.id,
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
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  )
  on conflict (source_user_table, source_user_id)
  do update set
    id = excluded.id,
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
$$;;
