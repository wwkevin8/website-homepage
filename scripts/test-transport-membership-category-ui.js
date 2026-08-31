"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const port = 4197;
const baseUrl = `http://127.0.0.1:${port}`;
const advisorA = "51000000-0000-4000-8000-000000000001";
const advisorB = "51000000-0000-4000-8000-000000000002";

function loadLocalEnv() {
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
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(localUrl.hostname), "Refusing non-local Supabase target");
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_ui_integration_test";
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server exited with ${child.exitCode}`);
    try {
      if ((await fetch(`${baseUrl}/admin/transport/requests`)).ok) return;
    } catch (_) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Local server did not start");
}

function assertMembershipParams(urlText, expected) {
  const url = new URL(urlText);
  assert.equal(url.searchParams.get("membership_relation") || "", expected.relation || "");
  assert.equal(url.searchParams.get("membership_advisor_id") || "", expected.advisor || "");
}

async function main() {
  loadLocalEnv();
  const { ADMIN_COOKIE_NAME, createAdminSessionToken } = require("../api/_lib/admin-security");
  const child = spawn(process.execPath, ["scripts/dev-local.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForServer(child);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await page.context().addCookies([{
      name: ADMIN_COOKIE_NAME,
      value: createAdminSessionToken(advisorA),
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax"
    }]);
    await page.goto(`${baseUrl}/admin/transport/requests`, { waitUntil: "networkidle" });

    const category = page.getByLabel("会员接机归属");
    await category.waitFor();
    const optionTexts = (await category.locator("option").allTextContents()).map(text => text.trim());
    assert.deepEqual(optionTexts.slice(0, 3), [
      "全部接机订单",
      "全部会员接机订单",
      "需核查"
    ]);
    assert.equal(optionTexts.includes("未关联会员权益订单"), false);
    assert.equal(optionTexts.includes("未分配顾问"), false);
    assert.ok(optionTexts.includes("LOCAL TEST 顾问A的会员接机订单"), JSON.stringify(optionTexts));
    assert.ok(optionTexts.includes("LOCAL TEST 顾问B的会员接机订单"), JSON.stringify(optionTexts));
    assert.equal(await page.getByText("会员权益关联", { exact: true }).count(), 0);
    assert.equal(await page.getByText("所属顾问", { exact: true }).count(), 0);

    await page.getByLabel("关键词").fill("LOCAL-TEST-MANUAL");
    await Promise.all([
      page.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.url().includes("search=LOCAL-TEST-MANUAL")),
      page.getByRole("button", { name: "查询", exact: true }).click()
    ]);

    const cases = [
      ["linked", { relation: "linked", advisor: "", total: 4 }],
      ["needs_review", { relation: "linked", advisor: "needs_review", total: 2 }],
      [`advisor:${advisorA}`, { relation: "linked", advisor: advisorA, total: 1 }]
    ];
    const results = {};
    for (const [value, expected] of cases) {
      const responsePromise = page.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.request().method() === "GET");
      await category.selectOption(value);
      const response = await responsePromise;
      assertMembershipParams(response.url(), expected);
      const payload = await response.json();
      assert.equal(payload.data.pagination.total, expected.total);
      results[value] = payload.data.items.map(item => item.order_no);
    }

    const advisorBResponsePromise = page.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.url().includes(advisorB));
    await category.selectOption(`advisor:${advisorB}`);
    const advisorBResponse = await advisorBResponsePromise;
    const advisorBPayload = await advisorBResponse.json();
    assert.equal(advisorBPayload.data.pagination.total, 1);
    results[`advisor:${advisorB}`] = advisorBPayload.data.items.map(item => item.order_no);

    const pageSizeResponsePromise = page.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.url().includes(advisorB) && response.url().includes("page_size=20"));
    await page.getByLabel("每页").selectOption("20");
    await pageSizeResponsePromise;

    const partitionedOrders = new Set([
      ...results[`advisor:${advisorA}`],
      ...results[`advisor:${advisorB}`],
      ...results.needs_review
    ]);
    assert.deepEqual([...partitionedOrders].sort(), [...results.linked].sort());
    assert.equal(partitionedOrders.has("LOCAL-TEST-MANUAL-UNLINKED"), false);
    const exportResponsePromise = page.waitForResponse(response => response.url().includes("/api/transport-requests/export?"));
    await page.getByRole("button", { name: "导出当前筛选结果" }).click();
    const exportResponse = await exportResponsePromise;
    assertMembershipParams(exportResponse.url(), { relation: "linked", advisor: advisorB });
    assert.equal(exportResponse.status(), 200);

    const resetResponsePromise = page.waitForResponse(response => response.url().includes("/api/transport-requests?") && response.request().method() === "GET");
    await page.getByRole("button", { name: "重置", exact: true }).click();
    const resetResponse = await resetResponsePromise;
    assert.equal(await category.inputValue(), "");
    assertMembershipParams(resetResponse.url(), { relation: "", advisor: "" });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByLabel("会员接机归属").isVisible(), false);
    await page.getByRole("button", { name: "更多筛选" }).click();
    assert.equal(await page.getByLabel("会员接机归属").isVisible(), true);
    assert.equal(await page.getByText("会员接机归属", { exact: true }).count(), 1);
    const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.width, `mobile overflow: ${JSON.stringify(dimensions)}`);

    console.log(JSON.stringify({ ok: true, options: optionTexts, results, mobile: dimensions }, null, 2));
  } finally {
    await browser.close();
    child.kill();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
