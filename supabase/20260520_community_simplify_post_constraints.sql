-- Simplify community post publishing for the student information plaza.
-- Posts no longer need a public expiry time; moderation/status controls handle visibility.

alter table public.community_posts
  alter column expires_at drop not null;

alter table public.community_posts
  drop constraint if exists community_posts_status_check;

alter table public.community_posts
  add constraint community_posts_status_check
  check (status in ('active', 'closed', 'hidden', 'published', 'expired', 'deleted'));

alter table public.community_posts
  alter column status set default 'active';

alter table public.community_posts
  drop constraint if exists community_posts_title_check;

alter table public.community_posts
  drop constraint if exists community_posts_title_length_check;

alter table public.community_posts
  add constraint community_posts_title_length_check
  check (char_length(title) between 1 and 60) not valid;

alter table public.community_posts
  drop constraint if exists community_posts_content_check;

alter table public.community_posts
  drop constraint if exists community_posts_content_length_check;

alter table public.community_posts
  add constraint community_posts_content_length_check
  check (char_length(content) between 1 and 500) not valid;
