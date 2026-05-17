-- NGN Community Noticeboard v1.
-- Access model: service-role API only. Frontend/admin must use server APIs.

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

alter table public.site_users
  add column if not exists posting_permission_status text not null default 'normal'
    check (posting_permission_status in ('normal', 'limited', 'banned')),
  add column if not exists trust_score integer not null default 0,
  add column if not exists banned_until timestamptz,
  add column if not exists ban_reason text;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.site_users(id) on delete cascade,
  category text not null check (category in ('buddy', 'second_hand', 'sublet', 'help', 'official')),
  title text not null,
  content text not null,
  status text not null default 'published'
    check (status in ('published', 'hidden', 'expired', 'deleted')),
  city text,
  university text,
  area text,
  price numeric(10, 2),
  contact_wechat text,
  contact_phone text,
  contact_email text,
  is_pinned boolean not null default false,
  view_count integer not null default 0,
  comment_count integer not null default 0,
  report_count integer not null default 0,
  auto_hidden_reason text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  constraint community_posts_title_length_check
    check (char_length(title) >= 8 and char_length(title) <= 120),
  constraint community_posts_content_length_check
    check (char_length(content) >= 20 and char_length(content) <= 300),
  constraint community_posts_price_non_negative_check
    check (price is null or price >= 0)
);

create table if not exists public.community_post_fields (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  field_key text not null,
  field_value text,
  created_at timestamptz not null default now(),
  constraint community_post_fields_key_length_check
    check (char_length(field_key) between 1 and 64),
  constraint community_post_fields_value_length_check
    check (field_value is null or char_length(field_value) <= 500)
);

create table if not exists public.community_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.site_users(id) on delete cascade,
  storage_path text not null unique,
  public_url text,
  file_name text,
  file_type text not null,
  file_size integer not null,
  sort_order integer not null default 0,
  status text not null default 'active' check (status in ('active', 'deleted')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_post_images_size_check
    check (file_size > 0 and file_size <= 2097152)
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.site_users(id) on delete cascade,
  content text not null,
  status text not null default 'published'
    check (status in ('published', 'hidden', 'deleted')),
  report_count integer not null default 0,
  auto_hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_comments_content_length_check
    check (char_length(content) between 1 and 300)
);

create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_user_id uuid not null references public.site_users(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint community_post_reports_reason_length_check
    check (char_length(reason) between 1 and 80),
  constraint community_post_reports_details_length_check
    check (details is null or char_length(details) <= 500),
  constraint community_post_reports_unique_user unique (post_id, reporter_user_id)
);

create table if not exists public.community_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  reporter_user_id uuid not null references public.site_users(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  constraint community_comment_reports_reason_length_check
    check (char_length(reason) between 1 and 80),
  constraint community_comment_reports_details_length_check
    check (details is null or char_length(details) <= 500),
  constraint community_comment_reports_unique_user unique (comment_id, reporter_user_id)
);

create table if not exists public.community_rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.site_users(id) on delete cascade,
  ip_address text,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_posts_public
  on public.community_posts(status, category, is_pinned desc, published_at desc);

create index if not exists idx_community_posts_expiry
  on public.community_posts(status, expires_at);

create index if not exists idx_community_posts_user_created
  on public.community_posts(user_id, created_at desc);

create index if not exists idx_community_post_fields_post
  on public.community_post_fields(post_id);

create index if not exists idx_community_comments_post
  on public.community_comments(post_id, status, created_at);

create index if not exists idx_community_images_post
  on public.community_post_images(post_id, status, sort_order);

create index if not exists idx_community_post_reports_post
  on public.community_post_reports(post_id, created_at desc);

create index if not exists idx_community_comment_reports_comment
  on public.community_comment_reports(comment_id, created_at desc);

create index if not exists idx_community_rate_limits_user_action
  on public.community_rate_limits(user_id, action, created_at desc);

create index if not exists idx_community_rate_limits_ip_action
  on public.community_rate_limits(ip_address, action, created_at desc);

drop trigger if exists trg_community_posts_updated_at on public.community_posts;
create trigger trg_community_posts_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

drop trigger if exists trg_community_comments_updated_at on public.community_comments;
create trigger trg_community_comments_updated_at
before update on public.community_comments
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('community-images', 'community-images', false)
on conflict (id) do update set public = false;

alter table public.community_posts enable row level security;
alter table public.community_posts force row level security;
alter table public.community_post_fields enable row level security;
alter table public.community_post_fields force row level security;
alter table public.community_post_images enable row level security;
alter table public.community_post_images force row level security;
alter table public.community_comments enable row level security;
alter table public.community_comments force row level security;
alter table public.community_post_reports enable row level security;
alter table public.community_post_reports force row level security;
alter table public.community_comment_reports enable row level security;
alter table public.community_comment_reports force row level security;
alter table public.community_rate_limits enable row level security;
alter table public.community_rate_limits force row level security;

revoke all on table public.community_posts from public, anon, authenticated;
revoke all on table public.community_post_fields from public, anon, authenticated;
revoke all on table public.community_post_images from public, anon, authenticated;
revoke all on table public.community_comments from public, anon, authenticated;
revoke all on table public.community_post_reports from public, anon, authenticated;
revoke all on table public.community_comment_reports from public, anon, authenticated;
revoke all on table public.community_rate_limits from public, anon, authenticated;
