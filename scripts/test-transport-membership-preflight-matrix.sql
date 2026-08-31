begin;

create temporary table qa_transport_requests (
  id uuid primary key,
  membership_benefit_claim_id uuid
) on commit drop;

create temporary table qa_membership_benefit_claims (
  id uuid primary key,
  linked_order_table text,
  linked_order_id uuid,
  status text
) on commit drop;

create or replace function pg_temp.transport_membership_preflight_counts()
returns jsonb
language sql
as $$
  with direct_transport_links as (
    select id as request_id, membership_benefit_claim_id as claim_id
    from qa_transport_requests
    where membership_benefit_claim_id is not null
  ), reverse_transport_links as (
    select linked_order_id as request_id, id as claim_id
    from qa_membership_benefit_claims
    where linked_order_table = 'transport_requests'
      and linked_order_id is not null
      and status in ('selected', 'reserved', 'used', 'manual')
  ), mismatched_request_ids as (
    select direct_link.request_id
    from direct_transport_links direct_link
    where not exists (
      select 1 from reverse_transport_links reverse_link
      where reverse_link.request_id = direct_link.request_id
        and reverse_link.claim_id = direct_link.claim_id
    )
    union
    select reverse_link.request_id
    from reverse_transport_links reverse_link
    where not exists (
      select 1 from direct_transport_links direct_link
      where direct_link.request_id = reverse_link.request_id
        and direct_link.claim_id = reverse_link.claim_id
    )
  ), direct_duplicates as (
    select claim_id from direct_transport_links group by claim_id having count(*) > 1
  ), reverse_duplicates as (
    select request_id from reverse_transport_links group by request_id having count(*) > 1
  )
  select jsonb_build_object(
    'direct_duplicates', (select count(*) from direct_duplicates),
    'reverse_duplicates', (select count(*) from reverse_duplicates),
    'mismatched_requests', (select count(*) from mismatched_request_ids)
  );
$$;

create or replace function pg_temp.assert_preflight(
  fixture_name text,
  expected_direct_duplicates integer,
  expected_reverse_duplicates integer,
  expected_mismatched_requests integer
)
returns void
language plpgsql
as $$
declare
  actual jsonb := pg_temp.transport_membership_preflight_counts();
begin
  if (actual ->> 'direct_duplicates')::integer <> expected_direct_duplicates
     or (actual ->> 'reverse_duplicates')::integer <> expected_reverse_duplicates
     or (actual ->> 'mismatched_requests')::integer <> expected_mismatched_requests then
    raise exception 'fixture % failed: expected direct=% reverse=% mismatch=%, actual=%',
      fixture_name, expected_direct_duplicates, expected_reverse_duplicates, expected_mismatched_requests, actual;
  end if;
  raise notice 'PASS % expected=direct:% reverse:% mismatch:% actual=%',
    fixture_name, expected_direct_duplicates, expected_reverse_duplicates, expected_mismatched_requests, actual;
end;
$$;

-- 1. Unbound selected claim.
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000001', null, null, 'selected');
select pg_temp.assert_preflight('01_unbound_selected', 0, 0, 0);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 2a/2b. Manual selected and manual claims.
insert into qa_membership_benefit_claims values
  ('00000000-0000-0000-0000-000000000002', 'manual', null, 'selected'),
  ('00000000-0000-0000-0000-000000000003', 'manual', null, 'manual');
select pg_temp.assert_preflight('02_manual_claims', 0, 0, 0);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 3. Normal reserved storage claim.
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000004', 'storage_orders', '10000000-0000-0000-0000-000000000001', 'reserved');
select pg_temp.assert_preflight('03_storage_reserved', 0, 0, 0);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 4. Any other non-transport business table.
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000005', 'other_business', '10000000-0000-0000-0000-000000000002', 'reserved');
select pg_temp.assert_preflight('04_other_business', 0, 0, 0);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 5. Correct bidirectional transport link.
insert into qa_transport_requests values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000006');
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000006', 'transport_requests', '20000000-0000-0000-0000-000000000001', 'reserved');
select pg_temp.assert_preflight('05_valid_transport_link', 0, 0, 0);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 6. Cancelled transport claim is not live.
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000007', 'transport_requests', '20000000-0000-0000-0000-000000000002', 'cancelled');
select pg_temp.assert_preflight('06_cancelled_excluded', 0, 0, 0);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 7. Direct-only link.
insert into qa_transport_requests values ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000008');
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000008', null, null, 'selected');
select pg_temp.assert_preflight('07_direct_only', 0, 0, 1);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 8. Reverse-only link.
insert into qa_transport_requests values ('20000000-0000-0000-0000-000000000004', null);
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000009', 'transport_requests', '20000000-0000-0000-0000-000000000004', 'reserved');
select pg_temp.assert_preflight('08_reverse_only', 0, 0, 1);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 9. Direct and reverse point to different claims.
insert into qa_transport_requests values ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000010');
insert into qa_membership_benefit_claims values
  ('00000000-0000-0000-0000-000000000010', null, null, 'selected'),
  ('00000000-0000-0000-0000-000000000011', 'transport_requests', '20000000-0000-0000-0000-000000000005', 'reserved');
select pg_temp.assert_preflight('09_different_claims', 0, 0, 1);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 10. Reverse link points to a missing transport request.
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000012', 'transport_requests', '20000000-0000-0000-0000-000000000006', 'reserved');
select pg_temp.assert_preflight('10_reverse_missing_order', 0, 0, 1);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 11. One claim is directly referenced by two requests.
insert into qa_transport_requests values
  ('20000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000013'),
  ('20000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000013');
insert into qa_membership_benefit_claims values ('00000000-0000-0000-0000-000000000013', 'transport_requests', '20000000-0000-0000-0000-000000000007', 'reserved');
select pg_temp.assert_preflight('11_duplicate_direct_claim', 1, 0, 1);
truncate qa_transport_requests, qa_membership_benefit_claims;

-- 12. One request has two live reverse claims.
insert into qa_transport_requests values ('20000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000014');
insert into qa_membership_benefit_claims values
  ('00000000-0000-0000-0000-000000000014', 'transport_requests', '20000000-0000-0000-0000-000000000009', 'reserved'),
  ('00000000-0000-0000-0000-000000000015', 'transport_requests', '20000000-0000-0000-0000-000000000009', 'reserved');
select pg_temp.assert_preflight('12_duplicate_reverse_claim', 0, 1, 1);

rollback;
