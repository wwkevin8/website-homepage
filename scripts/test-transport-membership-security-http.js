"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const port = 3317;
const baseUrl = `http://127.0.0.1:${port}`;
const ids = {
  operations: "aa000000-0000-4000-8000-000000000001",
  superAdmin: "aa000000-0000-4000-8000-000000000002",
  disabled: "aa000000-0000-4000-8000-000000000003",
  forgedAdmin: "aa000000-0000-4000-8000-000000000004",
  member: "bb000000-0000-4000-8000-000000000001",
  originalUser: "bb000000-0000-4000-8000-000000000002",
  entitlement: "cc000000-0000-4000-8000-000000000001",
  usedEntitlement: "cc000000-0000-4000-8000-000000000002",
  noClaimEntitlement: "cc000000-0000-4000-8000-000000000003",
  claim: "dd000000-0000-4000-8000-000000000001",
  usedClaim: "dd000000-0000-4000-8000-000000000002",
  request: "ee000000-0000-4000-8000-000000000001",
  usedRequest: "ee000000-0000-4000-8000-000000000002",
  noUserRequest: "ee000000-0000-4000-8000-000000000003"
};
const passwords = { operations: "LocalOps!2026", superAdmin: "LocalSuper!2026", disabled: "LocalDisabled!2026" };

function loadEnv() {
  const content = fs.readFileSync(path.join(root, ".env"), "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
  const localUrl = new URL(String(process.env.LOCAL_SUPABASE_URL || ""));
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(localUrl.hostname), "LOCAL_SUPABASE_URL must be local");
  assert.ok(process.env.LOCAL_SUPABASE_ANON_KEY, "Missing local anon key");
  assert.ok(process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, "Missing local service-role key");
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_security_http_test";
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie") || "";
  return value.split(";")[0];
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

async function main() {
  loadEnv();
  const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { hashPassword, createAdminSessionToken, ADMIN_COOKIE_NAME } = require("../api/_lib/admin-security");
  const { COOKIE_NAME, createUserSessionToken } = require("../api/_lib/user-auth");
  const report = { ok: false, http: {}, direct_rpc: {}, database: {} };
  let authUserId = null;
  let child = null;
  let serverLog = "";
  let browser = null;

  async function removeFixtures() {
    await service.from("admin_operation_logs").delete().in("target_id", [ids.request, ids.usedRequest, ids.noUserRequest]);
    await service.from("membership_audit_logs").delete().in("claim_id", [ids.claim, ids.usedClaim]);
    await service.from("transport_membership_admin_operations").delete().in("request_id", [ids.request, ids.usedRequest]);
    await service.from("transport_requests").delete().in("id", [ids.request, ids.usedRequest, ids.noUserRequest]);
    await service.from("membership_benefit_claims").delete().in("id", [ids.claim, ids.usedClaim]);
    await service.from("membership_entitlements").delete().in("id", [ids.entitlement, ids.usedEntitlement, ids.noClaimEntitlement]);
    await service.from("site_users").delete().in("id", [ids.member, ids.originalUser]);
    await service.from("admin_users").delete().in("id", [ids.operations, ids.superAdmin, ids.disabled, ids.forgedAdmin]);
  }

  async function seed() {
    await removeFixtures();
    let result = await service.from("admin_users").insert([
      { id: ids.operations, username: "qa_security_ops", name: "QA Security Ops", role: "operations_admin", status: "active", password_hash: hashPassword(passwords.operations) },
      { id: ids.superAdmin, username: "qa_security_super", name: "QA Security Super", role: "super_admin", status: "active", password_hash: hashPassword(passwords.superAdmin) },
      { id: ids.disabled, username: "qa_security_disabled", name: "QA Security Disabled", role: "operations_admin", status: "disabled", password_hash: hashPassword(passwords.disabled) },
      { id: ids.forgedAdmin, username: "qa_security_forged", name: "QA Security Forged", role: "super_admin", status: "active", password_hash: "not-login-capable" }
    ]);
    if (result.error) throw result.error;
    result = await service.from("site_users").insert([
      { id: ids.member, public_user_id: "QA-SECURITY-MEMBER", nickname: "QA member", phone: "+447000100001", email: "qa-security-member@example.invalid", wechat_id: "qa_security_wechat" },
      { id: ids.originalUser, public_user_id: "QA-SECURITY-ORIGINAL", nickname: "QA original", phone: "+447000100002", email: "qa-security-original@example.invalid" }
    ]);
    if (result.error) throw result.error;
    result = await service.from("membership_entitlements").insert([
      { id: ids.entitlement, site_user_id: ids.member, membership_cycle: "2031-32", status: "active", advisor_admin_id: ids.superAdmin, created_by_admin_id: ids.operations, granted_by_admin_id: ids.operations, valid_from: "2026-01-01", valid_until: "2032-12-31" },
      { id: ids.usedEntitlement, site_user_id: ids.member, membership_cycle: "2032-33", status: "active", advisor_admin_id: ids.superAdmin, created_by_admin_id: ids.operations, granted_by_admin_id: ids.operations, valid_from: "2026-01-01", valid_until: "2033-12-31" }
      ,{ id: ids.noClaimEntitlement, site_user_id: ids.member, membership_cycle: "2033-34", status: "active", advisor_admin_id: ids.superAdmin, created_by_admin_id: ids.operations, granted_by_admin_id: ids.operations, valid_from: "2026-01-01", valid_until: "2034-12-31" }
    ]);
    if (result.error) throw result.error;
    result = await service.from("membership_benefit_claims").insert([
      { id: ids.claim, entitlement_id: ids.entitlement, benefit_type: "pickup", status: "selected", selected_at: new Date().toISOString() },
      { id: ids.usedClaim, entitlement_id: ids.usedEntitlement, benefit_type: "pickup", status: "used", selected_at: new Date().toISOString(), reserved_at: new Date().toISOString(), used_at: new Date().toISOString(), linked_order_table: "transport_requests", linked_order_id: ids.usedRequest, linked_order_no: "QA-SEC-USED" }
    ]);
    if (result.error) throw result.error;
    result = await service.from("transport_requests").insert([
      { id: ids.request, order_no: "QA-SEC-LINK", order_type: "pickup", business_date: "2026-09-01", service_type: "pickup", student_name: "QA link", phone: "+447000100010", passenger_count: 1, luggage_count: 1, airport_code: "LHR", airport_name: "Heathrow", terminal: "T2", flight_no: "QA101", flight_datetime: "2026-09-01T10:00:00Z", location_from: "LHR", location_to: "London", shareable: false, status: "published", source: "admin_manual", site_user_id: ids.originalUser },
      { id: ids.usedRequest, order_no: "QA-SEC-USED", order_type: "pickup", business_date: "2026-09-02", service_type: "pickup", student_name: "QA used", phone: "+447000100011", passenger_count: 1, luggage_count: 1, airport_code: "LHR", airport_name: "Heathrow", terminal: "T3", flight_no: "QA102", flight_datetime: "2026-09-02T10:00:00Z", location_from: "LHR", location_to: "London", shareable: false, status: "published", source: "admin_manual", site_user_id: ids.member, membership_benefit_claim_id: ids.usedClaim, membership_advisor_admin_id: ids.superAdmin, membership_linked_at: new Date().toISOString(), membership_linked_by_admin_id: ids.operations, membership_site_user_id_before_link: ids.originalUser },
      { id: ids.noUserRequest, order_no: "QA-SEC-NO-USER", order_type: "pickup", business_date: "2026-09-03", service_type: "pickup", student_name: "QA no user", passenger_count: 1, luggage_count: 0, airport_code: "LHR", airport_name: "Heathrow", terminal: "T4", flight_no: "QA103", flight_datetime: "2026-09-03T10:00:00Z", location_from: "LHR", location_to: "London", shareable: false, status: "published", source: "admin_manual", site_user_id: null }
    ]);
    if (result.error) throw result.error;
    result = await service.from("admin_operation_logs").insert([
      { admin_user_id: ids.operations, action: "transport_request_membership_linked", target_type: "transport_request", target_id: ids.request, before_data: { membership_benefit_claim_id: null }, after_data: { membership_benefit_claim_id: ids.claim }, metadata: { reason: "detail relationship regression" } },
      { admin_user_id: ids.operations, action: "transport_request_updated", target_type: "transport_request", target_id: ids.request, before_data: { admin_note: null }, after_data: { admin_note: "QA detail log" }, metadata: {} },
      { admin_user_id: ids.operations, action: "transport_membership_link", target_type: "transport_request", target_id: ids.request, before_data: { claim: null }, after_data: { target_claim_id: ids.claim }, metadata: { new_claim_id: ids.claim, entitlement_id: ids.entitlement, advisor_snapshot_id: ids.superAdmin, reason: "历史关联记录兼容测试" } }
    ]);
    if (result.error) throw result.error;
  }

  async function login(username, password) {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password })
    });
    return { response, body: await response.json(), cookie: cookieFrom(response) };
  }

  async function postMembership(requestId, body, cookie = "") {
    const response = await fetch(`${baseUrl}/api/transport-requests/${requestId}/membership`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    return { response, body: payload.data || payload };
  }

  const baseLink = {
    action: "link", idempotency_key: "ff000000-0000-4000-8000-000000000001",
    entitlement_id: ids.entitlement, claim_id: ids.claim, expected_current_claim_id: null,
    reason: "HTTP security link", admin_user_id: ids.forgedAdmin, advisor_admin_id: ids.forgedAdmin
  };

  try {
    await seed();
    child = spawn(process.execPath, ["scripts/dev-local.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => { serverLog += chunk; });
    child.stderr.on("data", chunk => { serverLog += chunk; });
    await waitForServer(child);

    let result = await postMembership(ids.request, baseLink);
    assert.equal(result.response.status, 401);
    report.http.unauthenticated = result.response.status;
    let searchResponse = await fetch(`${baseUrl}/api/transport-membership-members?request_id=${ids.request}&search=QA-SECURITY-MEMBER&page=1&page_size=100`);
    assert.equal(searchResponse.status, 401);

    result = await postMembership(ids.request, baseLink, `${COOKIE_NAME}=${createUserSessionToken(ids.member)}`);
    assert.equal(result.response.status, 401);
    report.http.frontend_user = result.response.status;
    searchResponse = await fetch(`${baseUrl}/api/transport-membership-members?request_id=${ids.request}&search=QA-SECURITY-MEMBER`, { headers: { cookie: `${COOKIE_NAME}=${createUserSessionToken(ids.member)}` } });
    assert.equal(searchResponse.status, 401);

    const disabledLogin = await login("qa_security_disabled", passwords.disabled);
    assert.equal(disabledLogin.response.status, 401);
    result = await postMembership(ids.request, baseLink, `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(ids.disabled)}`);
    assert.equal(result.response.status, 401);
    searchResponse = await fetch(`${baseUrl}/api/transport-membership-members?request_id=${ids.request}&search=QA-SECURITY-MEMBER`, { headers: { cookie: `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(ids.disabled)}` } });
    assert.equal(searchResponse.status, 401);
    report.http.disabled_admin = { login: disabledLogin.response.status, stale_session: result.response.status };

    const opsLogin = await login("qa_security_ops", passwords.operations);
    const superLogin = await login("qa_security_super", passwords.superAdmin);
    assert.equal(opsLogin.response.status, 200);
    assert.equal(superLogin.response.status, 200);
    assert.ok(opsLogin.cookie && superLogin.cookie);
    report.http.real_admin_login = { operations_admin: 200, super_admin: 200 };

    const ambiguousBeforeFix = await service.from("transport_requests")
      .select("id,site_users(email)")
      .eq("id", ids.usedRequest)
      .maybeSingle();
    assert.ok(ambiguousBeforeFix.error, "ambiguous relationship query unexpectedly succeeded");
    assert.match(String(ambiguousBeforeFix.error.message || ""), /more than one relationship/i);
    report.database.pre_fix_ambiguous_query = ambiguousBeforeFix.error.code || "error";

    async function fetchDetail(id) {
      const response = await fetch(`${baseUrl}/api/transport-requests/${encodeURIComponent(id)}`, { headers: { cookie: opsLogin.cookie } });
      const raw = await response.json();
      return { response, body: raw.data || raw };
    }

    let detailResult = await fetchDetail(ids.request);
    assert.equal(detailResult.response.status, 200, JSON.stringify(detailResult.body));
    assert.equal(detailResult.body.site_users.email, "qa-security-original@example.invalid");
    assert.equal(detailResult.body.operation_logs.length, 3);
    const membershipDisplayLog = detailResult.body.operation_logs.find(item => item.action_code === "transport_membership_link");
    assert.match(membershipDisplayLog.display_summary, /已关联会员权益.*QA member（QA-SECURITY-MEMBER）.*2031-32.*QA Security Super/);
    assert.ok(membershipDisplayLog.display_details.some(item => item.label === "原因" && item.value === "历史关联记录兼容测试"));
    assert.equal(Object.prototype.hasOwnProperty.call(membershipDisplayLog, "before_data"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(membershipDisplayLog, "after_data"), false);
    assert.equal(JSON.stringify(membershipDisplayLog).includes(ids.claim), false);

    detailResult = await fetchDetail("QA-SEC-USED");
    assert.equal(detailResult.response.status, 200, JSON.stringify(detailResult.body));
    assert.equal(detailResult.body.site_user_id, ids.member);
    assert.equal(detailResult.body.membership_site_user_id_before_link, ids.originalUser);
    assert.equal(detailResult.body.site_users.email, "qa-security-member@example.invalid");

    detailResult = await fetchDetail(ids.noUserRequest);
    assert.equal(detailResult.response.status, 200, JSON.stringify(detailResult.body));
    assert.equal(detailResult.body.site_users, null);
    assert.deepEqual(detailResult.body.operation_logs, []);
    const timeAdjustResponse = await fetch(`${baseUrl}/api/transport-requests/${ids.usedRequest}?action=time_adjust_candidate_groups&flight_datetime=2026-09-02T10%3A00%3A00.000Z&preferred_time_start=2026-09-02T10%3A00%3A00.000Z`, { headers: { cookie: opsLogin.cookie } });
    assert.equal(timeAdjustResponse.status, 200, await timeAdjustResponse.text());
    report.http.request_detail_relationship = {
      current_user_only: 200,
      current_and_snapshot_users: 200,
      no_current_user: 200,
      time_adjust_context: 200,
      operation_log_count: 3
    };

    searchResponse = await fetch(`${baseUrl}/api/transport-membership-members?request_id=${ids.request}&search=QA-SECURITY-MEMBER&page=1&page_size=100`, { headers: { cookie: opsLogin.cookie } });
    assert.equal(searchResponse.status, 200);
    const searchBodyRaw = await searchResponse.json();
    const searchBody = searchBodyRaw.data || searchBodyRaw;
    assert.equal(searchBody.pagination.page_size, 10);
    assert.equal(searchBody.items.length, 1);
    assert.equal(searchBody.items[0].public_user_id, "QA-SECURITY-MEMBER");
    assert.notEqual(searchBody.items[0].phone_masked, "+447000100001");
    assert.notEqual(searchBody.items[0].email_masked, "qa-security-member@example.invalid");
    assert.equal(Object.prototype.hasOwnProperty.call(searchBody.items[0], "email"), false);
    assert.ok(searchBody.items[0].entitlements.some(item => item.code === "pickup_selected" && item.available));
    assert.ok(searchBody.items[0].entitlements.some(item => item.code === "pickup_used" && !item.available));
    assert.ok(searchBody.items[0].entitlements.some(item => item.code === "pickup_will_be_selected" && item.creates_claim));
    report.http.member_search = { status: 200, page_size_limit: searchBody.pagination.page_size, result_count: searchBody.items.length };

    const contextResponse = await fetch(`${baseUrl}/api/transport-requests/${ids.usedRequest}/membership`, { headers: { cookie: opsLogin.cookie } });
    assert.equal(contextResponse.status, 200);
    const contextRaw = await contextResponse.json();
    const contextBody = contextRaw.data || contextRaw;
    assert.equal(contextBody.current.claim.status, "used");
    assert.equal(contextBody.current.member.public_user_id, "QA-SECURITY-MEMBER");
    report.http.membership_context = 200;

    browser = await chromium.launch({ headless: true });
    const [cookieName, cookieValue] = opsLogin.cookie.split("=");
    const browserContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await browserContext.addCookies([{ name: cookieName, value: cookieValue, domain: "127.0.0.1", path: "/" }]);
    const page = await browserContext.newPage();
    await page.goto(`${baseUrl}/admin/transport/requests`, { waitUntil: "networkidle" });
    const keyword = page.getByPlaceholder("订单号 / 姓名 / 电话 / 微信 / 航班号");
    await keyword.fill("QA-SEC-LINK");
    await Promise.all([
      page.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.request().method() === "GET"),
      page.getByRole("button", { name: "查询", exact: true }).click()
    ]);
    let injectedDetailFailure = false;
    await page.route(`**/api/transport-requests/${ids.request}`, async route => {
      if (!injectedDetailFailure) {
        injectedDetailFailure = true;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ data: null, error: { message: "internal relationship details" } }) });
        return;
      }
      await route.continue();
    });
    const operationLogButton = page.locator(".transport-operation-log-action:visible").first();
    await operationLogButton.click();
    await page.getByText("操作记录加载失败，请重试。").waitFor();
    assert.equal(await page.getByText("暂无操作记录").count(), 0, "failed operation-log request rendered empty state");
    assert.equal(await page.getByText("internal relationship details").count(), 0, "internal API error leaked to business UI");
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await page.locator(".transport-log-card").first().waitFor();
    assert.equal(await page.locator(".transport-log-card").count(), 3);
    const operationLogText = await page.locator(".transport-log-drawer__panel").innerText();
    assert.match(operationLogText, /已关联会员权益.*QA member（QA-SECURITY-MEMBER）.*2031-32.*QA Security Super/);
    assert.match(operationLogText, /原因：历史关联记录兼容测试/);
    assert.equal(operationLogText.includes("[object Object]"), false);
    assert.equal(operationLogText.includes(ids.claim), false);
    await page.locator(".transport-log-drawer__panel .membership-modal__header .table-action-button").click();
    await page.unroute(`**/api/transport-requests/${ids.request}`);
    report.http.operation_log_ui = { failure_state: "friendly", empty_state_hidden_on_failure: true, retry: 200, records: 3, membership_business_copy: true };
    const membershipEntry = page.getByRole("button", { name: "未关联", exact: true });
    if (await membershipEntry.count() !== 1) {
      throw new Error(`Expected one unlinked membership entry. URL=${page.url()} BODY=${(await page.locator("body").innerText()).slice(0, 3000)}`);
    }
    await membershipEntry.click();
    await page.getByPlaceholder("User ID、手机号、微信号、邮箱或姓名").fill("QA-SECURITY-MEMBER");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await page.getByRole("button", { name: "明确选择此会员", exact: true }).click();
    await page.locator(".membership-entitlement-option").filter({ hasText: "2033-34" }).locator("input[type=radio]").check();
    await page.getByText("该会员尚未选择本周期权益。确认关联后，将把本周期权益选择为“接机”。").waitFor();
    const panel = page.locator(".transport-membership-dialog__panel");
    await panel.screenshot({ path: path.join(root, "output", "transport-membership-admin-ui-desktop.png") });
    const desktopMetrics = await panel.evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    assert.ok(desktopMetrics.scrollWidth <= desktopMetrics.clientWidth + 1, "desktop modal has horizontal overflow");
    await browserContext.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 780 } });
    await mobileContext.addCookies([{ name: cookieName, value: cookieValue, domain: "127.0.0.1", path: "/" }]);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${baseUrl}/admin/transport/requests`, { waitUntil: "networkidle" });
    await mobilePage.getByPlaceholder("订单号 / 姓名 / 电话 / 微信 / 航班号").fill("QA-SEC-LINK");
    await Promise.all([
      mobilePage.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.request().method() === "GET"),
      mobilePage.getByRole("button", { name: "查询", exact: true }).click()
    ]);
    await mobilePage.locator(".transport-operation-log-mobile-action:visible").first().click();
    const mobileLogPanel = mobilePage.locator(".transport-log-drawer__panel");
    await mobileLogPanel.waitFor();
    const mobileLogMetrics = await mobileLogPanel.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    assert.ok(mobileLogMetrics.scrollWidth <= mobileLogMetrics.clientWidth + 1, "mobile operation log has horizontal overflow");
    assert.equal((await mobileLogPanel.innerText()).includes("[object Object]"), false);
    await mobileLogPanel.locator(".membership-modal__header .table-action-button").click();
    await mobilePage.getByRole("button", { name: "未关联", exact: true }).click();
    const mobilePanel = mobilePage.locator(".transport-membership-dialog__panel");
    await mobilePanel.waitFor();
    const mobileModalMetrics = await mobilePanel.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, width: element.getBoundingClientRect().width }));
    assert.ok(mobileModalMetrics.scrollWidth <= mobileModalMetrics.clientWidth + 1, "mobile modal has horizontal overflow");
    assert.ok(await mobilePage.getByRole("button", { name: "重新加载当前关联", exact: true }).isVisible(), "mobile modal footer is not visible");
    await mobilePanel.screenshot({ path: path.join(root, "output", "transport-membership-admin-ui-mobile.png") });
    const bodyMetrics = await mobilePage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.ok(bodyMetrics.scrollWidth <= bodyMetrics.clientWidth + 1, "mobile page has horizontal overflow");
    report.http.page_interaction = { desktop_modal: desktopMetrics, mobile_modal: mobileModalMetrics, mobile_operation_log: mobileLogMetrics, mobile_page: bodyMetrics, screenshots: ["output/transport-membership-admin-ui-desktop.png", "output/transport-membership-admin-ui-mobile.png"] };
    await mobileContext.close();
    await browser.close();
    browser = null;

    result = await postMembership(ids.request, { ...baseLink, idempotency_key: "not-a-uuid" }, opsLogin.cookie);
    assert.equal(result.response.status, 400, JSON.stringify(result.body));
    report.http.invalid_idempotency_key = result.response.status;
    result = await postMembership(ids.request, { ...baseLink, reason: "" }, opsLogin.cookie);
    assert.equal(result.response.status, 400);
    report.http.empty_reason = result.response.status;
    result = await postMembership(ids.request, { ...baseLink, expected_current_claim_id: ids.usedClaim }, opsLogin.cookie);
    assert.equal(result.response.status, 400, JSON.stringify(result.body));
    report.http.expected_claim_mismatch = result.response.status;

    result = await postMembership(ids.request, baseLink, opsLogin.cookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const firstResult = result.body;
    assert.equal(firstResult.idempotent_replay, false);
    report.http.operations_link = result.response.status;
    const { data: linked, error: linkedError } = await service.from("transport_requests")
      .select("membership_linked_by_admin_id,membership_advisor_admin_id,membership_benefit_claim_id")
      .eq("id", ids.request).single();
    if (linkedError) throw linkedError;
    assert.equal(linked.membership_linked_by_admin_id, ids.operations, "forged body admin ID took effect");
    assert.equal(linked.membership_advisor_admin_id, ids.superAdmin, "forged body advisor ID took effect");
    assert.equal(linked.membership_benefit_claim_id, ids.claim);
    report.database.identity_source = linked;

    result = await postMembership(ids.request, baseLink, opsLogin.cookie);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.idempotent_replay, true);
    assert.equal(result.body.request_id, firstResult.request_id);
    report.http.idempotent_retry = result.response.status;
    result = await postMembership(ids.request, { ...baseLink, reason: "different payload" }, opsLogin.cookie);
    assert.equal(result.response.status, 400);
    report.http.idempotency_payload_conflict = result.response.status;

    const usedBody = { action: "unlink", idempotency_key: "ff000000-0000-4000-8000-000000000010", expected_current_claim_id: ids.usedClaim, reason: "HTTP used unlink", confirm_used: true };
    result = await postMembership(ids.usedRequest, usedBody, opsLogin.cookie);
    assert.equal(result.response.status, 403);
    report.http.operations_used_unlink = result.response.status;
    result = await postMembership(ids.usedRequest, { ...usedBody, idempotency_key: "ff000000-0000-4000-8000-000000000011" }, superLogin.cookie);
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    report.http.super_used_unlink = result.response.status;

    const rpcUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/admin_manage_transport_membership_link`;
    const rpcPayload = { p_admin_user_id: ids.forgedAdmin, p_idempotency_key: "ff000000-0000-4000-8000-000000000020", p_action: "unlink", p_request_id: ids.request, p_expected_current_claim_id: ids.claim, p_reason: "direct role bypass attempt" };
    let direct = await fetch(rpcUrl, { method: "POST", headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`, "content-type": "application/json" }, body: JSON.stringify(rpcPayload) });
    assert.ok([401, 403, 404].includes(direct.status), `anon RPC unexpectedly returned ${direct.status}: ${await direct.text()}`);
    report.direct_rpc.anon = direct.status;

    const email = `qa-security-${Date.now()}@example.invalid`;
    const created = await service.auth.admin.createUser({ email, password: "LocalAuth!2026", email_confirm: true });
    if (created.error) throw created.error;
    authUserId = created.data.user.id;
    const signedIn = await anon.auth.signInWithPassword({ email, password: "LocalAuth!2026" });
    if (signedIn.error) throw signedIn.error;
    direct = await fetch(rpcUrl, { method: "POST", headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: `Bearer ${signedIn.data.session.access_token}`, "content-type": "application/json" }, body: JSON.stringify(rpcPayload) });
    assert.ok([401, 403, 404].includes(direct.status), `authenticated RPC unexpectedly returned ${direct.status}: ${await direct.text()}`);
    report.direct_rpc.authenticated = direct.status;
    direct = await fetch(rpcUrl, { method: "POST", headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ ...rpcPayload, p_admin_user_id: null }) });
    const serviceText = await direct.text();
    assert.equal(direct.status, 403, `service-role RPC did not reach administrator validation: ${direct.status} ${serviceText}`);
    assert.match(serviceText, /active administrator is required/);
    report.direct_rpc.service_role = { status: direct.status, reached_admin_validation: true };
    report.ok = true;
  } catch (error) {
    error.message += `\nLocal server output:\n${serverLog}`;
    throw error;
  } finally {
    if (child) child.kill();
    if (browser) await browser.close().catch(() => {});
    if (authUserId) await service.auth.admin.deleteUser(authUserId);
    await removeFixtures();
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
