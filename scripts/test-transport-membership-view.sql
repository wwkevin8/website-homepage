\set ON_ERROR_STOP on

create temp table local_test_baseline as
select count(*)::bigint as order_count,
       coalesce(md5(string_agg(id::text || ':' || coalesce(updated_at::text, ''), ',' order by id)), md5('')) as content_hash
from public.transport_requests;

begin;

-- FIXTURE-SEED-START
insert into public.admin_users (id, username, name, role, status, password_hash) values
  ('a1000000-0000-4000-8000-000000000001', 'local_test_advisor_a', 'LOCAL TEST 顾问A', 'operations_admin', 'active', 'LOCAL TEST'),
  ('b2000000-0000-4000-8000-000000000002', 'local_test_advisor_b', 'LOCAL TEST 顾问B', 'operations_admin', 'active', 'LOCAL TEST'),
  ('c3000000-0000-4000-8000-000000000003', 'local_test_advisor_c', 'LOCAL TEST 顾问C', 'operations_admin', 'active', 'LOCAL TEST'),
  ('d4000000-0000-4000-8000-000000000004', 'local_test_advisor_d', 'LOCAL TEST 顾问D', 'operations_admin', 'active', 'LOCAL TEST'),
  ('e5000000-0000-4000-8000-000000000005', 'local_test_advisor_disabled', 'LOCAL TEST 已停用顾问', 'operations_admin', 'disabled', 'LOCAL TEST');

insert into public.site_users (id, public_user_id, email, nickname) values
  ('11000000-0000-4000-8000-000000000001', 'LOCAL-TEST-U01', 'local-test-u01@example.invalid', 'LOCAL TEST U01'),
  ('11000000-0000-4000-8000-000000000002', 'LOCAL-TEST-U02', 'local-test-u02@example.invalid', 'LOCAL TEST U02'),
  ('11000000-0000-4000-8000-000000000003', 'LOCAL-TEST-U03', 'local-test-u03@example.invalid', 'LOCAL TEST U03'),
  ('11000000-0000-4000-8000-000000000004', 'LOCAL-TEST-U04', 'local-test-u04@example.invalid', 'LOCAL TEST U04'),
  ('11000000-0000-4000-8000-000000000005', 'LOCAL-TEST-U05', 'local-test-u05@example.invalid', 'LOCAL TEST U05'),
  ('11000000-0000-4000-8000-000000000006', 'LOCAL-TEST-U06', 'local-test-u06@example.invalid', 'LOCAL TEST U06'),
  ('11000000-0000-4000-8000-000000000007', 'LOCAL-TEST-U07', 'local-test-u07@example.invalid', 'LOCAL TEST U07'),
  ('11000000-0000-4000-8000-000000000008', 'LOCAL-TEST-U08', 'local-test-u08@example.invalid', 'LOCAL TEST U08'),
  ('11000000-0000-4000-8000-000000000009', 'LOCAL-TEST-U09', 'local-test-u09@example.invalid', 'LOCAL TEST U09'),
  ('11000000-0000-4000-8000-000000000010', 'LOCAL-TEST-U10', 'local-test-u10@example.invalid', 'LOCAL TEST U10'),
  ('11000000-0000-4000-8000-000000000011', 'LOCAL-TEST-U11', 'local-test-u11@example.invalid', 'LOCAL TEST U11'),
  ('11000000-0000-4000-8000-000000000012', 'LOCAL-TEST-U12', 'local-test-u12@example.invalid', 'LOCAL TEST U12'),
  ('11000000-0000-4000-8000-000000000013', 'LOCAL-TEST-U13', 'local-test-u13@example.invalid', 'LOCAL TEST U13');

insert into public.membership_activation_codes
  (id, code_hash, code_prefix, membership_cycle, status, generated_by_admin_id, notes)
values
  ('ac000000-0000-4000-8000-000000000001', 'LOCAL-TEST-HASH-D', 'LOCALTESTD', '2090-05', 'redeemed', 'd4000000-0000-4000-8000-000000000004', 'LOCAL TEST activation fallback');

insert into public.membership_entitlements
  (id, site_user_id, membership_cycle, status, advisor_admin_id, created_by_admin_id, granted_by_admin_id, metadata, notes)
values
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', '2090-02', 'active', 'a1000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', '{"activation_code_id":"ac000000-0000-4000-8000-000000000001"}', 'LOCAL TEST short circuit'),
  ('21000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000003', '2090-03', 'active', null, 'b2000000-0000-4000-8000-000000000002', 'c3000000-0000-4000-8000-000000000003', '{}', 'LOCAL TEST created fallback'),
  ('21000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000004', '2090-04', 'active', null, null, 'c3000000-0000-4000-8000-000000000003', '{}', 'LOCAL TEST granted fallback'),
  ('21000000-0000-4000-8000-000000000005', '11000000-0000-4000-8000-000000000005', '2090-05', 'active', null, null, null, '{"activation_code_id":"ac000000-0000-4000-8000-000000000001"}', 'LOCAL TEST activation fallback'),
  ('21000000-0000-4000-8000-000000000006', '11000000-0000-4000-8000-000000000006', '2090-06', 'active', null, null, null, '{}', 'LOCAL TEST unassigned'),
  ('21000000-0000-4000-8000-000000000007', '11000000-0000-4000-8000-000000000007', '2090-07', 'active', 'a1000000-0000-4000-8000-000000000001', null, null, '{}', 'LOCAL TEST reverse unique'),
  ('21000000-0000-4000-8000-000000000008', '11000000-0000-4000-8000-000000000008', '2090-08', 'active', 'a1000000-0000-4000-8000-000000000001', null, null, '{}', 'LOCAL TEST reverse ambiguous one'),
  ('21000000-0000-4000-8000-000000000009', '11000000-0000-4000-8000-000000000009', '2090-09', 'active', 'b2000000-0000-4000-8000-000000000002', null, null, '{}', 'LOCAL TEST reverse ambiguous two'),
  ('21000000-0000-4000-8000-000000000010', '11000000-0000-4000-8000-000000000010', '2090-10', 'active', 'a1000000-0000-4000-8000-000000000001', null, null, '{}', 'LOCAL TEST same user unbound'),
  ('21000000-0000-4000-8000-000000000111', '11000000-0000-4000-8000-000000000011', '2089-11', 'expired', 'a1000000-0000-4000-8000-000000000001', null, null, '{}', 'LOCAL TEST old cycle'),
  ('21000000-0000-4000-8000-000000000211', '11000000-0000-4000-8000-000000000011', '2090-11', 'active', 'b2000000-0000-4000-8000-000000000002', null, null, '{}', 'LOCAL TEST new cycle'),
  ('21000000-0000-4000-8000-000000000012', '11000000-0000-4000-8000-000000000012', '2090-12', 'active', 'a1000000-0000-4000-8000-000000000001', null, null, '{}', 'LOCAL TEST transfer'),
  ('21000000-0000-4000-8000-000000000013', '11000000-0000-4000-8000-000000000013', '2091-01', 'active', 'e5000000-0000-4000-8000-000000000005', null, null, '{}', 'LOCAL TEST disabled advisor');

insert into public.transport_requests
  (id, order_no, business_date, site_user_id, service_type, student_name, airport_code, airport_name, flight_datetime, location_from, location_to, status, admin_note)
select id, order_no, date '2090-08-24', user_id, 'pickup', student_name, 'EMA', 'East Midlands', timestamptz '2090-08-24 12:00:00+00', 'LOCAL TEST Airport', 'LOCAL TEST Nottingham', 'published', scenario
from (values
  ('31000000-0000-4000-8000-000000000001'::uuid, 'LOCAL-TEST-VIEW-UNLINKED', '11000000-0000-4000-8000-000000000001'::uuid, 'LOCAL TEST ordinary unlinked', 'LOCAL TEST ordinary unlinked'),
  ('31000000-0000-4000-8000-000000000002'::uuid, 'LOCAL-TEST-VIEW-DIRECT-A', '11000000-0000-4000-8000-000000000002'::uuid, 'LOCAL TEST direct A', 'LOCAL TEST direct and short circuit'),
  ('31000000-0000-4000-8000-000000000003'::uuid, 'LOCAL-TEST-VIEW-CREATED-B', '11000000-0000-4000-8000-000000000003'::uuid, 'LOCAL TEST created B', 'LOCAL TEST created fallback'),
  ('31000000-0000-4000-8000-000000000004'::uuid, 'LOCAL-TEST-VIEW-GRANTED-C', '11000000-0000-4000-8000-000000000004'::uuid, 'LOCAL TEST granted C', 'LOCAL TEST granted fallback'),
  ('31000000-0000-4000-8000-000000000005'::uuid, 'LOCAL-TEST-VIEW-ACTIVATION-D', '11000000-0000-4000-8000-000000000005'::uuid, 'LOCAL TEST activation D', 'LOCAL TEST activation fallback'),
  ('31000000-0000-4000-8000-000000000006'::uuid, 'LOCAL-TEST-VIEW-UNASSIGNED', '11000000-0000-4000-8000-000000000006'::uuid, 'LOCAL TEST unassigned', 'LOCAL TEST unassigned'),
  ('31000000-0000-4000-8000-000000000007'::uuid, 'LOCAL-TEST-VIEW-REVERSE', '11000000-0000-4000-8000-000000000007'::uuid, 'LOCAL TEST reverse unique', 'LOCAL TEST reverse unique'),
  ('31000000-0000-4000-8000-000000000008'::uuid, 'LOCAL-TEST-VIEW-AMBIGUOUS', null, 'LOCAL TEST reverse ambiguous', 'LOCAL TEST reverse ambiguous'),
  ('31000000-0000-4000-8000-000000000010'::uuid, 'LOCAL-TEST-VIEW-SAME-USER', '11000000-0000-4000-8000-000000000010'::uuid, 'LOCAL TEST same user unbound', 'LOCAL TEST same user unbound'),
  ('31000000-0000-4000-8000-000000000011'::uuid, 'LOCAL-TEST-VIEW-OLD-CYCLE', '11000000-0000-4000-8000-000000000011'::uuid, 'LOCAL TEST old cycle', 'LOCAL TEST old cycle'),
  ('31000000-0000-4000-8000-000000000012'::uuid, 'LOCAL-TEST-VIEW-TRANSFER', '11000000-0000-4000-8000-000000000012'::uuid, 'LOCAL TEST transfer', 'LOCAL TEST advisor transfer'),
  ('31000000-0000-4000-8000-000000000013'::uuid, 'LOCAL-TEST-VIEW-DISABLED', '11000000-0000-4000-8000-000000000013'::uuid, 'LOCAL TEST disabled advisor', 'LOCAL TEST disabled advisor')
) as fixture(id, order_no, user_id, student_name, scenario);

insert into public.membership_benefit_claims
  (id, entitlement_id, benefit_type, status, linked_order_table, linked_order_id, linked_order_no, admin_note)
values
  ('41000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000002', 'LOCAL-TEST-VIEW-DIRECT-A', 'LOCAL TEST direct'),
  ('41000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000003', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000003', 'LOCAL-TEST-VIEW-CREATED-B', 'LOCAL TEST created'),
  ('41000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000004', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000004', 'LOCAL-TEST-VIEW-GRANTED-C', 'LOCAL TEST granted'),
  ('41000000-0000-4000-8000-000000000005', '21000000-0000-4000-8000-000000000005', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000005', 'LOCAL-TEST-VIEW-ACTIVATION-D', 'LOCAL TEST activation'),
  ('41000000-0000-4000-8000-000000000006', '21000000-0000-4000-8000-000000000006', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000006', 'LOCAL-TEST-VIEW-UNASSIGNED', 'LOCAL TEST unassigned'),
  ('41000000-0000-4000-8000-000000000007', '21000000-0000-4000-8000-000000000007', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000007', 'LOCAL-TEST-VIEW-REVERSE', 'LOCAL TEST reverse unique'),
  ('41000000-0000-4000-8000-000000000008', '21000000-0000-4000-8000-000000000008', 'pickup', 'cancelled', 'transport_requests', '31000000-0000-4000-8000-000000000008', 'LOCAL-TEST-VIEW-AMBIGUOUS', 'LOCAL TEST ambiguous one'),
  ('41000000-0000-4000-8000-000000000009', '21000000-0000-4000-8000-000000000009', 'pickup', 'cancelled', 'transport_requests', '31000000-0000-4000-8000-000000000008', 'LOCAL-TEST-VIEW-AMBIGUOUS', 'LOCAL TEST ambiguous two'),
  ('41000000-0000-4000-8000-000000000010', '21000000-0000-4000-8000-000000000010', 'pickup', 'selected', null, null, null, 'LOCAL TEST same user but unbound'),
  ('41000000-0000-4000-8000-000000000011', '21000000-0000-4000-8000-000000000111', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000011', 'LOCAL-TEST-VIEW-OLD-CYCLE', 'LOCAL TEST old cycle'),
  ('41000000-0000-4000-8000-000000000012', '21000000-0000-4000-8000-000000000012', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000012', 'LOCAL-TEST-VIEW-TRANSFER', 'LOCAL TEST transfer'),
  ('41000000-0000-4000-8000-000000000013', '21000000-0000-4000-8000-000000000013', 'pickup', 'used', 'transport_requests', '31000000-0000-4000-8000-000000000013', 'LOCAL-TEST-VIEW-DISABLED', 'LOCAL TEST disabled advisor');

update public.transport_requests tr
set membership_benefit_claim_id = claim.id
from public.membership_benefit_claims claim
where claim.linked_order_id = tr.id
  and tr.id in (
    '31000000-0000-4000-8000-000000000002', '31000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000004', '31000000-0000-4000-8000-000000000005',
    '31000000-0000-4000-8000-000000000006', '31000000-0000-4000-8000-000000000011',
    '31000000-0000-4000-8000-000000000012', '31000000-0000-4000-8000-000000000013'
  );
-- FIXTURE-SEED-END

do $$
declare
  row_record record;
  linked_count integer;
  partition_count integer;
begin
  select * into row_record from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000001';
  assert row_record.membership_relation='unlinked' and row_record.membership_advisor_resolution is null, 'ordinary unlinked failed';
  select * into row_record from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000002';
  assert row_record.membership_claim_resolution='direct' and row_record.membership_advisor_resolution='assigned' and row_record.effective_membership_advisor_id='a1000000-0000-4000-8000-000000000001', 'direct/short circuit failed';
  assert (select effective_membership_advisor_id from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000003')='b2000000-0000-4000-8000-000000000002', 'created fallback failed';
  assert (select effective_membership_advisor_id from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000004')='c3000000-0000-4000-8000-000000000003', 'granted fallback failed';
  assert (select effective_membership_advisor_id from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000005')='d4000000-0000-4000-8000-000000000004', 'activation fallback failed';
  assert (select membership_advisor_resolution from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000006')='unassigned', 'unassigned failed';
  assert (select membership_claim_resolution from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000007')='reverse_unique', 'reverse unique failed';
  select * into row_record from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000008';
  assert row_record.membership_claim_resolution='reverse_ambiguous' and row_record.membership_advisor_resolution='ambiguous', 'reverse ambiguous failed';
  assert (select count(*) from public.admin_transport_requests_membership_view where id=row_record.id)=1, 'ambiguous duplicated order';
  assert (select membership_relation from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000010')='unlinked', 'same-user unbound inference leaked';
  assert (select effective_membership_advisor_id from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000011')='a1000000-0000-4000-8000-000000000001', 'old-cycle claim failed';
  update public.membership_entitlements set advisor_admin_id='b2000000-0000-4000-8000-000000000002' where id='21000000-0000-4000-8000-000000000012';
  assert (select effective_membership_advisor_id from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000012')='b2000000-0000-4000-8000-000000000002', 'live transfer failed';
  assert (select membership_advisor_resolution from public.admin_transport_requests_membership_view where id='31000000-0000-4000-8000-000000000013')='assigned', 'disabled advisor failed';
  assert not exists (select id from public.admin_transport_requests_membership_view where order_no like 'LOCAL-TEST-VIEW-%' group by id having count(*) > 1), 'one-order-one-row failed';
  select count(*) into linked_count from public.admin_transport_requests_membership_view where order_no like 'LOCAL-TEST-VIEW-%' and membership_relation='linked';
  select count(*) into partition_count from public.admin_transport_requests_membership_view where order_no like 'LOCAL-TEST-VIEW-%' and membership_relation='linked' and membership_advisor_resolution in ('assigned','unassigned','ambiguous');
  assert linked_count=partition_count, 'membership partition incomplete';
end $$;

select order_no, membership_relation, membership_claim_resolution, membership_advisor_resolution, effective_membership_advisor_id
from public.admin_transport_requests_membership_view where order_no like 'LOCAL-TEST-VIEW-%' order by order_no;

rollback;

select current_state.order_count = baseline.order_count as rollback_order_count_unchanged,
       current_state.content_hash = baseline.content_hash as rollback_content_unchanged,
       current_state.order_count
from local_test_baseline baseline
cross join lateral (
  select count(*)::bigint as order_count,
         coalesce(md5(string_agg(id::text || ':' || coalesce(updated_at::text, ''), ',' order by id)), md5('')) as content_hash
  from public.transport_requests
) current_state;
