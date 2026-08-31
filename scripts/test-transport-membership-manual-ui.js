"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const port = 4319;
const baseUrl = `http://127.0.0.1:${port}`;
const adminId = "a4000000-0000-4000-8000-000000000001";
const advisorId = "a4000000-0000-4000-8000-000000000002";
const members = Array.from({ length: 9 }, (_, index) => `b4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const entitlements = Array.from({ length: 9 }, (_, index) => `c4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const claims = Array.from({ length: 9 }, (_, index) => `d4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const existingOrders = ["e4000000-0000-4000-8000-000000000001", "e4000000-0000-4000-8000-000000000002", "e4000000-0000-4000-8000-000000000003", "e4000000-0000-4000-8000-000000000004"];
const groups = ["GRP-QA-MANUAL-OPEN", "GRP-QA-MANUAL-FULL"];

function loadEnv() {
  for (const raw of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("="); if (at < 1) continue;
    const key = line.slice(0, at).trim(); const value = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
  const url = new URL(process.env.LOCAL_SUPABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname));
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_membership_manual_ui_test";
}

async function waitServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/admin/`)).ok) return; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("server timeout");
}

async function main() {
  loadEnv();
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { createAdminSessionToken, ADMIN_COOKIE_NAME } = require("../api/_lib/admin-security");
  let child, browser;
  const createdIds = [];

  async function cleanup() {
    const { data: qaRows } = await db.from("transport_requests").select("id").or(`created_by_admin_id.eq.${adminId},id.in.(${existingOrders.join(",")})`);
    const ids = [...new Set([...(qaRows || []).map(row => row.id), ...createdIds])];
    if (ids.length) {
      await db.from("transport_group_members").delete().in("request_id", ids);
      await db.from("admin_operation_logs").delete().in("target_id", ids);
      await db.from("transport_membership_manual_operations").delete().in("request_id", ids);
      await db.from("transport_requests").delete().in("id", ids);
    }
    await db.from("membership_audit_logs").delete().in("claim_id", claims);
    await db.from("transport_groups").delete().in("group_id", groups);
    await db.from("membership_benefit_claims").delete().in("id", claims);
    await db.from("membership_entitlements").delete().in("id", entitlements);
    await db.from("site_users").delete().in("id", members);
    await db.from("admin_users").delete().in("id", [adminId, advisorId]);
  }

  async function seed() {
    await cleanup();
    let result = await db.from("admin_users").insert([
      { id: adminId, username: "qa_manual_ui_ops", name: "QA 补录运营", role: "operations_admin", status: "active", password_hash: "test" },
      { id: advisorId, username: "qa_manual_ui_advisor", name: "QA 会员顾问", role: "super_admin", status: "active", password_hash: "test" }
    ]); if (result.error) throw result.error;
    result = await db.from("site_users").insert(members.map((id, index) => ({ id, public_user_id: `QA-MANUAL-UI-${index + 1}`, nickname: `QA 会员 ${index + 1}`, email: `qa-manual-ui-${index + 1}@example.invalid`, phone: `+44710050000${index + 1}`, wechat_id: `qa_manual_ui_${index + 1}` }))); if (result.error) throw result.error;
    result = await db.from("membership_entitlements").insert(entitlements.map((id, index) => ({ id, site_user_id: members[index], membership_cycle: `205${index}-5${index + 1}`, status: "active", valid_from: "2026-01-01", valid_until: "2060-12-31", advisor_admin_id: advisorId, created_by_admin_id: adminId, granted_by_admin_id: adminId }))); if (result.error) throw result.error;
    result = await db.from("membership_benefit_claims").insert(claims.slice(1).map((id, offset) => ({ id, entitlement_id: entitlements[offset + 1], benefit_type: "pickup", status: "selected", selected_at: new Date().toISOString() }))); if (result.error) throw result.error;
    const baseOrder = (id, no, member, flight, time) => ({ id, order_no: no, order_type: "pickup", business_date: "2058-09-10", site_user_id: member, service_type: "pickup", student_name: "QA existing", phone: "+447100599999", passenger_count: 1, luggage_count: 0, airport_code: "LHR", airport_name: "Heathrow", terminal: "T2", flight_no: flight, flight_datetime: time, location_from: "Heathrow", location_to: "Nottingham", preferred_time_start: "2058-09-10T11:00:00Z", shareable: false, status: "matched", source: "admin_manual" });
    result = await db.from("transport_requests").insert([
      baseOrder(existingOrders[0], "QA-MANUAL-POSSIBLE", members[4], "QAUI-DUP", "2058-09-10T10:00:00Z"),
      baseOrder(existingOrders[1], "QA-MANUAL-EXACT", members[5], "QAUI-EXACT", "2058-09-11T09:00:00Z"),
      baseOrder(existingOrders[2], "QA-MANUAL-GROUP-OPEN", null, "QAUI-GROUP", "2058-09-12T10:00:00Z"),
      baseOrder(existingOrders[3], "QA-MANUAL-GROUP-FULL", null, "QAUI-FULL", "2058-09-13T10:00:00Z")
    ]); if (result.error) throw result.error;
    result = await db.from("transport_groups").insert([
      { group_id: groups[0], service_type: "pickup", group_date: "2058-09-12", airport_code: "LHR", airport_name: "Heathrow", terminal: "T2", location_from: "Heathrow", location_to: "Nottingham", flight_time_reference: "2058-09-12T10:00:00Z", preferred_time_start: "2058-09-12T11:00:00Z", max_passengers: 4, visible_on_frontend: true, status: "single_member" },
      { group_id: groups[1], service_type: "pickup", group_date: "2058-09-13", airport_code: "LHR", airport_name: "Heathrow", terminal: "T2", location_from: "Heathrow", location_to: "Nottingham", flight_time_reference: "2058-09-13T10:00:00Z", preferred_time_start: "2058-09-13T11:00:00Z", max_passengers: 1, visible_on_frontend: true, status: "full" }
    ]); if (result.error) throw result.error;
    result = await db.from("transport_group_members").insert([
      { group_id: groups[0], request_id: existingOrders[2], passenger_count_snapshot: 1, luggage_count_snapshot: 0, is_initiator: true },
      { group_id: groups[1], request_id: existingOrders[3], passenger_count_snapshot: 1, luggage_count_snapshot: 0, is_initiator: true }
    ]); if (result.error) throw result.error;
  }

  async function openMembership(page) {
    await page.getByRole("button", { name: "补录接送机订单" }).click();
    await page.getByRole("button", { name: /会员权益补录/ }).click();
  }

  async function selectMember(page, index) {
    const search = page.getByPlaceholder("会员编号、手机号、邮箱、微信号或姓名");
    await search.fill(`QA-MANUAL-UI-${index + 1}`);
    await page.getByRole("button", { name: "搜索会员" }).click();
    await page.getByText(`QA 会员 ${index + 1}`, { exact: true }).waitFor();
    await page.getByRole("button", { name: "明确选择此会员" }).click();
    await page.locator('input[name="manual-membership-entitlement"]:not([disabled])').check();
  }

  async function fillOrder(page, index, options = {}) {
    await page.getByLabel("学生姓名 *").fill(options.name || `QA 会员 ${index + 1}`);
    await page.getByLabel("手机号").fill(options.phone ?? `+44710050000${index + 1}`);
    await page.getByLabel("微信号").fill(options.wechat ?? `qa_manual_ui_${index + 1}`);
    await page.getByLabel("邮箱").fill(options.email ?? `qa-manual-ui-${index + 1}@example.invalid`);
    await page.getByLabel("航站楼 *").fill("T2");
    await page.getByLabel("航班号 *").fill(options.flight);
    await page.getByLabel("航班日期时间 *").fill(options.flightTime);
    await page.getByLabel("服务时间 *").fill(options.serviceTime);
    await page.getByLabel("目的地地址 *").fill("Nottingham");
    if (options.group) {
      await page.getByLabel("拼车组处理 *").selectOption("join_existing");
      await page.getByLabel("目标拼车组编号 *").fill(options.group);
    }
  }

  async function submitAndCapture(page) {
    const responsePromise = page.waitForResponse(response => response.url().includes("/api/transport-manual-import/membership") && response.request().method() === "POST");
    await page.getByRole("button", { name: /提交会员权益补录|使用同一幂等键/ }).click();
    const response = await responsePromise;
    const json = await response.json();
    if (response.ok()) createdIds.push(json.data.request_id);
    return { status: response.status(), body: json.data || json.error };
  }

  try {
    await seed();
    child = spawn(process.execPath, ["scripts/dev-local.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
    await waitServer(child);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: ADMIN_COOKIE_NAME, value: createAdminSessionToken(adminId), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/transport/requests`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "登记接送机订单" }).waitFor();

    await openMembership(page); await selectMember(page, 0); await fillOrder(page, 0, { flight: "QAUI-NOCLAIM", flightTime: "2058-09-09T10:00", serviceTime: "2058-09-09T11:00" });
    let result = await submitAndCapture(page); assert.equal(result.status, 200, JSON.stringify(result));
    await openMembership(page); await selectMember(page, 1); await fillOrder(page, 1, { flight: "QAUI-SELECTED", flightTime: "2058-09-10T12:00", serviceTime: "2058-09-10T13:00" });
    result = await submitAndCapture(page); assert.equal(result.status, 200);
    await openMembership(page); await selectMember(page, 2); await fillOrder(page, 2, { flight: "QAUI-JOIN", flightTime: "2058-09-12T10:20", serviceTime: "2058-09-12T11:00", group: groups[0] });
    result = await submitAndCapture(page); assert.equal(result.status, 200); assert.equal(result.body.group_id, groups[0]);

    await openMembership(page); await selectMember(page, 3); await fillOrder(page, 3, { phone: "+447199999999", flight: "QAUI-MISMATCH", flightTime: "2058-09-14T10:00", serviceTime: "2058-09-14T11:00" });
    result = await submitAndCapture(page); assert.equal(result.status, 400); await page.getByText("不一致项目：手机号", { exact: true }).waitFor(); await page.getByLabel(/我已重新核对所选会员/).check(); result = await submitAndCapture(page); assert.equal(result.status, 200);

    await openMembership(page); await selectMember(page, 4); await fillOrder(page, 4, { flight: "QAUI-DUP", flightTime: "2058-09-10T10:30", serviceTime: "2058-09-10T11:30" });
    result = await submitAndCapture(page); assert.equal(result.status, 400); await page.getByLabel(/确认不是重复订单/).check(); result = await submitAndCapture(page); assert.equal(result.status, 200);

    await openMembership(page); await selectMember(page, 5); await fillOrder(page, 5, { flight: "QAUI-EXACT", flightTime: "2058-09-11T10:00", serviceTime: "2058-09-11T11:00" });
    result = await submitAndCapture(page); assert.equal(result.status, 400); assert.equal(result.body.details?.code, "exact_duplicate", JSON.stringify(result.body)); assert.equal(await page.getByRole("button", { name: "提交会员权益补录" }).isDisabled(), true); await page.getByRole("button", { name: "取消", exact: true }).click();

    await openMembership(page); await selectMember(page, 6); await fillOrder(page, 6, { flight: "QAUI-FULL-TRY", flightTime: "2058-09-13T10:10", serviceTime: "2058-09-13T11:00", group: groups[1] });
    result = await submitAndCapture(page); assert.equal(result.status, 400); await page.getByText(/拼车组已满|拼车组已关闭/).waitFor(); await page.getByRole("button", { name: "取消", exact: true }).click();

    let swallowed = false;
    await page.route("**/api/transport-manual-import/membership", async route => {
      if (swallowed) return route.continue();
      swallowed = true; await route.fetch(); await route.abort("failed");
    });
    await openMembership(page); await selectMember(page, 7); await fillOrder(page, 7, { flight: "QAUI-LOST", flightTime: "2058-09-15T10:00", serviceTime: "2058-09-15T11:00" });
    await page.getByRole("button", { name: "提交会员权益补录" }).click(); await page.getByText(/表单已锁定/).waitFor();
    await page.unroute("**/api/transport-manual-import/membership"); result = await submitAndCapture(page); assert.equal(result.status, 200); assert.equal(result.body.replayed, true); createdIds.push(result.body.request_id);

    await openMembership(page); await selectMember(page, 8); await fillOrder(page, 8, { flight: "QAUI-RAPID", flightTime: "2058-09-16T10:00", serviceTime: "2058-09-16T11:00" });
    const submitButton = page.getByRole("button", { name: "提交会员权益补录" });
    let rapidRequests = 0;
    const countRapid = request => { if (request.url().includes("/api/transport-manual-import/membership") && request.method() === "POST") rapidRequests += 1; };
    page.on("request", countRapid);
    const rapidResponsePromise = page.waitForResponse(response => response.url().includes("/api/transport-manual-import/membership") && response.request().method() === "POST");
    await submitButton.evaluate(button => { button.click(); button.click(); });
    const rapidResponse = await rapidResponsePromise;
    assert.equal(rapidResponse.status(), 200, JSON.stringify(await rapidResponse.json()));
    await page.getByRole("button", { name: "补录接送机订单" }).waitFor();
    page.off("request", countRapid);
    assert.equal(rapidRequests, 1);

    const { data: created } = await db.from("transport_requests").select("id,order_no,membership_benefit_claim_id,membership_advisor_admin_id,source,payment_collection_status").eq("created_by_admin_id", adminId).like("flight_no", "QAUI-%");
    assert.equal(created.filter(row => row.order_no).length, 7);
    assert.ok(created.every(row => row.membership_benefit_claim_id && row.membership_advisor_admin_id === advisorId && row.source === "admin_manual" && row.payment_collection_status === "unpaid"));
    const { data: logs } = await db.from("admin_operation_logs").select("*").in("target_id", created.map(row => row.id));
    assert.equal(logs.filter(log => log.action === "transport_membership_manual_create").length, 7);
    const detailPayload = await page.evaluate(async requestId => {
      const response = await fetch(`/api/transport-requests/${requestId}`, { credentials: "include" });
      return response.json();
    }, created[0].id);
    const manualLog = detailPayload.data.operation_logs.find(log => log.action_code === "transport_membership_manual_create");
    assert.match(manualLog.display_summary, /已代会员补录接机订单.*QA 会员.*所属顾问：QA 会员顾问/);
    assert.equal(JSON.stringify(manualLog).includes("d4000000"), false);

    const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 }); await mobile.goto(`${baseUrl}/admin/transport/requests`, { waitUntil: "networkidle" }); await mobile.getByRole("heading", { name: "登记接送机订单" }).waitFor(); await openMembership(mobile);
    const width = await mobile.locator(".confirm-dialog__panel").evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })); assert.equal(width.scrollWidth, width.clientWidth);
    console.log(JSON.stringify({ ok: true, created_orders: created.length, scenarios: 9, operation_logs: logs.length, mobile_width: width }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) child.kill();
    await cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
