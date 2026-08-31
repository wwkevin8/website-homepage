"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const port = 3319;
const baseUrl = `http://127.0.0.1:${port}`;
const fixturePrefix = "LOCAL-TEST-VIEW-";
const advisorA = "a1000000-0000-4000-8000-000000000001";

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
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_integration_test";
}

function psql(sql) {
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], {
    cwd: root,
    input: sql,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "psql failed");
  return result.stdout;
}

function fixtureSeedSql() {
  const source = fs.readFileSync(path.join(root, "scripts", "test-transport-membership-view.sql"), "utf8");
  const match = source.match(/-- FIXTURE-SEED-START\s*([\s\S]*?)\s*-- FIXTURE-SEED-END/);
  assert.ok(match, "Fixture seed markers not found");
  return `begin;\n${match[1]}\ncommit;`;
}

function cleanup() {
  psql(fs.readFileSync(path.join(root, "scripts", "clear-transport-membership-integration-fixture.sql"), "utf8"));
}

async function waitForServer(child) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/pickup.html`);
      if (response.ok) return;
    } catch (_) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Local server did not start");
}

function parseCsvOrderNumbers(csv) {
  const lines = csv.replace(/^\ufeff/, "").trim().split(/\r?\n/);
  assert.equal(lines[0], "提交时间,Order No,学生,电话,微信号,服务,机场,航站楼,航班,航班日期和时间,服务日期和时间,出发地,目的地,联系状态,收款状态,定金GBP,线下记录,客服备注,上次操作人,上次操作时间,Group ID");
  return lines.slice(1).map(line => line.split(",")[1]).filter(Boolean).sort();
}

async function main() {
  loadEnv();
  cleanup();
  psql(fixtureSeedSql());

  const { ADMIN_COOKIE_NAME, createAdminSessionToken } = require("../api/_lib/admin-security");
  const cookie = `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(advisorA)}`;
  const child = spawn(process.execPath, ["scripts/dev-local.js"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let serverLog = "";
  child.stdout.on("data", chunk => { serverLog += chunk; });
  child.stderr.on("data", chunk => { serverLog += chunk; });

  const get = async (pathname, authenticated = true) => fetch(`${baseUrl}${pathname}`, {
    headers: authenticated ? { cookie } : {}
  });
  const list = async params => {
    const query = new URLSearchParams({ search: fixturePrefix, sort: "submitted_latest", ...params });
    const response = await get(`/api/transport-requests?${query}`);
    const payload = await response.json();
    return { response, body: payload.data || payload };
  };
  const exportOrders = async params => {
    const query = new URLSearchParams({ search: fixturePrefix, sort: "submitted_latest", ...params });
    const response = await get(`/api/transport-requests/export?${query}`);
    assert.equal(response.status, 200);
    return parseCsvOrderNumbers(await response.text());
  };

  try {
    await waitForServer(child);
    assert.equal((await get("/api/transport-requests?paginate=true", false)).status, 401, "admin auth must be enforced");

    const cases = [
      ["linked", { membership_relation: "linked", paginate: "true", page_size: "100" }, 10],
      ["unlinked", { membership_relation: "unlinked", paginate: "true", page_size: "100" }, 2],
      ["advisor_a", { membership_advisor_id: advisorA, paginate: "true", page_size: "100" }, 4],
      ["unassigned", { membership_advisor_id: "unassigned", paginate: "true", page_size: "100" }, 1],
      ["needs_review", { membership_advisor_id: "needs_review", paginate: "true", page_size: "100" }, 2]
    ];
    const results = {};
    for (const [name, params, expectedTotal] of cases) {
      const { response, body } = await list(params);
      assert.equal(response.status, 200, `${name} status`);
      assert.equal(body.pagination.total, expectedTotal, `${name} total`);
      assert.equal(body.items.length, expectedTotal, `${name} items`);
      assert.equal(body.pagination.total_pages, expectedTotal ? 1 : 0, `${name} pages`);
      results[name] = body.items.map(item => ({ id: item.id, order_no: item.order_no })).sort((a, b) => a.order_no.localeCompare(b.order_no));
    }

    assert.equal((await list({ membership_relation: "wrong", paginate: "true" })).response.status, 400);
    assert.equal((await list({ membership_relation: "unlinked", membership_advisor_id: advisorA, paginate: "true" })).response.status, 400);

    const paged = await list({ membership_relation: "linked", paginate: "true", page: "1", page_size: "3" });
    assert.equal(paged.body.items.length, 3);
    assert.deepEqual(paged.body.pagination, { page: 1, page_size: 3, total: 10, total_pages: 4 });
    const overflow = await list({ membership_relation: "linked", paginate: "true", page: "99", page_size: "3" });
    assert.equal(overflow.response.status, 200, `overflow response: ${JSON.stringify(overflow.body)}`);
    assert.equal(overflow.body.items.length, 1);
    assert.deepEqual(overflow.body.pagination, { page: 4, page_size: 3, total: 10, total_pages: 4 });

    for (const [name, params] of cases.filter(([caseName]) => ["linked", "advisor_a", "unassigned", "needs_review"].includes(caseName))) {
      const listIds = results[name].map(item => item.id).sort();
      const exportOrderNumbers = await exportOrders(params);
      const exportIds = results[name].filter(item => exportOrderNumbers.includes(item.order_no)).map(item => item.id).sort();
      assert.deepEqual(exportIds, listIds, `${name} list/export IDs differ`);
      assert.equal(exportOrderNumbers.length, listIds.length, `${name} export contains unexpected orders`);
    }

    console.log(JSON.stringify({ ok: true, results, pagination: paged.body.pagination, overflow: overflow.body.pagination }, null, 2));
  } catch (error) {
    error.message += `\nLocal server output:\n${serverLog}`;
    throw error;
  } finally {
    child.kill();
    cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
