with candidates as (
  select
    so.id as storage_order_id,
    su.id as site_user_id,
    su.public_user_id,
    (
      case when regexp_replace(coalesce(so.phone, ''), '\D', '', 'g') <> ''
             and regexp_replace(coalesce(so.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(su.phone, ''), '\D', '', 'g') then 1 else 0 end
      + case when lower(trim(coalesce(so.wechat_id, ''))) <> ''
             and lower(trim(coalesce(so.wechat_id, ''))) in (lower(trim(coalesce(su.wechat_id, ''))), lower(trim(coalesce(su.whatsapp_contact, '')))) then 1 else 0 end
      + case when lower(trim(coalesce(so.customer_name, ''))) <> ''
             and lower(trim(coalesce(so.customer_name, ''))) = lower(trim(coalesce(su.nickname, ''))) then 1 else 0 end
    ) as match_score
  from storage_orders so
  join site_users su on so.site_user_id is null
    and (
      (regexp_replace(coalesce(so.phone, ''), '\D', '', 'g') <> ''
        and regexp_replace(coalesce(so.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(su.phone, ''), '\D', '', 'g'))
      or (lower(trim(coalesce(so.wechat_id, ''))) <> ''
        and lower(trim(coalesce(so.wechat_id, ''))) in (lower(trim(coalesce(su.wechat_id, ''))), lower(trim(coalesce(su.whatsapp_contact, '')))))
      or (lower(trim(coalesce(so.customer_name, ''))) <> ''
        and lower(trim(coalesce(so.customer_name, ''))) = lower(trim(coalesce(su.nickname, ''))))
    )
),
ranked_candidates as (
  select
    *,
    count(*) over (partition by storage_order_id) as candidate_count,
    max(match_score) over (partition by storage_order_id) as best_score
  from candidates
),
safe_matches as (
  select storage_order_id, site_user_id, public_user_id, match_score
  from ranked_candidates
  where candidate_count = 1
    and match_score >= 2
    and best_score = match_score
)
update storage_orders so
set
  site_user_id = safe_matches.site_user_id,
  customer_form_json = coalesce(so.customer_form_json, '{}'::jsonb) || jsonb_build_object(
    'legacy_user_binding',
    jsonb_build_object(
      'matched', true,
      'matched_at', now(),
      'method', 'unique_name_phone_contact_backfill',
      'public_user_id', safe_matches.public_user_id,
      'match_score', safe_matches.match_score
    )
  )
from safe_matches
where so.id = safe_matches.storage_order_id
  and so.site_user_id is null;
