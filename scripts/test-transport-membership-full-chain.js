"use strict";

const assert = require("assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const port = 3196;
const baseUrl = `http://127.0.0.1:${port}`;
const fixture = {
  admin: "52000000-0000-4000-8000-000000000001",
  user: "62000000-0000-4000-8000-000000000001",
  activation: "a2000000-0000-4000-8000-000000000001",
  code: "NGN-2026-LOCAL-E2E"
};

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
  const localUrl = new URL(String(process.env.LOCAL_SUPABASE_URL || ""));
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(localUrl.hostname), "Refusing non-local Supabase target");
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
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/pickup.html`)).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("local server did not start");
}

function unwrap(payload) {
  return payload?.data ?? payload;
}

async function main() {
  loadEnv();
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const cycle = process.env.CURRENT_MEMBERSHIP_CYCLE || "2026-27";
  let requestId = null;
  let groupId = null;
  let child;
  let serverLog = "";
  const cleanup = async () => {
    if (requestId) await supabase.from("transport_requests").delete().eq("id", requestId);
    if (groupId) await supabase.from("transport_groups").delete().eq("group_id", groupId);
    await supabase.from("membership_audit_logs").delete().eq("site_user_id", fixture.user);
    await supabase.from("membership_activation_codes").delete().eq("id", fixture.activation);
    await supabase.from("site_users").delete().eq("id", fixture.user);
    await supabase.from("admin_users").delete().eq("id", fixture.admin);
  };
  try {
    await cleanup();
    let result = await supabase.from("admin_users").insert({ id: fixture.admin, username: "local_e2e_advisor", name: "LOCAL E2E 顾问", role: "operations_admin", status: "active", password_hash: "LOCAL TEST" });
    if (result.error) throw result.error;
    result = await supabase.from("site_users").insert({ id: fixture.user, public_user_id: "LOCAL-E2E-USER", email: null, nickname: "LOCAL E2E 会员", phone: "+447700900999", wechat_id: "LOCAL_E2E_WECHAT", email_verified_at: new Date().toISOString() });
    if (result.error) throw result.error;
    const codeHash = crypto.createHash("sha256").update(`${String(process.env.MEMBERSHIP_CODE_HASH_SECRET || "").trim()}:${fixture.code}`).digest("hex");
    result = await supabase.from("membership_activation_codes").insert({ id: fixture.activation, code_hash: codeHash, code_prefix: "LOCAL-E2E", membership_cycle: cycle, status: "active", generated_by_admin_id: fixture.admin, notes: "LOCAL E2E" });
    if (result.error) throw result.error;

    const { COOKIE_NAME, createUserSessionToken } = require("../api/_lib/user-auth");
    const { ADMIN_COOKIE_NAME, createAdminSessionToken } = require("../api/_lib/admin-security");
    const userCookie = `${COOKIE_NAME}=${createUserSessionToken(fixture.user)}`;
    const adminCookie = `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(fixture.admin)}`;
    child = spawn(process.execPath, ["scripts/dev-local.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => { serverLog += chunk; });
    child.stderr.on("data", chunk => { serverLog += chunk; });
    await waitForServer(child);
    const post = async (url, body) => {
      const response = await fetch(`${baseUrl}${url}`, { method: "POST", headers: { cookie: userCookie, "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      assert.ok(response.ok, `${url}: ${response.status} ${JSON.stringify(payload)}`);
      return unwrap(payload);
    };
    const redeemed = await post("/api/public/membership/redeem-code", { code: fixture.code, member_birthday: "08-24" });
    const selected = await post("/api/public/membership/benefit-selection", { benefit_type: "pickup" });
    const submitted = await post("/api/public/transport-request-submit", {
      service_type: "pickup", student_name: "LOCAL E2E 会员", phone: "+447700900999", wechat: "LOCAL_E2E_WECHAT",
      passenger_count: 1, luggage_count: 1, airport_code: "LHR", airport_name: "Heathrow Airport", terminal: "T5",
      flight_no: "BA123", flight_datetime: "2026-09-25T10:00:00.000Z", location_from: "Heathrow Airport",
      location_to: "LOCAL E2E Nottingham", preferred_time_start: "2026-09-25T10:00:00.000Z", shareable: true
    });
    requestId = submitted.id;
    groupId = submitted.groupId;
    const { data: request } = await supabase.from("transport_requests").select("id,order_no,membership_benefit_claim_id").eq("id", requestId).single();
    const { data: claim } = await supabase.from("membership_benefit_claims").select("id,entitlement_id,status,linked_order_table,linked_order_id,linked_order_no").eq("id", selected.claim.id).single();
    assert.equal(request.membership_benefit_claim_id, claim.id);
    assert.equal(claim.linked_order_id, request.id);
    assert.equal(claim.linked_order_table, "transport_requests");
    const { data: rows } = await supabase.from("admin_transport_requests_membership_view").select("*").eq("id", requestId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].membership_relation, "linked");
    assert.equal(rows[0].membership_claim_resolution, "direct");
    assert.equal(rows[0].membership_advisor_resolution, "assigned");
    assert.equal(rows[0].effective_membership_advisor_id, fixture.admin);
    const params = new URLSearchParams({ search: request.order_no, membership_advisor_id: fixture.admin, paginate: "true", page: "99", page_size: "1" });
    const listResponse = await fetch(`${baseUrl}/api/transport-requests?${params}`, { headers: { cookie: adminCookie } });
    const list = unwrap(await listResponse.json());
    assert.equal(list.pagination.total, 1);
    assert.equal(list.pagination.page, 1);
    assert.deepEqual(list.items.map(item => item.id), [requestId]);
    const exportResponse = await fetch(`${baseUrl}/api/transport-requests/export?${params}`, { headers: { cookie: adminCookie } });
    const csv = await exportResponse.text();
    assert.equal(csv.split(/\r?\n/).filter(line => line.includes(request.order_no)).length, 1);
    console.log(JSON.stringify({ ok: true, entitlement_id: redeemed.entitlement.id, claim_id: claim.id, order_no: request.order_no, view: { relation: rows[0].membership_relation, claim: rows[0].membership_claim_resolution, advisor: rows[0].membership_advisor_resolution, advisor_id: rows[0].effective_membership_advisor_id }, pagination: list.pagination, list_export_match: true }, null, 2));
  } catch (error) {
    error.message += `\nserver output:\n${serverLog}`;
    throw error;
  } finally {
    if (child) child.kill();
    await cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
