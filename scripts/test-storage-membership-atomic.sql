begin;

insert into public.admin_users (id, username, name, role, status, password_hash) values
  ('a9100000-0000-4000-8000-000000000001', 'qa_storage_atomic_ops', 'QA Storage Atomic Ops', 'operations_admin', 'active', 'qa'),
  ('a9100000-0000-4000-8000-000000000002', 'qa_storage_atomic_super', 'QA Storage Atomic Super', 'super_admin', 'active', 'qa');
insert into public.site_users (id, public_user_id, nickname, email, phone, wechat_id)
values ('b9100000-0000-4000-8000-000000000001', 'QA-STORAGE-ATOMIC', 'QA Storage Atomic', 'qa-storage-atomic@example.invalid', '+447000910001', 'qa_storage_atomic');
insert into public.membership_entitlements (id, site_user_id, membership_cycle, status, valid_from, valid_until, advisor_admin_id, created_by_admin_id, granted_by_admin_id)
values ('c9100000-0000-4000-8000-000000000001', 'b9100000-0000-4000-8000-000000000001', '2037-38', 'active', '2037-01-01', '2038-12-31', 'a9100000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001');
insert into public.membership_benefit_claims (id, entitlement_id, benefit_type, status, selected_at, reserved_at, linked_order_table, linked_order_id, linked_order_no, membership_discount_amount, extra_charge_amount, final_price)
values ('d9100000-0000-4000-8000-000000000001', 'c9100000-0000-4000-8000-000000000001', 'storage', 'reserved', now(), now(), 'storage_orders', 'e9100000-0000-4000-8000-000000000001', 'QA-STORAGE-ATOMIC', 11.25, 7.50, 88.75);
insert into public.storage_orders (id, order_no, business_date, site_user_id, customer_name, wechat_id, phone, address_full, service_date, service_time, service_label, final_readable_message, membership_benefit_claim_id, membership_discount_amount, extra_charge_amount, final_price, estimated_total_price)
values ('e9100000-0000-4000-8000-000000000001', 'QA-STORAGE-ATOMIC', '2037-06-01', 'b9100000-0000-4000-8000-000000000001', 'QA Storage Atomic', 'qa_storage_atomic', '+447000910001', 'QA address', '2037-06-01', '10:00', '寄存', 'QA', 'd9100000-0000-4000-8000-000000000001', 11.25, 7.50, 88.75, 107.50);

create function pg_temp.qa_storage_atomic_fail() returns trigger language plpgsql as $$
begin
  if current_setting('qa.storage_unbind_fail', true) = TG_TABLE_NAME then
    raise exception 'qa_forced_%', TG_TABLE_NAME;
  end if;
  return new;
end $$;
create trigger qa_storage_order_fail before update on public.storage_orders for each row execute function pg_temp.qa_storage_atomic_fail();
create trigger qa_storage_claim_fail before update on public.membership_benefit_claims for each row execute function pg_temp.qa_storage_atomic_fail();
create trigger qa_storage_audit_fail before insert on public.membership_audit_logs for each row execute function pg_temp.qa_storage_atomic_fail();

do $$
declare v_result jsonb;
begin
  v_result := public.admin_unbind_storage_membership_claim_atomic(
    'a9100000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001',
    'd9100000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001', 'reserved', '正常解绑');
  assert v_result->>'claim_status' = 'selected';
  assert (select membership_benefit_claim_id is null from public.storage_orders where id='e9100000-0000-4000-8000-000000000001');
  assert (select status='selected' and linked_order_id is null from public.membership_benefit_claims where id='d9100000-0000-4000-8000-000000000001');
  assert (select membership_discount_amount=11.25 and extra_charge_amount=7.50 and final_price=88.75 and estimated_total_price=107.50 from public.storage_orders where id='e9100000-0000-4000-8000-000000000001');
  assert (select membership_discount_amount=11.25 and extra_charge_amount=7.50 and final_price=88.75 from public.membership_benefit_claims where id='d9100000-0000-4000-8000-000000000001');
  assert (public.admin_unbind_storage_membership_claim_atomic(
    'a9100000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001',
    'd9100000-0000-4000-8000-000000000001', 'e9100000-0000-4000-8000-000000000001', 'reserved', '正常解绑')->>'idempotent_replay')::boolean;

  update public.membership_benefit_claims set status='reserved', reserved_at=now(), linked_order_table='storage_orders', linked_order_id='e9100000-0000-4000-8000-000000000001', linked_order_no='QA-STORAGE-ATOMIC' where id='d9100000-0000-4000-8000-000000000001';
  update public.storage_orders set membership_benefit_claim_id='d9100000-0000-4000-8000-000000000001' where id='e9100000-0000-4000-8000-000000000001';

  perform set_config('qa.storage_unbind_fail', 'storage_orders', true);
  begin
    perform public.admin_unbind_storage_membership_claim_atomic('a9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000002','d9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','reserved','订单失败');
    raise exception 'expected storage order failure';
  exception when others then if sqlerrm='expected storage order failure' then raise; end if; end;
  assert (select membership_benefit_claim_id='d9100000-0000-4000-8000-000000000001' from public.storage_orders where id='e9100000-0000-4000-8000-000000000001');
  assert (select status='reserved' and linked_order_id='e9100000-0000-4000-8000-000000000001' from public.membership_benefit_claims where id='d9100000-0000-4000-8000-000000000001');

  perform set_config('qa.storage_unbind_fail', 'membership_benefit_claims', true);
  begin
    perform public.admin_unbind_storage_membership_claim_atomic('a9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000003','d9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','reserved','claim失败');
    raise exception 'expected claim failure';
  exception when others then if sqlerrm='expected claim failure' then raise; end if; end;
  assert (select membership_benefit_claim_id='d9100000-0000-4000-8000-000000000001' from public.storage_orders where id='e9100000-0000-4000-8000-000000000001');
  assert (select status='reserved' from public.membership_benefit_claims where id='d9100000-0000-4000-8000-000000000001');

  perform set_config('qa.storage_unbind_fail', 'membership_audit_logs', true);
  begin
    perform public.admin_unbind_storage_membership_claim_atomic('a9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000004','d9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','reserved','审计失败');
    raise exception 'expected audit failure';
  exception when others then if sqlerrm='expected audit failure' then raise; end if; end;
  assert (select membership_benefit_claim_id='d9100000-0000-4000-8000-000000000001' from public.storage_orders where id='e9100000-0000-4000-8000-000000000001');
  assert (select status='reserved' from public.membership_benefit_claims where id='d9100000-0000-4000-8000-000000000001');

  perform set_config('qa.storage_unbind_fail', '', true);
  begin
    perform public.admin_unbind_storage_membership_claim_atomic('a9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000005','d9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000002','reserved','错误订单');
    raise exception 'expected order mismatch';
  exception when others then if sqlerrm='expected order mismatch' then raise; end if; end;
  begin
    perform public.admin_unbind_storage_membership_claim_atomic('a9100000-0000-4000-8000-000000000001','f9100000-0000-4000-8000-000000000006','d9100000-0000-4000-8000-000000000001','e9100000-0000-4000-8000-000000000001','selected','错误状态');
    raise exception 'expected state mismatch';
  exception when others then if sqlerrm='expected state mismatch' then raise; end if; end;
end $$;

rollback;
