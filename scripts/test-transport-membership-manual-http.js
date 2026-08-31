"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const port = 4317;
const baseUrl = `http://127.0.0.1:${port}`;
const ids = {
  ops: "a2000000-0000-4000-8000-000000000001",
  disabled: "a2000000-0000-4000-8000-000000000002",
  forged: "a2000000-0000-4000-8000-000000000003",
  advisor: "a2000000-0000-4000-8000-000000000004",
  member: "b2000000-0000-4000-8000-000000000001",
  entitlement: "c2000000-0000-4000-8000-000000000001",
  claim: "d2000000-0000-4000-8000-000000000001",
  key: "e2000000-0000-4000-8000-000000000001"
};

function loadEnv() {
  const content = fs.readFileSync(path.join(root, ".env"), "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
  const url = new URL(process.env.LOCAL_SUPABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname));
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_membership_manual_http_test";
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/pickup.html`)).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("local server timeout");
}

async function main() {
  loadEnv();
  const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { hashPassword, createAdminSessionToken, ADMIN_COOKIE_NAME } = require("../api/_lib/admin-security");
  const { COOKIE_NAME, createUserSessionToken } = require("../api/_lib/user-auth");
  let child;
  let createdRequestId;
  let ordinaryRequestId;
  let ordinaryGroupId;
  const batchRequestIds = [];
  const batchGroupIds = [];

  async function cleanup() {
    if (createdRequestId) {
      await service.from("transport_group_members").delete().eq("request_id", createdRequestId);
      await service.from("admin_operation_logs").delete().eq("target_id", createdRequestId);
      await service.from("membership_audit_logs").delete().eq("claim_id", ids.claim);
      await service.from("transport_membership_manual_operations").delete().eq("request_id", createdRequestId);
      await service.from("transport_requests").delete().eq("id", createdRequestId);
    }
    if (ordinaryRequestId) {
      await service.from("transport_group_members").delete().eq("request_id", ordinaryRequestId);
      await service.from("admin_operation_logs").delete().eq("target_id", ordinaryRequestId);
      await service.from("transport_requests").delete().eq("id", ordinaryRequestId);
    }
    if (ordinaryGroupId) await service.from("transport_groups").delete().eq("group_id", ordinaryGroupId);
    if (batchRequestIds.length) {
      await service.from("transport_group_members").delete().in("request_id", batchRequestIds);
      await service.from("admin_operation_logs").delete().in("target_id", batchRequestIds);
      await service.from("transport_requests").delete().in("id", batchRequestIds);
    }
    if (batchGroupIds.length) await service.from("transport_groups").delete().in("group_id", batchGroupIds);
    await service.from("membership_benefit_claims").delete().eq("id", ids.claim);
    await service.from("membership_entitlements").delete().eq("id", ids.entitlement);
    await service.from("site_users").delete().eq("id", ids.member);
    await service.from("admin_users").delete().in("id", [ids.ops, ids.disabled, ids.forged, ids.advisor]);
  }

  const body = {
    idempotency_key: ids.key,
    site_user_id: ids.member,
    entitlement_id: ids.entitlement,
    claim_id: ids.claim,
    reason: "HTTP membership manual test",
    confirm_contact_mismatch: false,
    group_action: "create_single",
    admin_user_id: ids.forged,
    advisor_admin_id: ids.forged,
    final_price: 9999,
    payment_status: "paid",
    row: {
      service_type: "pickup", student_name: "QA HTTP Member", email: "qa-http-member@example.invalid",
      phone: "+447000300001", wechat: "qa_http_wechat", passenger_count: 1, luggage_count: 1,
      airport_code: "LHR", terminal: "T2", flight_no: "QAHTTP101", flight_datetime: "2036-09-10 10:00",
      service_time: "2036-09-10 11:00", address: "Nottingham"
    }
  };

  async function post(cookie, payload = body) {
    const response = await fetch(`${baseUrl}/api/transport-manual-import/membership`, {
      method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(payload)
    });
    const json = await response.json();
    return { status: response.status, body: json.data || json };
  }

  try {
    await cleanup();
    let result = await service.from("admin_users").insert([
      { id: ids.ops, username: "qa_manual_http_ops", name: "QA HTTP Ops", role: "operations_admin", status: "active", password_hash: hashPassword("test") },
      { id: ids.disabled, username: "qa_manual_http_disabled", name: "QA HTTP Disabled", role: "operations_admin", status: "disabled", password_hash: hashPassword("test") },
      { id: ids.forged, username: "qa_manual_http_forged", name: "QA HTTP Forged", role: "super_admin", status: "active", password_hash: hashPassword("test") },
      { id: ids.advisor, username: "qa_manual_http_advisor", name: "QA HTTP Advisor", role: "super_admin", status: "active", password_hash: hashPassword("test") }
    ]); if (result.error) throw result.error;
    result = await service.from("site_users").insert({ id: ids.member, public_user_id: "QA-HTTP-MEMBER", nickname: "QA HTTP Member", email: "qa-http-member@example.invalid", phone: "+447000300001", wechat_id: "qa_http_wechat" }); if (result.error) throw result.error;
    result = await service.from("membership_entitlements").insert({ id: ids.entitlement, site_user_id: ids.member, membership_cycle: "2036-37", status: "active", valid_from: "2026-01-01", valid_until: "2037-12-31", advisor_admin_id: ids.advisor, created_by_admin_id: ids.ops, granted_by_admin_id: ids.ops }); if (result.error) throw result.error;
    result = await service.from("membership_benefit_claims").insert({ id: ids.claim, entitlement_id: ids.entitlement, benefit_type: "pickup", status: "selected", selected_at: new Date().toISOString() }); if (result.error) throw result.error;

    child = spawn(process.execPath, ["scripts/dev-local.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
    await waitForServer(child);
    assert.equal((await post("")).status, 401);
    assert.equal((await post(`${COOKIE_NAME}=${createUserSessionToken(ids.member)}`)).status, 401);
    assert.equal((await post(`${ADMIN_COOKIE_NAME}=${createAdminSessionToken(ids.disabled)}`)).status, 401);

    const opsCookie = `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(ids.ops)}`;
    const ordinaryResponse = await fetch(`${baseUrl}/api/transport-manual-import/manual`, {
      method: "POST", headers: { "content-type": "application/json", cookie: opsCookie },
      body: JSON.stringify({ group_action: "create_single", confirm_warnings: true, row: { service_type: "pickup", student_name: "QA ordinary manual", phone: "+447000399999", passenger_count: 1, luggage_count: 0, airport_code: "LHR", terminal: "T2", flight_no: "QA-ORDINARY-HTTP", flight_datetime: "2036-10-10 10:00", service_time: "2036-10-10 11:00", address: "Nottingham" } })
    });
    const ordinaryJson = await ordinaryResponse.json();
    assert.equal(ordinaryResponse.status, 200, JSON.stringify(ordinaryJson));
    ordinaryRequestId = ordinaryJson.data.request.id;
    ordinaryGroupId = ordinaryJson.data.group_id;
    const batchResponse = await fetch(`${baseUrl}/api/transport-manual-import/commit`, {
      method: "POST", headers: { "content-type": "application/json", cookie: opsCookie },
      body: JSON.stringify({ rows: [
        { service_type: "pickup", student_name: "QA batch one", phone: "+447000399991", passenger_count: 1, luggage_count: 0, airport_code: "LHR", terminal: "T2", flight_no: "QA-BATCH-HTTP-1", flight_datetime: "2036-11-10 10:00", service_time: "2036-11-10 11:00", address: "Nottingham" },
        { service_type: "pickup", student_name: "QA batch two", phone: "+447000399992", passenger_count: 1, luggage_count: 0, airport_code: "LHR", terminal: "T2", flight_no: "QA-BATCH-HTTP-2", flight_datetime: "2036-11-11 10:00", service_time: "2036-11-11 11:00", address: "Nottingham" }
      ], confirmed_warnings: {} })
    });
    const batchJson = await batchResponse.json();
    assert.equal(batchResponse.status, 200, JSON.stringify(batchJson));
    assert.equal(batchJson.data.imported_count, 2, JSON.stringify(batchJson));
    assert.equal(batchJson.data.rejected_count, 0, JSON.stringify(batchJson));
    batchJson.data.items.forEach(item => {
      batchRequestIds.push(item.request.id);
      batchGroupIds.push(item.group_id);
    });
    const first = await post(opsCookie);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    createdRequestId = first.body.request_id;
    assert.equal(first.body.membership_advisor_admin_id, ids.advisor);
    const { data: stored } = await service.from("transport_requests").select("created_by_admin_id,membership_advisor_admin_id,final_price,payment_collection_status").eq("id", createdRequestId).single();
    assert.equal(stored.created_by_admin_id, ids.ops);
    assert.equal(stored.membership_advisor_admin_id, ids.advisor);
    assert.notEqual(Number(stored.final_price), 9999);
    assert.equal(stored.payment_collection_status, "unpaid");

    const replay = await post(opsCookie);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.request_id, createdRequestId);
    const conflict = await post(opsCookie, { ...body, reason: "different payload" });
    assert.equal(conflict.status, 400);

    const directRpcArgs = {
      p_admin_user_id: ids.forged, p_idempotency_key: "e2000000-0000-4000-8000-000000000099", p_payload_hash: "direct-denied",
      p_site_user_id: ids.member, p_entitlement_id: ids.entitlement, p_claim_id: ids.claim,
      p_request: { service_type: "pickup", passenger_count: 1, luggage_count: 0 }, p_pricing: {},
      p_group_action: "create_single", p_target_group_id: null, p_reason: "direct denied",
      p_confirm_contact_mismatch: false, p_confirm_duplicate: false
    };
    const directAnon = await anon.rpc("admin_create_membership_transport_request_atomic", directRpcArgs);
    assert.ok(["42501", "PGRST202"].includes(directAnon.error?.code), JSON.stringify(directAnon.error));
    const authEmail = `qa-manual-auth-${Date.now()}@example.invalid`;
    const created = await service.auth.admin.createUser({ email: authEmail, password: "LocalAuth!2026", email_confirm: true });
    const signed = await anon.auth.signInWithPassword({ email: authEmail, password: "LocalAuth!2026" });
    const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${signed.data.session.access_token}` } } });
    const directAuth = await authClient.rpc("admin_create_membership_transport_request_atomic", directRpcArgs);
    assert.ok(["42501", "PGRST202"].includes(directAuth.error?.code), JSON.stringify(directAuth.error));
    await service.auth.admin.deleteUser(created.data.user.id);
    console.log(JSON.stringify({ ok: true, http: { unauthenticated: 401, frontend_user: 401, disabled_admin: 401, ordinary_manual: 200, ordinary_batch_imported: 2, operations_admin: 200, replay: 200, conflict: 400 }, direct_rpc: { anon: directAnon.error.code, authenticated: directAuth.error.code }, request_id: createdRequestId }, null, 2));
  } finally {
    if (child && child.exitCode === null) child.kill();
    await cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
