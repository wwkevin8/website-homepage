-- Admin-only transport request projection with exact membership linkage.
-- Read-only: this migration does not backfill or mutate order or membership data.

drop view if exists public.admin_transport_requests_membership_view;

create view public.admin_transport_requests_membership_view
with (
  security_invoker = true,
  security_barrier = true
)
as
select
  tr.*,
  case
    when tr.membership_benefit_claim_id is not null then 'linked'
    when coalesce(reverse_claim.reverse_claim_count, 0) > 0 then 'linked'
    else 'unlinked'
  end as membership_relation,
  (
    tr.membership_benefit_claim_id is not null
    or coalesce(reverse_claim.reverse_claim_count, 0) > 0
  ) as is_membership_order,
  case
    when tr.membership_benefit_claim_id is not null then tr.membership_benefit_claim_id
    when reverse_claim.reverse_claim_count = 1 then reverse_claim.sole_reverse_claim_id
    else null
  end as resolved_membership_claim_id,
  selected_claim.entitlement_id as membership_entitlement_id,
  case
    when selected_claim.id is null or entitlement.id is null then null
    else coalesce(
      entitlement.advisor_admin_id,
      entitlement.created_by_admin_id,
      entitlement.granted_by_admin_id,
      activation_code.generated_by_admin_id
    )
  end as effective_membership_advisor_id,
  case
    when tr.membership_benefit_claim_id is not null and selected_claim.id is not null then 'direct'
    when tr.membership_benefit_claim_id is not null and selected_claim.id is null then 'direct_missing'
    when reverse_claim.reverse_claim_count = 1 then 'reverse_unique'
    when reverse_claim.reverse_claim_count > 1 then 'reverse_ambiguous'
    else 'unlinked'
  end as membership_claim_resolution,
  case
    when tr.membership_benefit_claim_id is null
      and coalesce(reverse_claim.reverse_claim_count, 0) = 0 then null
    when tr.membership_benefit_claim_id is null
      and reverse_claim.reverse_claim_count > 1 then 'ambiguous'
    when selected_claim.id is null or entitlement.id is null then 'ambiguous'
    when coalesce(
      entitlement.advisor_admin_id,
      entitlement.created_by_admin_id,
      entitlement.granted_by_admin_id,
      activation_code.generated_by_admin_id
    ) is null then 'unassigned'
    else 'assigned'
  end as membership_advisor_resolution,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'group_id', member.group_id,
          'is_initiator', member.is_initiator,
          'request_id', member.request_id
        )
        order by member.created_at
      )
      from public.transport_group_members member
      where member.request_id = tr.id
    ),
    '[]'::jsonb
  ) as transport_group_members,
  case
    when site_user.id is null then null
    else jsonb_build_object('email', site_user.email)
  end as site_users,
  exists (
    select 1
    from public.transport_group_members grouped_member
    where grouped_member.request_id = tr.id
  ) as is_grouped
from public.transport_requests tr
left join lateral (
  select
    count(*)::integer as reverse_claim_count,
    case
      when count(*) = 1 then (array_agg(claim.id order by claim.created_at, claim.id))[1]
      else null
    end as sole_reverse_claim_id
  from public.membership_benefit_claims claim
  where tr.membership_benefit_claim_id is null
    and claim.linked_order_table = 'transport_requests'
    and claim.linked_order_id = tr.id
) reverse_claim on true
left join public.membership_benefit_claims selected_claim
  on selected_claim.id = case
    when tr.membership_benefit_claim_id is not null then tr.membership_benefit_claim_id
    when reverse_claim.reverse_claim_count = 1 then reverse_claim.sole_reverse_claim_id
    else null
  end
left join public.membership_entitlements entitlement
  on entitlement.id = selected_claim.entitlement_id
left join public.membership_activation_codes activation_code
  on activation_code.id::text = entitlement.metadata ->> 'activation_code_id'
left join public.site_users site_user
  on site_user.id = tr.site_user_id;

revoke all on table public.admin_transport_requests_membership_view from public, anon, authenticated;
grant select on table public.admin_transport_requests_membership_view to service_role;

comment on view public.admin_transport_requests_membership_view is
  'Admin-only read projection for exact transport membership linkage and current effective membership advisor.';

notify pgrst, 'reload schema';

-- Rollback (run explicitly if this feature is removed):
-- revoke all on table public.admin_transport_requests_membership_view from service_role, public, anon, authenticated;
-- drop view if exists public.admin_transport_requests_membership_view;

;
