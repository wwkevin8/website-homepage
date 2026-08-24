"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const port = 3198;
const baseUrl = `http://127.0.0.1:${port}`;
const prefix = "LOCAL-TEST-VIEW-";
const advisorA = "a1000000-0000-4000-8000-000000000001";

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index < 1) continue;
      const key = line.slice(0, index).trim();
      let value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
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
  process.env.RUNTIME_MODE = "local_integration_test";
}

function psql(sql) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], {
    cwd: root, input: sql, encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "psql failed");
  return result.stdout;
}

function cleanup() {
  psql(fs.readFileSync(path.join(root, "scripts", "clear-transport-membership-integration-fixture.sql"), "utf8"));
}

function seed() {
  const source = fs.readFileSync(path.join(root, "scripts", "test-transport-membership-view.sql"), "utf8");
  const match = source.match(/-- FIXTURE-SEED-START\s*([\s\S]*?)\s*-- FIXTURE-SEED-END/);
  assert.ok(match, "fixture markers missing");
  psql(`begin;\n${match[1]}\ncommit;`);
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited ${child.exitCode}`);
    try {
      if ((await fetch(`${baseUrl}/admin/`)).ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("local server did not start");
}

function csvOrderNumbers(csv) {
  return csv.replace(/^\ufeff/, "").trim().split(/\r?\n/).slice(1).map(line => line.split(",")[1]).filter(Boolean).sort();
}

async function main() {
  loadEnv();
  cleanup();
  seed();
  const { ADMIN_COOKIE_NAME, createAdminSessionToken } = require("../api/_lib/admin-security");
  const token = createAdminSessionToken(advisorA);
  const cookie = `${ADMIN_COOKIE_NAME}=${token}`;
  const child = spawn(process.execPath, ["scripts/dev-local.js"], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", chunk => { log += chunk; });
  child.stderr.on("data", chunk => { log += chunk; });
  const get = pathname => fetch(`${baseUrl}${pathname}`, { headers: { cookie } });
  const query = params => new URLSearchParams({ search: prefix, sort: "submitted_latest", paginate: "true", page_size: "100", ...params });
  const list = async params => {
    const response = await get(`/api/transport-requests?${query(params)}`);
    const payload = await response.json();
    return { status: response.status, body: payload.data || payload };
  };
  try {
    await waitForServer(child);
    assert.equal((await fetch(`${baseUrl}/api/transport-requests?paginate=true`)).status, 401);
    const expected = { linked: 10, unlinked: 2, advisor: 4, review: 2 };
    const results = {
      linked: await list({ membership_relation: "linked" }),
      unlinked: await list({ membership_relation: "unlinked" }),
      advisor: await list({ membership_advisor_id: advisorA }),
      review: await list({ membership_advisor_id: "needs_review" })
    };
    for (const [key, total] of Object.entries(expected)) {
      assert.equal(results[key].status, 200, key);
      assert.equal(results[key].body.pagination.total, total, key);
      assert.equal(results[key].body.items.length, total, key);
    }
    assert.equal((await list({ membership_relation: "wrong" })).status, 400);
    assert.equal((await list({ membership_relation: "unlinked", membership_advisor_id: advisorA })).status, 400);
    const page = await list({ membership_relation: "linked", page: "1", page_size: "3" });
    const overflow = await list({ membership_relation: "linked", page: "99", page_size: "3" });
    assert.deepEqual(page.body.pagination, { page: 1, page_size: 3, total: 10, total_pages: 4 });
    assert.deepEqual(overflow.body.pagination, { page: 4, page_size: 3, total: 10, total_pages: 4 });
    for (const key of ["linked", "advisor", "review"]) {
      const params = key === "linked" ? { membership_relation: "linked" } : key === "advisor" ? { membership_advisor_id: advisorA } : { membership_advisor_id: "needs_review" };
      const response = await get(`/api/transport-requests/export?${query(params)}`);
      assert.equal(response.status, 200);
      const exported = csvOrderNumbers(await response.text());
      const listed = results[key].body.items.map(item => item.order_no).sort();
      assert.deepEqual(exported, listed, `${key} list/export mismatch`);
    }
    const browser = await chromium.launch({ headless: true });
    let options;
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: ADMIN_COOKIE_NAME, value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      const pageUi = await context.newPage();
      await pageUi.goto(`${baseUrl}/admin/transport/requests`, { waitUntil: "networkidle" });
      const selector = pageUi.locator('label:has-text("会员接机归属") select');
      await pageUi.getByRole("button", { name: "更多筛选" }).click();
      await selector.waitFor();
      options = (await selector.locator("option").allTextContents()).map(item => item.trim());
      assert.deepEqual(options.slice(0, 3), ["全部接机订单", "全部会员接机订单", "需核查"]);
      assert.ok(options.includes("LOCAL TEST 顾问A的会员接机订单"), JSON.stringify(options));
      assert.ok(options.includes("LOCAL TEST 已停用顾问（已停用）的会员接机订单"), JSON.stringify(options));
      assert.equal(await pageUi.evaluate(() => document.documentElement.scrollWidth), 390);
      await pageUi.setViewportSize({ width: 1440, height: 900 });
      await pageUi.reload({ waitUntil: "networkidle" });
      assert.equal(await pageUi.locator('label:has-text("会员接机归属") select').isVisible(), true);
      assert.equal(await pageUi.evaluate(() => document.documentElement.scrollWidth), 1440);
    } finally {
      await browser.close();
    }
    const assigned = results.linked.body.items.filter(item => item.membership_advisor_resolution === "assigned");
    const review = results.linked.body.items.filter(item => ["unassigned", "ambiguous"].includes(item.membership_advisor_resolution));
    assert.equal(new Set(assigned.map(item => item.id)).size + new Set(review.map(item => item.id)).size, expected.linked);
    console.log(JSON.stringify({ ok: true, totals: expected, pagination: page.body.pagination, overflow: overflow.body.pagination, options, responsive: { mobile: { viewport: 390, scrollWidth: 390 }, desktop: { viewport: 1440, scrollWidth: 1440 } }, partition_complete: true, list_export_match: true }, null, 2));
  } catch (error) {
    error.message += `\nserver output:\n${log}`;
    throw error;
  } finally {
    child.kill();
    cleanup();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
