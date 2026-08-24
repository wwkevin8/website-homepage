"use strict";

const { chromium } = require("playwright");

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

function json(route, status, data, error = null) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data, error })
  });
}

async function installCommonRoutes(page) {
  await page.route("**/api/auth/session", route => json(route, 200, {
    authenticated: true,
    user: {
      nickname: "测试用户",
      email: "submit-state@example.test",
      phone: "07000000000",
      wechat_id: "submit_state_test"
    }
  }));
  await page.route("**/api/public/membership-me", route => json(route, 200, { claim: null }));
}

async function fillPickupForm(page, serviceMode = "pickup") {
  await page.locator(`input[name="service_mode"][value="${serviceMode}"]`).check();
  await page.locator('select[name="airport_name"]').selectOption({ index: 1 });
  await page.locator('input[name="terminal"]').fill("T1");
  await page.locator('input[name="flight_no"]').fill("QA123");
  await page.locator('input[name="flight_datetime"]').fill("2027-08-24T12:30");
  await page.locator('input[name="luggage_option"]').first().check();
  await page.locator('input[name="nottingham_address"]').fill("NG1 1AA Test Street");
  await page.locator('input[name="fallback_accept"][value="accept"]').check();
  await page.locator('input[name="agreement"]').check();
}

async function verifyPickupSuccess(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const timings = [];
  let createCalls = 0;
  page.on("console", async message => {
    if (message.type() !== "info") return;
    const value = await message.args()[0]?.jsonValue().catch(() => null);
    if (value?.event === "transport_submit_timing") timings.push(value);
  });
  await installCommonRoutes(page);
  await page.route("**/api/public/my-transport-requests", async route => {
    await new Promise(resolve => setTimeout(resolve, 180));
    await json(route, 200, []);
  });
  await page.route("**/api/public/transport-request-submit", async route => {
    createCalls += 1;
    await new Promise(resolve => setTimeout(resolve, 180));
    await json(route, 201, { orderNo: "TR-QA-0001", groupId: "GRP-QA-0001" });
  });
  await page.goto(`${baseUrl}/pickup-form.html`, { waitUntil: "domcontentloaded" });
  await fillPickupForm(page, "dropoff");
  if (await page.locator("#carpoolSummaryCard").isVisible()) throw new Error("summary visible before submit");
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await page.getByText("正在核查是否已有相同登记", { exact: false }).waitFor();
  if (await page.locator("#carpoolSummaryCard").isVisible()) throw new Error("summary visible during duplicate check");
  await page.getByText("正在提交，请勿关闭页面", { exact: false }).waitFor();
  await page.getByText("提交成功。我们已收到你的信息", { exact: false }).waitFor();
  await page.getByRole("button", { name: "已提交", exact: true }).waitFor();
  if (!(await page.getByRole("button", { name: "已提交", exact: true }).isDisabled())) throw new Error("success button is enabled");
  if (!(await page.locator("#carpoolSummaryCard").isVisible())) throw new Error("success summary is hidden");
  if (createCalls !== 1) throw new Error(`expected one create request, received ${createCalls}`);
  await page.waitForTimeout(50);
  if (timings.length !== 2 || timings.some(item => Object.keys(item).some(key => !["event", "flow", "stage", "outcome", "durationMs"].includes(key)))) {
    throw new Error("timing logs are missing or contain unexpected fields");
  }
  await page.close();
}

async function verifyPickupFailure(browser) {
  const page = await browser.newPage();
  await installCommonRoutes(page);
  await page.route("**/api/public/my-transport-requests", route => json(route, 200, []));
  await page.route("**/api/public/transport-request-submit", route => json(route, 400, null, { message: "mock rejection" }));
  await page.goto(`${baseUrl}/pickup-form.html`, { waitUntil: "domcontentloaded" });
  await fillPickupForm(page);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await page.getByText("提交失败，本次信息尚未成功登记", { exact: false }).waitFor();
  if (await page.locator("#carpoolSummaryCard").isVisible()) throw new Error("summary visible after failure");
  if (await page.locator('input[name="flight_no"]').inputValue() !== "QA123") throw new Error("failure cleared form values");
  if (await page.getByRole("button", { name: "提交", exact: true }).isDisabled()) throw new Error("failure did not restore submit button");
  await page.close();
}

async function verifyPickupUncertain(browser) {
  const page = await browser.newPage();
  await installCommonRoutes(page);
  await page.route("**/api/public/my-transport-requests", route => json(route, 200, []));
  await page.route("**/api/public/transport-request-submit", route => json(route, 201, {}));
  await page.goto(`${baseUrl}/pickup-form.html`, { waitUntil: "domcontentloaded" });
  await fillPickupForm(page);
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await page.getByText("提交结果暂时无法确认", { exact: false }).waitFor();
  if (!(await page.getByRole("button", { name: "待核查", exact: true }).isDisabled())) throw new Error("uncertain submit button is enabled");
  await page.getByRole("button", { name: "复制核查信息", exact: true }).waitFor();
  await page.getByRole("button", { name: "联系客服", exact: true }).waitFor();
  if (await page.locator("#carpoolSummaryCard").isVisible()) throw new Error("summary visible for uncertain result");
  await page.close();
}

async function verifyJoinResult(browser, mode) {
  const page = await browser.newPage({ viewport: mode === "success" ? { width: 1280, height: 900 } : { width: 390, height: 844 } });
  await installCommonRoutes(page);
  const group = {
    id: "GRP-QA-JOIN",
    group_id: "GRP-QA-JOIN",
    join_target_request_id: "req-join-target",
    service_type: "pickup",
    airport_code: "LHR",
    airport_name: "Heathrow",
    terminal: "T2",
    flight_datetime: "2027-08-24T12:00:00Z",
    flight_time_reference: "2027-08-24T12:00:00Z",
    location_from: "Heathrow T2",
    location_to: "Nottingham",
    current_passenger_count: 1,
    passenger_count: 1,
    remaining_passenger_count: 2,
    max_passengers: 3,
    joinable: true,
    status: "open"
  };
  await page.route("**/api/public/transport-groups**", route => json(route, 200, { items: [group], total: 1, page: 1, page_size: 20, has_next: false }));
  await page.route("**/api/public/my-transport-requests", route => json(route, 200, []));
  await page.route("**/api/public/transport-join-submit", route => {
    if (mode === "success") return json(route, 201, { orderNo: "TR-QA-JOIN", groupId: "GRP-QA-JOIN" });
    if (mode === "failure") return json(route, 400, null, { message: "mock join rejection" });
    return json(route, 201, {});
  });
  await page.goto(`${baseUrl}/transport-board.html`, { waitUntil: "domcontentloaded" });
  const joinButton = page.locator('button[data-join-pickup="GRP-QA-JOIN"]');
  try {
    await joinButton.click({ timeout: 10000, force: true });
  } catch (error) {
    throw new Error(`join action did not render: ${(await page.locator("body").innerText()).slice(0, 800)}`);
  }
  await page.locator('input[name="terminal"]').fill("T2");
  await page.locator('input[name="flight_no"]').fill("QA456");
  await page.locator('input[name="flight_datetime"]').fill("2027-08-24T12:30");
  await page.locator('input[name="location_to"]').fill("NG1 1AA Test Street");
  await page.locator('input[name="confirm_truth"]').check();
  await page.getByRole("button", { name: "确认加入拼车", exact: true }).click();
  if (mode === "success") {
    await page.getByText("提交成功 · 请核对登记信息", { exact: true }).waitFor();
    if (!(await page.getByRole("button", { name: "已提交", exact: true }).isDisabled())) throw new Error("join success button is enabled");
  } else if (mode === "failure") {
    await page.getByText("提交失败，本次信息尚未成功登记", { exact: false }).waitFor();
    if (await page.getByRole("button", { name: "确认加入拼车", exact: true }).isDisabled()) throw new Error("join failure did not restore submit button");
    if (await page.locator('input[name="flight_no"]').inputValue() !== "QA456") throw new Error("join failure cleared form values");
  } else {
    await page.getByText("提交结果暂时无法确认", { exact: false }).waitFor();
    if (!(await page.getByRole("button", { name: "待核查", exact: true }).isDisabled())) throw new Error("join uncertain button is enabled");
    await page.getByRole("button", { name: "复制核查信息", exact: true }).waitFor();
    await page.getByRole("link", { name: "联系客服", exact: true }).waitFor();
  }
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await verifyPickupSuccess(browser);
    await verifyPickupFailure(browser);
    await verifyPickupUncertain(browser);
    await verifyJoinResult(browser, "success");
    await verifyJoinResult(browser, "failure");
    await verifyJoinResult(browser, "uncertain");
    console.log("PASS transport submit state browser verification");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
