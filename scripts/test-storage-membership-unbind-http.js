"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const port = 4321;
const baseUrl = `http://127.0.0.1:${port}`;
const ids = {
  operations: "a9000000-0000-4000-8000-000000000001",
  superAdmin: "a9000000-0000-4000-8000-000000000002",
  disabled: "a9000000-0000-4000-8000-000000000003",
  member: "b9000000-0000-4000-8000-000000000001",
  entitlement: "c9000000-0000-4000-8000-000000000001",
  storageClaim: "d9000000-0000-4000-8000-000000000001",
  transportClaim: "d9000000-0000-4000-8000-000000000002",
  storageOrder: "e9000000-0000-4000-8000-000000000001",
  transportOrder: "e9000000-0000-4000-8000-000000000002"
};
const keys = {
  storage: "f9000000-0000-4000-8000-000000000001",
  transport: "f9000000-0000-4000-8000-000000000002",
  superAdmin: "f9000000-0000-4000-8000-000000000003",
  concurrentOps: "f9000000-0000-4000-8000-000000000004",
  concurrentSuper: "f9000000-0000-4000-8000-000000000005",
  manual: "f9000000-0000-4000-8000-000000000006"
};

function loadEnv() {
  for (const raw of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
  const localUrl = new URL(process.env.LOCAL_SUPABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(localUrl.hostname));
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_storage_membership_unbind_test";
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/admin/`)).status < 500) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("local server timeout");
}

async function main() {
  loadEnv();
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { hashPassword, createAdminSessionToken, ADMIN_COOKIE_NAME } = require("../api/_lib/admin-security");
  let child;

  async function cleanup() {
    await db.from("storage_membership_unbind_operations").delete().in("admin_user_id", [ids.operations, ids.superAdmin]);
    await db.from("admin_operation_logs").delete().in("target_id", [ids.storageOrder, ids.transportOrder]);
    await db.from("membership_audit_logs").delete().in("claim_id", [ids.storageClaim, ids.transportClaim]);
    await db.from("storage_orders").delete().eq("id", ids.storageOrder);
    await db.from("transport_requests").delete().eq("id", ids.transportOrder);
    await db.from("membership_benefit_claims").delete().in("id", [ids.storageClaim, ids.transportClaim]);
    await db.from("membership_entitlements").delete().eq("id", ids.entitlement);
    await db.from("site_users").delete().eq("id", ids.member);
    await db.from("admin_users").delete().in("id", [ids.operations, ids.superAdmin, ids.disabled]);
  }

  async function unbind(claimId, adminId, payload = {}, cookieOverride = null) {
    const cookie = cookieOverride === null && adminId ? `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(adminId)}` : cookieOverride;
    const response = await fetch(`${baseUrl}/api/admin/membership-claims/${claimId}/unbind-order`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ reason: "storage unlink regression", ...payload })
    });
    return { status: response.status, body: await response.json() };
  }

  try {
    await cleanup();
    let result = await db.from("admin_users").insert([
      { id: ids.operations, username: "qa_storage_unlink_ops", name: "QA Storage Ops", role: "operations_admin", status: "active", password_hash: hashPassword("test") },
      { id: ids.superAdmin, username: "qa_storage_unlink_super", name: "QA Storage Super", role: "super_admin", status: "active", password_hash: hashPassword("test") },
      { id: ids.disabled, username: "qa_storage_unlink_disabled", name: "QA Storage Disabled", role: "operations_admin", status: "disabled", password_hash: hashPassword("test") }
    ]); if (result.error) throw result.error;
    result = await db.from("site_users").insert({ id: ids.member, public_user_id: "QA-STORAGE-UNLINK", nickname: "QA Storage Member", email: "qa-storage-unlink@example.invalid", phone: "+447000900001", wechat_id: "qa_storage_unlink" }); if (result.error) throw result.error;
    result = await db.from("membership_entitlements").insert({ id: ids.entitlement, site_user_id: ids.member, membership_cycle: "2036-37", status: "active", valid_from: "2036-01-01", valid_until: "2037-12-31", advisor_admin_id: ids.superAdmin, created_by_admin_id: ids.operations, granted_by_admin_id: ids.operations }); if (result.error) throw result.error;
    result = await db.from("membership_benefit_claims").insert({ id: ids.storageClaim, entitlement_id: ids.entitlement, benefit_type: "storage", status: "reserved", selected_at: new Date().toISOString(), reserved_at: new Date().toISOString(), linked_order_table: "storage_orders", linked_order_id: ids.storageOrder, linked_order_no: "QA-STORAGE-UNLINK" }); if (result.error) throw result.error;
    result = await db.from("storage_orders").insert({ id: ids.storageOrder, order_no: "QA-STORAGE-UNLINK", business_date: "2036-06-01", site_user_id: ids.member, customer_name: "QA Storage Member", wechat_id: "qa_storage_unlink", phone: "+447000900001", address_full: "QA address", service_date: "2036-06-01", service_time: "10:00", service_label: "寄存", final_readable_message: "QA", membership_benefit_claim_id: ids.storageClaim }); if (result.error) throw result.error;

    child = spawn(process.execPath, ["scripts/dev-local.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
    await waitForServer(child);
    const { COOKIE_NAME, createUserSessionToken } = require("../api/_lib/user-auth");
    assert.equal((await unbind(ids.storageClaim, null, {}, "")).status, 401);
    assert.equal((await unbind(ids.storageClaim, null, {}, `${COOKIE_NAME}=${createUserSessionToken(ids.member)}`)).status, 401);
    assert.equal((await unbind(ids.storageClaim, ids.disabled, { idempotency_key: keys.storage, expected_storage_order_id: ids.storageOrder, expected_claim_status: "reserved" })).status, 401);
    const response = await unbind(ids.storageClaim, ids.operations, {
      idempotency_key: keys.storage,
      expected_storage_order_id: ids.storageOrder,
      expected_claim_status: "reserved"
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { data: claim } = await db.from("membership_benefit_claims").select("status,linked_order_table,linked_order_id,linked_order_no").eq("id", ids.storageClaim).single();
    const { data: order } = await db.from("storage_orders").select("membership_benefit_claim_id").eq("id", ids.storageOrder).single();
    const { data: audits } = await db.from("membership_audit_logs").select("action,admin_user_id,metadata").eq("claim_id", ids.storageClaim).eq("action", "membership_claim_order_unbound");
    const { data: adminLogs } = await db.from("admin_operation_logs").select("action,admin_user_id,metadata").eq("target_id", ids.storageOrder).eq("action", "storage_membership_claim_unbound");
    assert.deepEqual(claim, { status: "selected", linked_order_table: null, linked_order_id: null, linked_order_no: null });
    assert.equal(order.membership_benefit_claim_id, null, "storage order must clear its membership claim when the existing unbind API succeeds");
    assert.equal(audits.length, 1);
    assert.equal(audits[0].admin_user_id, ids.operations);
    assert.equal(adminLogs.length, 1);
    assert.equal(adminLogs[0].admin_user_id, ids.operations);
    assert.equal(adminLogs[0].metadata.reason, "storage unlink regression");

    const replay = await unbind(ids.storageClaim, ids.operations, {
      idempotency_key: keys.storage,
      expected_storage_order_id: ids.storageOrder,
      expected_claim_status: "reserved"
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.operation.idempotent_replay, true);
    const conflict = await unbind(ids.storageClaim, ids.operations, {
      idempotency_key: keys.storage,
      expected_storage_order_id: ids.storageOrder,
      expected_claim_status: "reserved",
      reason: "different payload"
    });
    assert.equal(conflict.status >= 400, true);

    await db.from("membership_benefit_claims").delete().eq("id", ids.storageClaim);
    result = await db.from("membership_benefit_claims").insert({ id: ids.storageClaim, entitlement_id: ids.entitlement, benefit_type: "storage", status: "reserved", selected_at: new Date().toISOString(), reserved_at: new Date().toISOString(), linked_order_table: "storage_orders", linked_order_id: ids.storageOrder, linked_order_no: "QA-STORAGE-UNLINK" }); if (result.error) throw result.error;
    result = await db.from("storage_orders").update({ membership_benefit_claim_id: ids.storageClaim }).eq("id", ids.storageOrder); if (result.error) throw result.error;
    const superResult = await unbind(ids.storageClaim, ids.superAdmin, { idempotency_key: keys.superAdmin, expected_storage_order_id: ids.storageOrder, expected_claim_status: "reserved" });
    assert.equal(superResult.status, 200);

    await db.from("membership_benefit_claims").delete().eq("id", ids.storageClaim);
    result = await db.from("membership_benefit_claims").insert({ id: ids.storageClaim, entitlement_id: ids.entitlement, benefit_type: "storage", status: "reserved", selected_at: new Date().toISOString(), reserved_at: new Date().toISOString(), linked_order_table: "storage_orders", linked_order_id: ids.storageOrder, linked_order_no: "QA-STORAGE-UNLINK" }); if (result.error) throw result.error;
    result = await db.from("storage_orders").update({ membership_benefit_claim_id: ids.storageClaim }).eq("id", ids.storageOrder); if (result.error) throw result.error;
    const concurrent = await Promise.all([
      unbind(ids.storageClaim, ids.operations, { idempotency_key: keys.concurrentOps, expected_storage_order_id: ids.storageOrder, expected_claim_status: "reserved" }),
      unbind(ids.storageClaim, ids.superAdmin, { idempotency_key: keys.concurrentSuper, expected_storage_order_id: ids.storageOrder, expected_claim_status: "reserved" })
    ]);
    assert.equal(concurrent.filter(item => item.status === 200).length, 1);
    await db.from("membership_benefit_claims").delete().eq("id", ids.storageClaim);

    result = await db.from("membership_benefit_claims").insert({ id: ids.storageClaim, entitlement_id: ids.entitlement, benefit_type: "storage", status: "manual", selected_at: new Date().toISOString(), linked_order_table: "manual", linked_order_id: ids.storageOrder, linked_order_no: "QA-STORAGE-UNLINK" }); if (result.error) throw result.error;
    const manualResult = await unbind(ids.storageClaim, ids.operations, { idempotency_key: keys.manual, expected_storage_order_id: ids.storageOrder, expected_claim_status: "manual" });
    assert.equal(manualResult.status >= 400, true);
    await db.from("membership_benefit_claims").delete().eq("id", ids.storageClaim);
    result = await db.from("membership_benefit_claims").insert({ id: ids.transportClaim, entitlement_id: ids.entitlement, benefit_type: "pickup", status: "reserved", selected_at: new Date().toISOString(), reserved_at: new Date().toISOString(), linked_order_table: "transport_requests", linked_order_id: ids.transportOrder, linked_order_no: "QA-TRANSPORT-GUARD" }); if (result.error) throw result.error;
    result = await db.from("transport_requests").insert({ id: ids.transportOrder, order_no: "QA-TRANSPORT-GUARD", order_type: "pickup", business_date: "2036-06-01", service_type: "pickup", student_name: "QA Transport", phone: "+447000900002", passenger_count: 1, luggage_count: 1, airport_code: "LHR", airport_name: "Heathrow", terminal: "T2", flight_no: "QA900", flight_datetime: "2036-06-01T10:00:00Z", location_from: "LHR", location_to: "Nottingham", shareable: false, status: "published", site_user_id: ids.member, membership_benefit_claim_id: ids.transportClaim }); if (result.error) throw result.error;
    const guarded = await unbind(ids.transportClaim, ids.superAdmin, { idempotency_key: keys.transport });
    assert.equal(guarded.status >= 400, true);
    const storageViewSource = fs.readFileSync(path.join(root, "apps/admin-vue/src/views/StorageOrderDetailView.vue"), "utf8");
    assert.match(storageViewSource, /storage_membership_claim_unbound:\s*"已解除会员寄存权益关联"/);
    console.log(JSON.stringify({ storageUnbind: "pass", storageClaimRestored: true, storageOrderCleared: true, membershipAudit: "pass", adminAudit: "pass", chineseOperationLabel: "已解除会员寄存权益关联", unauthenticated: 401, frontendUser: 401, disabledAdmin: 401, operationsAdmin: 200, superAdmin: 200, concurrencySuccesses: 1, idempotentReplay: true, payloadConflictRejected: true, manualRejected: true, transportOldEndpointBlocked: true }));
  } finally {
    if (child) child.kill();
    await cleanup();
    const checks = await Promise.all([
      db.from("storage_orders").select("id", { count: "exact", head: true }).eq("id", ids.storageOrder),
      db.from("transport_requests").select("id", { count: "exact", head: true }).eq("id", ids.transportOrder),
      db.from("membership_benefit_claims").select("id", { count: "exact", head: true }).in("id", [ids.storageClaim, ids.transportClaim])
    ]);
    assert.ok(checks.every(item => item.count === 0), "QA cleanup did not return to zero");
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
