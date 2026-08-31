\set ON_ERROR_STOP on

begin;

insert into public.admin_users (id, username, name, role, status, password_hash) values
  ('51000000-0000-4000-8000-000000000001', 'local_manual_advisor_a', 'LOCAL TEST 顾问A', 'operations_admin', 'active', 'LOCAL TEST'),
  ('51000000-0000-4000-8000-000000000002', 'local_manual_advisor_b', 'LOCAL TEST 顾问B', 'operations_admin', 'active', 'LOCAL TEST');

insert into public.site_users (id, public_user_id, email, nickname) values
  ('61000000-0000-4000-8000-000000000001', 'LOCAL-MANUAL-U01', 'local-manual-u01@example.invalid', 'LOCAL TEST Manual U01'),
  ('61000000-0000-4000-8000-000000000002', 'LOCAL-MANUAL-U02', 'local-manual-u02@example.invalid', 'LOCAL TEST Manual U02'),
  ('61000000-0000-4000-8000-000000000003', 'LOCAL-MANUAL-U03', 'local-manual-u03@example.invalid', 'LOCAL TEST Manual U03'),
  ('61000000-0000-4000-8000-000000000004', 'LOCAL-MANUAL-U04', 'local-manual-u04@example.invalid', 'LOCAL TEST Manual U04'),
  ('61000000-0000-4000-8000-000000000005', 'LOCAL-MANUAL-U05', 'local-manual-u05@example.invalid', 'LOCAL TEST Manual U05'),
  ('61000000-0000-4000-8000-000000000006', 'LOCAL-MANUAL-U06', 'local-manual-u06@example.invalid', 'LOCAL TEST Manual U06');

insert into public.membership_entitlements
  (id, site_user_id, membership_cycle, status, advisor_admin_id, notes)
values
  ('71000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '2092-01', 'active', '51000000-0000-4000-8000-000000000001', 'LOCAL TEST manual advisor A'),
  ('71000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', '2092-02', 'active', '51000000-0000-4000-8000-000000000002', 'LOCAL TEST manual advisor B'),
  ('71000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', '2092-03', 'active', null, 'LOCAL TEST manual unassigned'),
  ('71000000-0000-4000-8000-000000000004', '61000000-0000-4000-8000-000000000004', '2092-04', 'active', '51000000-0000-4000-8000-000000000001', 'LOCAL TEST manual ambiguous one'),
  ('71000000-0000-4000-8000-000000000005', '61000000-0000-4000-8000-000000000005', '2092-05', 'active', '51000000-0000-4000-8000-000000000002', 'LOCAL TEST manual ambiguous two');

insert into public.transport_requests
  (id, order_no, business_date, site_user_id, service_type, student_name, email, airport_code, airport_name, flight_no, flight_datetime, location_from, location_to, status, admin_note)
values
  ('81000000-0000-4000-8000-000000000001', 'LOCAL-TEST-MANUAL-ADVISOR-A', '2092-08-24', '61000000-0000-4000-8000-000000000001', 'pickup', 'LOCAL TEST 顾问A会员订单', 'local-manual-u01@example.invalid', 'EMA', 'East Midlands', 'LT-A', '2092-08-24 10:00+00', 'LOCAL TEST Airport', 'LOCAL TEST Nottingham', 'published', 'LOCAL TEST 页面验收：顾问A'),
  ('81000000-0000-4000-8000-000000000002', 'LOCAL-TEST-MANUAL-ADVISOR-B', '2092-08-24', '61000000-0000-4000-8000-000000000002', 'pickup', 'LOCAL TEST 顾问B会员订单', 'local-manual-u02@example.invalid', 'EMA', 'East Midlands', 'LT-B', '2092-08-24 11:00+00', 'LOCAL TEST Airport', 'LOCAL TEST Nottingham', 'published', 'LOCAL TEST 页面验收：顾问B'),
  ('81000000-0000-4000-8000-000000000003', 'LOCAL-TEST-MANUAL-UNASSIGNED', '2092-08-24', '61000000-0000-4000-8000-000000000003', 'pickup', 'LOCAL TEST 未分配会员订单', 'local-manual-u03@example.invalid', 'EMA', 'East Midlands', 'LT-U', '2092-08-24 12:00+00', 'LOCAL TEST Airport', 'LOCAL TEST Nottingham', 'published', 'LOCAL TEST 页面验收：未分配'),
  ('81000000-0000-4000-8000-000000000004', 'LOCAL-TEST-MANUAL-NEEDS-REVIEW', '2092-08-24', null, 'pickup', 'LOCAL TEST 会员关联待核查', null, 'EMA', 'East Midlands', 'LT-R', '2092-08-24 13:00+00', 'LOCAL TEST Airport', 'LOCAL TEST Nottingham', 'published', 'LOCAL TEST 页面验收：需核查'),
  ('81000000-0000-4000-8000-000000000005', 'LOCAL-TEST-MANUAL-UNLINKED', '2092-08-24', '61000000-0000-4000-8000-000000000006', 'pickup', 'LOCAL TEST 未关联会员权益', 'local-manual-u06@example.invalid', 'EMA', 'East Midlands', 'LT-N', '2092-08-24 14:00+00', 'LOCAL TEST Airport', 'LOCAL TEST Nottingham', 'published', 'LOCAL TEST 页面验收：未关联会员权益');

insert into public.membership_benefit_claims
  (id, entitlement_id, benefit_type, status, linked_order_table, linked_order_id, linked_order_no, admin_note)
values
  ('91000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'pickup', 'used', 'transport_requests', '81000000-0000-4000-8000-000000000001', 'LOCAL-TEST-MANUAL-ADVISOR-A', 'LOCAL TEST manual advisor A'),
  ('91000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 'pickup', 'used', 'transport_requests', '81000000-0000-4000-8000-000000000002', 'LOCAL-TEST-MANUAL-ADVISOR-B', 'LOCAL TEST manual advisor B'),
  ('91000000-0000-4000-8000-000000000003', '71000000-0000-4000-8000-000000000003', 'pickup', 'used', 'transport_requests', '81000000-0000-4000-8000-000000000003', 'LOCAL-TEST-MANUAL-UNASSIGNED', 'LOCAL TEST manual unassigned'),
  ('91000000-0000-4000-8000-000000000004', '71000000-0000-4000-8000-000000000004', 'pickup', 'cancelled', 'transport_requests', '81000000-0000-4000-8000-000000000004', 'LOCAL-TEST-MANUAL-NEEDS-REVIEW', 'LOCAL TEST manual ambiguous one'),
  ('91000000-0000-4000-8000-000000000005', '71000000-0000-4000-8000-000000000005', 'pickup', 'cancelled', 'transport_requests', '81000000-0000-4000-8000-000000000004', 'LOCAL-TEST-MANUAL-NEEDS-REVIEW', 'LOCAL TEST manual ambiguous two');

update public.transport_requests tr
set membership_benefit_claim_id = claim.id
from public.membership_benefit_claims claim
where claim.linked_order_id = tr.id
  and tr.id in (
    '81000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000002',
    '81000000-0000-4000-8000-000000000003'
  );

commit;

select order_no, membership_relation, membership_claim_resolution,
       membership_advisor_resolution, effective_membership_advisor_id
from public.admin_transport_requests_membership_view
where id = any (array[
  '81000000-0000-4000-8000-000000000001'::uuid,
  '81000000-0000-4000-8000-000000000002'::uuid,
  '81000000-0000-4000-8000-000000000003'::uuid,
  '81000000-0000-4000-8000-000000000004'::uuid,
  '81000000-0000-4000-8000-000000000005'::uuid
]) order by order_no;
