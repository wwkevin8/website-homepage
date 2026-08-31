\set ON_ERROR_STOP on
begin;

insert into public.admin_users(id, username, name, role, status, password_hash) values
('a1000000-0000-4000-8000-000000000001','qa_manual_ops','QA Manual Ops','operations_admin','active','test'),
('a1000000-0000-4000-8000-000000000002','qa_manual_advisor','QA Manual Advisor','super_admin','active','test');
insert into public.site_users(id, public_user_id, nickname, email, phone, wechat_id) values
('b1000000-0000-4000-8000-000000000001','QA-MANUAL-MEMBER','QA Manual Member','qa-manual@example.invalid','+447000200001','qa_manual_wechat');
insert into public.membership_entitlements(
  id, site_user_id, membership_cycle, status, valid_from, valid_until, advisor_admin_id, created_by_admin_id, granted_by_admin_id
) values
('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','2035-36','active',current_date-1,current_date+365,
 'a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');

do $$
declare
  v_request jsonb := jsonb_build_object(
    'service_type','pickup','student_name','QA Manual Member','email','qa-manual@example.invalid','phone','+447000200001',
    'wechat','qa_manual_wechat','passenger_count',1,'luggage_count',2,'airport_code','LHR','airport_name','Heathrow Airport',
    'terminal','T2','flight_no','QA-MAN-101','flight_datetime','2035-09-10T10:00:00Z','preferred_time_start','2035-09-10T11:00:00Z',
    'location_from','Heathrow Airport','location_to','Nottingham','notes','QA atomic test'
  );
  v_pricing jsonb := jsonb_build_object('membership_discount_amount',0,'extra_charge_amount',0,'final_price',0,'breakdown',jsonb_build_object('source','test'));
  v_result jsonb;
  v_replay jsonb;
  v_before integer;
  v_after integer;
begin
  select public.admin_create_membership_transport_request_atomic(
    'a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','hash-one',
    'b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',null,
    v_request,v_pricing,'create_single',null,'QA normal atomic create',false,false
  ) into v_result;
  if coalesce((v_result->>'replayed')::boolean,true) then raise exception 'first call incorrectly replayed'; end if;
  if (select membership_advisor_admin_id from public.transport_requests where id=(v_result->>'request_id')::uuid)
     <> 'a1000000-0000-4000-8000-000000000002'::uuid then raise exception 'advisor snapshot is wrong'; end if;
  if not exists(select 1 from public.membership_benefit_claims where id=(v_result->>'claim_id')::uuid and status='reserved' and linked_order_id=(v_result->>'request_id')::uuid) then
    raise exception 'claim was not created and reserved';
  end if;
  if not exists(select 1 from public.transport_group_members where request_id=(v_result->>'request_id')::uuid and group_id=v_result->>'group_id') then
    raise exception 'group membership missing';
  end if;
  if not exists(select 1 from public.admin_operation_logs where target_id=(v_result->>'request_id')::uuid and action='transport_membership_manual_create') then
    raise exception 'admin audit missing';
  end if;
  if not exists(select 1 from public.membership_audit_logs where claim_id=(v_result->>'claim_id')::uuid and action='transport_membership_manual_order_created') then
    raise exception 'membership audit missing';
  end if;

  select public.admin_create_membership_transport_request_atomic(
    'a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','hash-one',
    'b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',null,
    v_request,v_pricing,'create_single',null,'QA normal atomic create',false,false
  ) into v_replay;
  if not coalesce((v_replay->>'replayed')::boolean,false) or v_replay->>'request_id' <> v_result->>'request_id' then
    raise exception 'idempotent replay failed';
  end if;
  begin
    perform public.admin_create_membership_transport_request_atomic(
      'a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','different-hash',
      'b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',null,
      v_request,v_pricing,'create_single',null,'QA conflict',false,false
    );
    raise exception 'different payload reused idempotency key';
  exception when unique_violation then null; end;

  select count(*) into v_before from public.transport_requests where created_by_admin_id='a1000000-0000-4000-8000-000000000001';
  perform set_config('app.transport_membership_manual_failpoint','after_order',true);
  begin
    perform public.admin_create_membership_transport_request_atomic(
      'a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','hash-fail',
      'b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',null,
      v_request || jsonb_build_object('flight_no','QA-MAN-FAIL','flight_datetime','2035-09-11T10:00:00Z','preferred_time_start','2035-09-11T11:00:00Z'),
      v_pricing,'create_single',null,'QA failpoint',false,false
    );
  exception when others then null; end;
  perform set_config('app.transport_membership_manual_failpoint','',true);
  select count(*) into v_after from public.transport_requests where created_by_admin_id='a1000000-0000-4000-8000-000000000001';
  if v_after <> v_before then raise exception 'after_order failure left an order'; end if;
end $$;

do $$
declare
  v_failpoint text;
  v_entitlement_id uuid;
  v_flight_no text;
  v_cycle_index integer := 0;
  v_request jsonb;
begin
  foreach v_failpoint in array array['after_order','after_claim','after_group','audit','idempotency'] loop
    v_cycle_index := v_cycle_index + 1;
    v_entitlement_id := gen_random_uuid();
    v_flight_no := 'QA-FAULT-' || v_cycle_index::text;
    insert into public.membership_entitlements(
      id, site_user_id, membership_cycle, status, valid_from, valid_until, advisor_admin_id, created_by_admin_id, granted_by_admin_id
    ) values (
      v_entitlement_id, 'b1000000-0000-4000-8000-000000000001', (2040 + v_cycle_index)::text || '-' || right((2041 + v_cycle_index)::text, 2),
      'active', current_date-1, current_date+3650, 'a1000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'
    );
    v_request := jsonb_build_object(
      'service_type','pickup','student_name','QA Manual Member','email','qa-manual@example.invalid','phone','+447000200001',
      'wechat','qa_manual_wechat','passenger_count',1,'luggage_count',1,'airport_code','LHR','airport_name','Heathrow Airport',
      'terminal','T2','flight_no',v_flight_no,'flight_datetime',(current_date + 800 + v_cycle_index)::text || ' 10:00:00+00',
      'preferred_time_start',(current_date + 800 + v_cycle_index)::text || ' 11:00:00+00','location_from','Heathrow Airport','location_to','Nottingham'
    );
    perform set_config('app.transport_membership_manual_failpoint',v_failpoint,true);
    begin
      perform public.admin_create_membership_transport_request_atomic(
        'a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'hash-' || v_failpoint,
        'b1000000-0000-4000-8000-000000000001',v_entitlement_id,null,v_request,
        '{"membership_discount_amount":0,"extra_charge_amount":0,"final_price":0,"breakdown":{}}'::jsonb,
        'create_single',null,'fault injection ' || v_failpoint,false,false
      );
      raise exception 'failpoint % did not fail', v_failpoint;
    exception when others then
      if sqlerrm like 'failpoint % did not fail' then raise; end if;
    end;
    perform set_config('app.transport_membership_manual_failpoint','',true);
    if exists(select 1 from public.transport_requests where flight_no=v_flight_no)
       or exists(select 1 from public.membership_benefit_claims where entitlement_id=v_entitlement_id)
       or exists(select 1 from public.transport_membership_manual_operations where payload_hash='hash-' || v_failpoint) then
      raise exception 'failpoint % left partial state', v_failpoint;
    end if;
  end loop;
end $$;

do $$
declare
  v_entitlement_id uuid := gen_random_uuid();
  v_request jsonb := jsonb_build_object(
    'service_type','pickup','student_name','QA Manual Member','email','qa-manual@example.invalid','phone','+447000200001',
    'wechat','qa_manual_wechat','passenger_count',1,'luggage_count',1,'airport_code','LHR','airport_name','Heathrow Airport',
    'terminal','T2','flight_no','QA-CLOSED-GROUP','flight_datetime','2038-09-10T10:00:00Z','preferred_time_start','2038-09-10T11:00:00Z',
    'location_from','Heathrow Airport','location_to','Nottingham'
  );
begin
  insert into public.membership_entitlements(id,site_user_id,membership_cycle,status,valid_from,valid_until,advisor_admin_id,created_by_admin_id,granted_by_admin_id)
  values(v_entitlement_id,'b1000000-0000-4000-8000-000000000001','2049-50','active',current_date-1,current_date+5000,
    'a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001');
  insert into public.transport_groups(group_id,service_type,group_date,airport_code,airport_name,terminal,location_from,location_to,flight_time_reference,preferred_time_start,max_passengers,visible_on_frontend,status)
  values('GRP-QA-CLOSED','pickup','2038-09-10','LHR','Heathrow Airport','T2','Heathrow Airport','Nottingham','2038-09-10T10:00:00Z','2038-09-10T11:00:00Z',8,false,'closed');
  begin
    perform public.admin_create_membership_transport_request_atomic(
      'a1000000-0000-4000-8000-000000000001',gen_random_uuid(),'hash-closed-group',
      'b1000000-0000-4000-8000-000000000001',v_entitlement_id,null,v_request,
      '{"membership_discount_amount":0,"extra_charge_amount":0,"final_price":0,"breakdown":{}}'::jsonb,
      'join_existing','GRP-QA-CLOSED','closed group test',false,false
    );
    raise exception 'closed group was accepted';
  exception when others then
    if sqlerrm = 'closed group was accepted' then raise; end if;
  end;
  if exists(select 1 from public.transport_requests where flight_no='QA-CLOSED-GROUP')
     or exists(select 1 from public.membership_benefit_claims where entitlement_id=v_entitlement_id) then
    raise exception 'closed group rejection left partial state';
  end if;
end $$;

rollback;
