"use strict";

const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const port = 3318;
const baseUrl = `http://127.0.0.1:${port}`;
const ids = {
  admin: "52000000-0000-4000-8000-000000000001",
  user: "62000000-0000-4000-8000-000000000001",
  activation: "a2000000-0000-4000-8000-000000000001"
};
const rawCode = "NGN-2026-LOCAL-E2E";

function loadEnv() {
  const content = fs.readFileSync(path.join(root, ".env"), "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  const localUrl = new URL(String(process.env.LOCAL_SUPABASE_URL || ""));
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(localUrl.hostname), "LOCAL_SUPABASE_URL must be local");
  assert.ok(process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, "Missing local service-role key");
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_full_chain_test";
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/pickup.html`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Local server did not start");
}

function unwrap(payload) {
  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

async function main() {
  loadEnv();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const cycle = process.env.CURRENT_MEMBERSHIP_CYCLE || "2026-27";
  const codeHash = crypto.createHash("sha256")
    .update(`${String(process.env.MEMBERSHIP_CODE_HASH_SECRET || "").trim()}:${rawCode}`)
    .digest("hex");
  const report = { ok: false, environment: process.env.SUPABASE_URL, cycle, steps: {}, cleanup: {} };
  let requestId = null;
  let groupRef = null;
  let entitlementId = null;
  let claimId = null;
  let serverLog = "";
  let child;

  const removeFixtures = async () => {
    if (requestId) await supabase.from("transport_requests").delete().eq("id", requestId);
    if (groupRef) await supabase.from("transport_groups").delete().eq("id", groupRef);
    await supabase.from("membership_audit_logs").delete().eq("site_user_id", ids.user);
    await supabase.from("membership_activation_codes").delete().eq("id", ids.activation);
    await supabase.from("site_users").delete().eq("id", ids.user);
    await supabase.from("admin_users").delete().eq("id", ids.admin);
  };

  try {
    await removeFixtures();
    let result = await supabase.from("admin_users").insert({
      id: ids.admin, username: "local_e2e_advisor", name: "LOCAL E2E 顾问", role: "operations_admin", status: "active", password_hash: "LOCAL TEST"
    });
    if (result.error) throw result.error;
    result = await supabase.from("site_users").insert({
      id: ids.user,
      public_user_id: "LOCAL-E2E-USER",
      email: null,
      nickname: "LOCAL E2E 会员",
      phone: "+447700900999",
      wechat_id: "LOCAL_E2E_WECHAT",
      email_verified_at: new Date().toISOString()
    });
    if (result.error) throw result.error;
    result = await supabase.from("membership_activation_codes").insert({
      id: ids.activation,
      code_hash: codeHash,
      code_prefix: "LOCAL-E2E",
      membership_cycle: cycle,
      status: "active",
      generated_by_admin_id: ids.admin,
      notes: "LOCAL E2E full chain"
    });
    if (result.error) throw result.error;

    const { COOKIE_NAME, createUserSessionToken } = require("../api/_lib/user-auth");
    const { ADMIN_COOKIE_NAME, createAdminSessionToken } = require("../api/_lib/admin-security");
    const userCookie = `${COOKIE_NAME}=${createUserSessionToken(ids.user)}`;
    const adminCookie = `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(ids.admin)}`;
    child = spawn(process.execPath, ["scripts/dev-local.js"], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { serverLog += chunk; });
    child.stderr.on("data", chunk => { serverLog += chunk; });
    await waitForServer(child);

    const post = async (pathname, body, cookie) => {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body)
      });
      const payload = await response.json();
      assert.ok(response.ok, `${pathname}: ${response.status} ${JSON.stringify(payload)}`);
      return unwrap(payload);
    };
    const getAdmin = async pathname => {
      const response = await fetch(`${baseUrl}${pathname}`, { headers: { cookie: adminCookie } });
      return { response, text: await response.text() };
    };

    const redeemed = await post("/api/public/membership/redeem-code", { code: rawCode, member_birthday: "08-24" }, userCookie);
    entitlementId = redeemed.entitlement.id;
    assert.equal(redeemed.isMember, true);
    report.steps.activation = { status: redeemed.redeemStatus, entitlement_id: entitlementId };

    const selected = await post("/api/public/membership/benefit-selection", { benefit_type: "pickup" }, userCookie);
    claimId = selected.claim.id;
    assert.equal(selected.claim.entitlement_id, entitlementId);
    report.steps.benefit_selection = { claim_id: claimId, status: selected.claim.status, benefit_type: selected.claim.benefit_type };

    const submitted = await post("/api/public/transport-request-submit", {
      service_type: "pickup",
      student_name: "LOCAL E2E 会员",
      phone: "+447700900999",
      wechat: "LOCAL_E2E_WECHAT",
      passenger_count: 1,
      luggage_count: 1,
      airport_code: "LHR",
      airport_name: "Heathrow Airport",
      terminal: "T5",
      flight_no: "BA123",
      flight_datetime: "2026-09-25T10:00:00.000Z",
      location_from: "Heathrow Airport",
      location_to: "LOCAL E2E Nottingham",
      preferred_time_start: "2026-09-25T10:00:00.000Z",
      shareable: true
    }, userCookie);
    requestId = submitted.id;
    report.steps.transport_submit = submitted;

    const { data: request, error: requestError } = await supabase.from("transport_requests").select("id,order_no,site_user_id,membership_benefit_claim_id").eq("id", requestId).single();
    if (requestError) throw requestError;
    const { data: groupMember, error: groupMemberError } = await supabase.from("transport_group_members")
      .select("group_id")
      .eq("request_id", requestId)
      .maybeSingle();
    if (groupMemberError) throw groupMemberError;
    groupRef = groupMember?.group_id || null;
    const { data: claim, error: claimError } = await supabase.from("membership_benefit_claims").select("id,entitlement_id,site_user_id,status,linked_order_table,linked_order_id,linked_order_no").eq("id", claimId).single();
    if (claimError) throw claimError;
    assert.equal(request.membership_benefit_claim_id, claimId);
    assert.equal(claim.linked_order_table, "transport_requests");
    assert.equal(claim.linked_order_id, requestId);
    assert.equal(claim.linked_order_no, request.order_no);
    report.steps.bidirectional_binding = { request, claim };

    const { data: viewRows, error: viewError } = await supabase.from("admin_transport_requests_membership_view")
      .select("id,order_no,membership_relation,membership_claim_resolution,resolved_membership_claim_id,membership_entitlement_id,membership_advisor_resolution,effective_membership_advisor_id")
      .eq("id", requestId);
    if (viewError) throw viewError;
    assert.equal(viewRows.length, 1);
    const view = viewRows[0];
    assert.equal(view.membership_relation, "linked");
    assert.equal(view.membership_claim_resolution, "direct");
    assert.equal(view.resolved_membership_claim_id, claimId);
    assert.equal(view.membership_entitlement_id, entitlementId);
    assert.equal(view.membership_advisor_resolution, "assigned");
    assert.equal(view.effective_membership_advisor_id, ids.admin);
    report.steps.database_view = view;

    const query = new URLSearchParams({ search: request.order_no, membership_advisor_id: ids.admin, paginate: "true", page: "1", page_size: "1" });
    const listed = await getAdmin(`/api/transport-requests?${query}`);
    assert.equal(listed.response.status, 200);
    const listBody = unwrap(JSON.parse(listed.text));
    assert.deepEqual(listBody.pagination, { page: 1, page_size: 1, total: 1, total_pages: 1 });
    assert.deepEqual(listBody.items.map(item => item.id), [requestId]);
    const overflowQuery = new URLSearchParams(query);
    overflowQuery.set("page", "99");
    const overflow = await getAdmin(`/api/transport-requests?${overflowQuery}`);
    const overflowBody = unwrap(JSON.parse(overflow.text));
    assert.deepEqual(overflowBody.pagination, { page: 1, page_size: 1, total: 1, total_pages: 1 });
    assert.deepEqual(overflowBody.items.map(item => item.id), [requestId]);
    report.steps.admin_list = { ids: [requestId], pagination: listBody.pagination, overflow_pagination: overflowBody.pagination };

    const exported = await getAdmin(`/api/transport-requests/export?${query}`);
    assert.equal(exported.response.status, 200);
    assert.ok(exported.text.includes(request.order_no));
    const csvIds = exported.text.split(/\r?\n/).filter(line => line.includes(request.order_no)).length;
    assert.equal(csvIds, 1);
    report.steps.export = { order_no: request.order_no, matching_rows: csvIds, list_export_match: true };
    report.ok = true;
  } catch (error) {
    error.message += `\nLocal server output:\n${serverLog}`;
    throw error;
  } finally {
    if (child) child.kill();
    await removeFixtures();
    const checks = await Promise.all([
      supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("id", requestId || "00000000-0000-4000-8000-000000000000"),
      supabase.from("site_users").select("id", { count: "exact", head: true }).eq("id", ids.user),
      supabase.from("admin_users").select("id", { count: "exact", head: true }).eq("id", ids.admin),
      supabase.from("membership_activation_codes").select("id", { count: "exact", head: true }).eq("id", ids.activation),
      supabase.from("membership_audit_logs").select("id", { count: "exact", head: true }).eq("site_user_id", ids.user)
    ]);
    report.cleanup = { request: checks[0].count, user: checks[1].count, admin: checks[2].count, activation: checks[3].count, audit: checks[4].count };
    for (const check of checks) assert.equal(check.count, 0, "full-chain fixture cleanup failed");
  }
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
