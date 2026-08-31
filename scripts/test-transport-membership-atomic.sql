\set ON_ERROR_STOP on
begin;

do $$
declare
  v_operator uuid := 'a1000000-0000-4000-8000-000000000001';
  v_super uuid := 'a1000000-0000-4000-8000-000000000002';
  v_advisor uuid := 'a1000000-0000-4000-8000-000000000003';
  v_user_a uuid := 'b1000000-0000-4000-8000-000000000001';
  v_user_b uuid := 'b1000000-0000-4000-8000-000000000002';
  v_entitlement_a uuid := 'c1000000-0000-4000-8000-000000000001';
  v_entitlement_b uuid := 'c1000000-0000-4000-8000-000000000002';
  v_entitlement_no_claim uuid := 'c1000000-0000-4000-8000-000000000003';
  v_claim_a uuid := 'd1000000-0000-4000-8000-000000000001';
  v_claim_b uuid := 'd1000000-0000-4000-8000-000000000002';
  v_request uuid := 'e1000000-0000-4000-8000-000000000001';
  v_request_no_claim uuid := 'e1000000-0000-4000-8000-000000000002';
  v_dropoff uuid := 'e1000000-0000-4000-8000-000000000003';
  v_result jsonb;
  v_replay jsonb;
  v_created_claim uuid;
  v_before_payment jsonb;
  v_after_payment jsonb;
  v_count integer;
begin
  insert into public.admin_users (id, username, name, role, status, password_hash)
  values
    (v_operator, 'qa_tm_operator', 'QA operator', 'operations_admin', 'active', 'not-a-login-hash'),
    (v_super, 'qa_tm_super', 'QA super', 'super_admin', 'active', 'not-a-login-hash'),
    (v_advisor, 'qa_tm_advisor', 'QA advisor', 'operations_admin', 'active', 'not-a-login-hash');

  insert into public.site_users (id, email, nickname, phone, wechat_id)
  values
    (v_user_a, 'qa-tm-a@example.invalid', 'QA A', '+447000000001', 'qa_tm_a'),
    (v_user_b, 'qa-tm-b@example.invalid', 'QA B', '+447000000002', 'qa_tm_b');

  insert into public.membership_entitlements (
    id, site_user_id, membership_cycle, status, advisor_admin_id, created_by_admin_id, granted_by_admin_id,
    valid_from, valid_until
  ) values
    (v_entitlement_a, v_user_a, '2026-27', 'active', v_advisor, v_operator, v_operator, current_date - 1, current_date + 30),
    (v_entitlement_b, v_user_b, '2027-28', 'active', v_advisor, v_operator, v_operator, current_date - 1, current_date + 30),
    (v_entitlement_no_claim, v_user_b, '2028-29', 'active', v_advisor, v_operator, v_operator, current_date - 1, current_date + 30);

  insert into public.membership_benefit_claims (
    id, entitlement_id, benefit_type, status, selected_at
  ) values
    (v_claim_a, v_entitlement_a, 'pickup', 'selected', now()),
    (v_claim_b, v_entitlement_b, 'pickup', 'selected', now());

  insert into public.transport_requests (
    id, order_no, order_type, business_date, service_type, student_name, email, phone, wechat,
    passenger_count, luggage_count, airport_code, airport_name, terminal, flight_no, flight_datetime,
    location_from, location_to, shareable, status, payment_collection_status, deposit_amount_gbp,
    manual_price_gbp, manual_payment_status, source
  ) values
    (v_request, 'QA-TM-ATOMIC-1', 'pickup', current_date, 'pickup', 'Original name', 'old@example.invalid',
      '+447000009999', 'old_wechat', 1, 1, 'LHR', 'Heathrow', 'T2', 'QA100', now() + interval '3 days',
      'LHR', 'London', false, 'published', 'fully_paid', 25.00, 88.00, 'paid', 'admin_manual'),
    (v_request_no_claim, 'QA-TM-ATOMIC-2', 'pickup', current_date, 'pickup', 'No claim', null,
      '+447000008888', null, 1, 0, 'LHR', 'Heathrow', 'T3', 'QA200', now() + interval '4 days',
      'LHR', 'London', false, 'published', 'deposit_paid', 10.00, 50.00, 'pending', 'admin_manual'),
    (v_dropoff, 'QA-TM-ATOMIC-3', 'pickup', current_date, 'dropoff', 'Dropoff', null,
      '+447000007777', null, 1, 0, 'LHR', 'Heathrow', 'T4', 'QA300', now() + interval '5 days',
      'London', 'LHR', false, 'published', 'unpaid', null, null, null, 'admin_manual');

  select jsonb_build_object(
    'payment_collection_status', payment_collection_status,
    'deposit_amount_gbp', deposit_amount_gbp,
    'manual_price_gbp', manual_price_gbp,
    'manual_payment_status', manual_payment_status
  ) into v_before_payment from public.transport_requests where id = v_request;

  v_result := public.admin_manage_transport_membership_link(
    v_operator, 'f1000000-0000-4000-8000-000000000001', 'link', v_request,
    v_entitlement_a, v_claim_a, null, 'QA link existing paid pickup order', false, false
  );
  if (v_result ->> 'membership_claim_id')::uuid <> v_claim_a then
    raise exception 'link result did not return the selected claim';
  end if;

  select jsonb_build_object(
    'payment_collection_status', payment_collection_status,
    'deposit_amount_gbp', deposit_amount_gbp,
    'manual_price_gbp', manual_price_gbp,
    'manual_payment_status', manual_payment_status
  ) into v_after_payment from public.transport_requests where id = v_request;
  if v_before_payment is distinct from v_after_payment then
    raise exception 'membership link changed payment fields: before %, after %', v_before_payment, v_after_payment;
  end if;
  if not exists (
    select 1 from public.transport_requests tr
    join public.membership_benefit_claims c on c.id = tr.membership_benefit_claim_id
    where tr.id = v_request and tr.site_user_id = v_user_a
      and tr.membership_advisor_admin_id = v_advisor
      and tr.membership_linked_by_admin_id = v_operator
      and c.linked_order_table = 'transport_requests' and c.linked_order_id = tr.id
      and c.status = 'reserved'
  ) then
    raise exception 'link did not create a consistent bidirectional association and advisor snapshot';
  end if;
  update public.membership_entitlements set advisor_admin_id = v_operator where id = v_entitlement_a;
  if not exists (
    select 1 from public.admin_transport_requests_membership_view
    where id = v_request
      and effective_membership_advisor_id = v_advisor
      and current_membership_advisor_id = v_operator
  ) then
    raise exception 'membership view did not preserve the order advisor snapshot separately from the current advisor';
  end if;
  update public.membership_entitlements set advisor_admin_id = v_advisor where id = v_entitlement_a;

  v_replay := public.admin_manage_transport_membership_link(
    v_operator, 'f1000000-0000-4000-8000-000000000001', 'link', v_request,
    v_entitlement_a, v_claim_a, null, 'QA link existing paid pickup order', false, false
  );
  if coalesce((v_replay ->> 'idempotent_replay')::boolean, false) is not true then
    raise exception 'same idempotency key and payload did not replay';
  end if;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000001', 'unlink', v_request,
      null, null, v_claim_a, 'different payload', false, false
    );
    raise exception 'different payload reused an idempotency key';
  exception when unique_violation then null;
  end;

  perform public.admin_manage_transport_membership_link(
    v_operator, 'f1000000-0000-4000-8000-000000000002', 'replace', v_request,
    v_entitlement_b, v_claim_b, v_claim_a, 'QA replace member benefit', false, false
  );
  if not exists (
    select 1 from public.transport_requests where id = v_request
      and membership_benefit_claim_id = v_claim_b and site_user_id = v_user_b
  ) or not exists (
    select 1 from public.membership_benefit_claims where id = v_claim_a
      and status = 'selected' and linked_order_id is null and linked_order_table is null
  ) then
    raise exception 'replace did not release the old claim and bind the new claim atomically';
  end if;

  perform public.admin_manage_transport_membership_link(
    v_operator, 'f1000000-0000-4000-8000-000000000003', 'unlink', v_request,
    null, null, v_claim_b, 'QA unlink unused claim', false, false
  );
  if exists (select 1 from public.transport_requests where id = v_request and membership_benefit_claim_id is not null)
     or exists (select 1 from public.membership_benefit_claims where id = v_claim_b and linked_order_id is not null) then
    raise exception 'unlink left one side of the association populated';
  end if;

  v_result := public.admin_manage_transport_membership_link(
    v_operator, 'f1000000-0000-4000-8000-000000000004', 'link', v_request_no_claim,
    v_entitlement_no_claim, null, null, 'QA create pickup claim and link', false, false
  );
  v_created_claim := (v_result ->> 'membership_claim_id')::uuid;
  if not exists (
    select 1 from public.membership_benefit_claims where id = v_created_claim
      and entitlement_id = v_entitlement_no_claim and benefit_type = 'pickup'
      and status = 'reserved' and linked_order_id = v_request_no_claim
  ) then
    raise exception 'active entitlement without a claim did not create and bind one pickup claim';
  end if;

  update public.membership_benefit_claims set status = 'used', used_at = now() where id = v_created_claim;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000005', 'unlink', v_request_no_claim,
      null, null, v_created_claim, 'operator attempts used unlink', true, false
    );
    raise exception 'operations_admin unlinked a used claim';
  exception when insufficient_privilege then null;
  end;
  perform public.admin_manage_transport_membership_link(
    v_super, 'f1000000-0000-4000-8000-000000000006', 'unlink', v_request_no_claim,
    null, null, v_created_claim, 'super confirmed used unlink', true, false
  );
  if not exists (
    select 1 from public.membership_benefit_claims where id = v_created_claim
      and status = 'used' and linked_order_id is null
  ) then
    raise exception 'super_admin used unlink did not preserve used status and clear the order binding';
  end if;
  if not exists (
    select 1 from public.membership_audit_logs
    where claim_id = v_created_claim
      and action = 'transport_membership_unlink'
      and metadata #>> '{historical_usage,order_id}' = v_request_no_claim::text
      and metadata #>> '{historical_usage,order_no}' = 'QA-TM-ATOMIC-2'
      and metadata #>> '{historical_usage,site_user_id}' = v_user_b::text
      and metadata #>> '{historical_usage,entitlement_id}' = v_entitlement_no_claim::text
      and metadata #>> '{historical_usage,claim_id}' = v_created_claim::text
      and metadata #>> '{historical_usage,advisor_admin_id}' = v_advisor::text
      and metadata #>> '{historical_usage,operator_admin_id}' = v_super::text
      and nullif(metadata #>> '{historical_usage,operated_at}', '') is not null
      and metadata #>> '{historical_usage,reason}' = 'super confirmed used unlink'
      and after_data #>> '{previous_claim,status}' = 'used'
  ) then
    raise exception 'used unlink audit does not permanently preserve the full historical relationship';
  end if;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000014', 'link', v_request,
      v_entitlement_no_claim, v_created_claim, null, 'used claim must not be rebound', false, false
    );
    raise exception 'used claim was rebound to another order';
  exception when check_violation then null;
  end;

  perform public.admin_manage_transport_membership_link(
    v_operator, 'f1000000-0000-4000-8000-000000000015', 'link', v_request,
    v_entitlement_a, v_claim_a, null, 'QA link before site user conflict', false, false
  );
  update public.transport_requests set site_user_id = v_user_b where id = v_request;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000016', 'unlink', v_request,
      null, null, v_claim_a, 'normal unlink must not overwrite later site user', false, false
    );
    raise exception 'normal unlink overwrote a later site_user_id correction';
  exception when check_violation then null;
  end;
  perform public.admin_manage_transport_membership_link(
    v_super, 'f1000000-0000-4000-8000-000000000017', 'unlink', v_request,
    null, null, v_claim_a, 'super force unlink preserves later site user', false, true
  );
  if not exists (
    select 1 from public.transport_requests
    where id = v_request and site_user_id = v_user_b and membership_benefit_claim_id is null
  ) then
    raise exception 'super force unlink did not preserve the later legitimate site_user_id value';
  end if;
  if not exists (
    select 1 from public.membership_audit_logs
    where claim_id = v_claim_a and action = 'transport_membership_unlink'
      and (metadata ->> 'site_user_changed_after_link')::boolean is true
      and (metadata ->> 'forced')::boolean is true
      and before_data #>> '{request,site_user_id}' = v_user_b::text
      and after_data #>> '{request,site_user_id}' = v_user_b::text
  ) then
    raise exception 'forced site_user_id conflict correction was not fully audited';
  end if;

  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000007', 'link', v_dropoff,
      v_entitlement_a, v_claim_a, null, 'dropoff rejection', false, false
    );
    raise exception 'dropoff order accepted a pickup membership claim';
  exception when invalid_parameter_value then null;
  end;

  update public.membership_entitlements set status = 'revoked' where id = v_entitlement_a;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000008', 'link', v_request,
      v_entitlement_a, v_claim_a, null, 'revoked entitlement rejection', false, false
    );
    raise exception 'revoked entitlement was linked';
  exception when invalid_parameter_value then null;
  end;
  update public.membership_entitlements set status = 'active', valid_until = current_date - 1 where id = v_entitlement_a;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000009', 'link', v_request,
      v_entitlement_a, v_claim_a, null, 'expired entitlement rejection', false, false
    );
    raise exception 'expired entitlement was linked';
  exception when invalid_parameter_value then null;
  end;
  update public.membership_entitlements set valid_until = current_date + 30 where id = v_entitlement_a;

  update public.membership_benefit_claims set benefit_type = 'storage' where id = v_claim_a;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000010', 'link', v_request,
      v_entitlement_a, v_claim_a, null, 'non-pickup claim rejection', false, false
    );
    raise exception 'storage claim was linked to a pickup order';
  exception when check_violation then null;
  end;
  update public.membership_benefit_claims set benefit_type = 'pickup' where id = v_claim_a;

  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000011', 'link', v_request,
      v_entitlement_a, v_claim_b, null, 'claim identity mismatch rejection', false, false
    );
    raise exception 'claim from another entitlement was accepted';
  exception when check_violation then null;
  end;

  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000012', 'link', v_request,
      v_entitlement_a, v_claim_a, null, '', false, false
    );
    raise exception 'empty operation reason was accepted';
  exception when invalid_parameter_value then null;
  end;

  update public.admin_users set status = 'disabled' where id = v_operator;
  begin
    perform public.admin_manage_transport_membership_link(
      v_operator, 'f1000000-0000-4000-8000-000000000013', 'link', v_request,
      v_entitlement_a, v_claim_a, null, 'disabled admin rejection', false, false
    );
    raise exception 'disabled administrator executed a membership operation';
  exception when insufficient_privilege then null;
  end;
  update public.admin_users set status = 'active' where id = v_operator;

  select count(*) into v_count from public.membership_audit_logs
  where metadata ->> 'request_id' in (v_request::text, v_request_no_claim::text);
  if v_count < 5 then
    raise exception 'expected membership audit rows were not written';
  end if;
  select count(*) into v_count from public.admin_operation_logs
  where target_type = 'transport_request' and target_id in (v_request, v_request_no_claim)
    and action like 'transport_membership_%';
  if v_count < 5 then
    raise exception 'expected admin operation rows were not written';
  end if;

  raise notice 'transport membership atomic transaction assertions passed';
end;
$$;

rollback;
