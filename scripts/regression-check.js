"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const failures = [];
const warnings = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail) {
  failures.push({ label, detail });
  console.error(`FAIL ${label}${detail ? ` - ${detail}` : ""}`);
}

function warn(label, detail) {
  warnings.push({ label, detail });
  console.warn(`WARN ${label}${detail ? ` - ${detail}` : ""}`);
}

function expectIncludes(file, needle, label) {
  const content = read(file);
  if (content.includes(needle)) pass(label);
  else fail(label, `${file} is missing ${JSON.stringify(needle)}`);
}

function expectRegex(file, regex, label) {
  const content = read(file);
  if (regex.test(content)) pass(label);
  else fail(label, `${file} does not match ${regex}`);
}

function expectNotRegex(file, regex, label) {
  const content = read(file);
  if (!regex.test(content)) pass(label);
  else fail(label, `${file} still matches ${regex}`);
}

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function checkLegacyEntrypoints() {
  const guard = "admin-legacy-guard.js";
  [
    ['"transport-admin-requests.html": "/admin/transport/requests"', "legacy transport request entry redirects to Vue admin"],
    ['"transport-admin-groups.html": "/admin/transport/groups"', "legacy transport group entry redirects to Vue admin"],
    ['"transport-admin-group-edit.html"', "legacy transport group edit entry is handled"],
    ['"admin-storage.html"', "legacy storage list entry is handled"],
    ['"admin-storage-detail.html"', "legacy storage detail entry is handled"]
  ].forEach(([needle, label]) => expectIncludes(guard, needle, label));

  const scriptFiles = [
    "scripts/playwright-transport-flow.js",
    "scripts/qa300-runner.js"
  ];
  const disallowedMainEntries = [
    "transport-admin-requests.html",
    "transport-admin-groups.html",
    "transport-admin-group-edit.html",
    "admin-storage.html",
    "admin-storage-detail.html"
  ];
  for (const file of scriptFiles) {
    const content = read(file);
    const hits = disallowedMainEntries.filter(entry => content.includes(entry));
    if (hits.length) {
      fail("test scripts use Vue admin paths as primary entries", `${file} still references ${hits.join(", ")}`);
    } else {
      pass(`${file} does not use legacy admin pages as primary entries`);
    }
  }
}

function checkTransportRequests() {
  const view = "apps/admin-vue/src/views/TransportRequestsView.vue";
  const filters = "apps/admin-vue/src/components/TransportRequestFilters.vue";
  const detail = "apps/admin-vue/src/views/TransportRequestDetailView.vue";
  const api = "api/transport-requests/index.js";

  expectRegex(view, /status:\s*"active"/, "transport requests default to active orders");
  expectRegex(view, /sort:\s*"flight_nearest"/, "transport requests default to nearest flight/service time");
  expectIncludes(filters, '<select v-model="model.status">', "transport request status filter exists");
  expectIncludes(view, 'label: "行程地址"', "transport request itinerary address column exists");
  expectIncludes(view, 'label: "是否已记录"', "transport request offline-recorded column exists");
  expectIncludes(view, "toggleOfflineRecorded", "transport request offline-recorded toggle exists");
  expectIncludes(api, 'if (sort === "flight_nearest")', "transport request API supports nearest sort");
  expectNotRegex(detail, /DetailSection\s+title="操作区"|title="操作区"/, "transport request detail has no operation section");
}

function checkTransportGroups() {
  const view = "apps/admin-vue/src/views/TransportGroupsView.vue";
  const api = "api/transport-groups/index.js";
  const joinPreview = "public-api-handlers/transport-join-preview.js";
  const joinSubmit = "public-api-handlers/transport-join-submit.js";
  const lifecycle = "api/_lib/transport-group-lifecycle.js";

  expectRegex(view, /validity:\s*"active"/, "transport groups default to active groups");
  expectRegex(view, /sort:\s*"service_time_asc"/, "transport groups default to nearest service time");
  expectIncludes(view, "paginate: true", "transport groups use paginated admin loading");
  expectIncludes(api, "paginate", "transport groups API supports pagination");
  expectIncludes(joinPreview, "evaluateJoin", "join-carpool preview uses join evaluator");
  expectIncludes(joinSubmit, "evaluateJoin", "join-carpool submit uses join evaluator");
  expectIncludes(lifecycle, "cleanupEmptyTransportGroups", "empty-group cleanup helper exists");
}

function checkStorageWorkbench() {
  const list = "apps/admin-vue/src/views/StorageAllOrdersView.vue";
  const detail = "apps/admin-vue/src/views/StorageOrderDetailView.vue";
  const boxDetail = "apps/admin-vue/src/views/BoxOrderDetailView.vue";
  const api = "api/admin/[...action].js";

  expectRegex(list, /sort:\s*"service_date_nearest"/, "storage workbench defaults to nearest service date");
  expectIncludes(list, "toggleOfflineRecorded", "storage recorded/unrecorded button mode exists");
  expectIncludes(list, "togglePaymentReceived", "storage paid/unpaid button mode exists");
  expectIncludes(list, "未线下记录", "storage unrecorded filter/stat label exists");
  expectIncludes(list, "未收款", "storage unpaid filter/stat label exists");
  expectRegex(list, /今日\s*\/\s*未来 7 天/, "storage today / next 7 days stat exists");
  expectIncludes(list, '<option value="box_order">', "storage buy-box filter exists");
  expectIncludes(list, '<option value="storage_collection">', "storage collection filter exists");
  expectIncludes(list, '<option value="storage_return">', "storage return filter exists");
  expectIncludes(detail, "内部备注", "storage detail internal note label is Chinese");
  expectIncludes(detail, "操作记录", "storage detail operation log label is Chinese");
  expectIncludes(detail, "relatedBoxOrderRoute", "storage detail related box-order link logic exists");
  expectIncludes(detail, "itemQuantitySummary", "storage detail box/item quantity summary exists");
  expectIncludes(boxDetail, "配送信息", "buy-box detail delivery information exists");
  expectIncludes(boxDetail, "费用汇总", "buy-box detail fee summary exists");
  expectNotRegex(detail, /DetailSection\s+title="操作区"|title="操作区"/, "storage detail has no operation section");
  expectNotRegex(boxDetail, /DetailSection\s+title="操作区"|title="操作区"/, "buy-box detail has no operation section");
  expectIncludes(api, "applyStorageWorkbenchFilters", "storage workbench server-side filter guard exists");
}

function checkLocalOnlyScripts() {
  const ignored = gitOutput(["check-ignore", "scripts/seed-storage-test-data.js", "scripts/clear-storage-test-data.js"]);
  const expected = [
    "scripts/seed-storage-test-data.js",
    "scripts/clear-storage-test-data.js"
  ];
  for (const item of expected) {
    if (ignored.split(/\r?\n/).includes(item)) pass(`${item} is gitignored`);
    else fail("local test-data script is not gitignored", item);
  }

  const tracked = gitOutput(["ls-files", ...expected]);
  if (tracked) fail("local test-data scripts are tracked", tracked);
  else pass("local test-data scripts are not tracked by git");

  for (const file of expected) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) {
      warn(`${file} not present in workspace`, "gitignore still protects it if recreated");
      continue;
    }
    const content = read(file);
    if (content.includes("LOCAL_SUPABASE_URL") || content.includes("getLocalSupabaseAdmin")) {
      pass(`${file} has a local-only Supabase guard path`);
    } else {
      warn(`${file} local-only guard not detected`, "file is gitignored and untracked; inspect manually before running it");
    }
  }
}

function main() {
  console.log("Regression stability check");
  checkLegacyEntrypoints();
  checkTransportRequests();
  checkTransportGroups();
  checkStorageWorkbench();
  checkLocalOnlyScripts();

  if (warnings.length) {
    console.log(`Warnings: ${warnings.length}`);
  }
  if (failures.length) {
    console.error(`Regression check failed: ${failures.length} issue(s).`);
    process.exit(1);
  }
  console.log("Regression check passed.");
}

main();
