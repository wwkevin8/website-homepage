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
  expectIncludes(view, "offline-recorded-toggle", "transport request offline-recorded rows use one status toggle button");
  expectNotRegex(view, /切为未记录|标记已记录/, "transport request offline-recorded rows do not show extra action text");
  expectIncludes(api, 'if (sort === "flight_nearest")', "transport request API supports nearest sort");
  expectNotRegex(detail, /DetailSection\s+title="操作区"|title="操作区"/, "transport request detail has no operation section");
}

function checkTransportGroups() {
  const view = "apps/admin-vue/src/views/TransportGroupsView.vue";
  const filters = "apps/admin-vue/src/components/TransportGroupFilters.vue";
  const adminVueApi = "apps/admin-vue/src/api/admin-api.js";
  const api = "api/transport-groups/index.js";
  const adminApi = "api/admin/[...action].js";
  const publicGroups = "public-api-handlers/transport-groups.js";
  const publicBoard = "public-api-handlers/transport-board.js";
  const joinPreview = "public-api-handlers/transport-join-preview.js";
  const joinSubmit = "public-api-handlers/transport-join-submit.js";
  const joinHelper = "api/_lib/transport-join.js";
  const lifecycle = "api/_lib/transport-group-lifecycle.js";

  expectRegex(view, /validity:\s*"active"/, "transport groups default to active groups");
  expectRegex(view, /sort:\s*"service_time_asc"/, "transport groups default to nearest upcoming service time");
  expectIncludes(filters, 'v-model="model.validity"', "transport group validity filter exists");
  expectIncludes(filters, 'value="active">有效单 / 有效组', "transport group active validity option exists");
  expectIncludes(filters, 'value="invalid">无效或过期单', "transport group invalid validity option exists");
  expectIncludes(filters, 'v-model="model.sort"', "transport group service-time sort filter exists");
  expectIncludes(filters, 'value: "service_time_asc", label: "服务时间：最近到最远"', "transport group ASC sort label/value mapping is correct");
  expectIncludes(filters, 'value: "service_time_desc", label: "服务时间：最远到最近"', "transport group DESC sort label/value mapping is correct");
  expectIncludes(view, "paginate: true", "transport groups use paginated admin loading");
  expectIncludes(view, "normalizeServiceTimeSort(filters.sort)", "transport groups normalize client-side service-time sort");
  expectIncludes(adminVueApi, 'return request(`/api/admin/transport-groups${query ? `?${query}` : ""}`);', "Vue admin transport group list uses the admin aggregate API");
  expectNotRegex(adminVueApi, /fetchTransportGroups[\s\S]*?request\(`\/api\/transport-groups\$\{query/, "Vue admin transport group list does not use the broken direct list route");
  expectIncludes(api, "paginate", "transport groups API supports pagination");
  expectIncludes(api, '"farthest"', "transport groups API supports farthest service-time sort alias");
  expectIncludes(api, '"desc"', "transport groups API maps DESC service-time sort aliases to descending order");
  expectIncludes(api, "cleanupEmptyTransportGroups", "transport groups API runs empty-group cleanup before listing");
  expectIncludes(adminApi, 'head === "transport-groups" || head === "transport-dispatch"', "admin transport aggregate routes list requests through cleanup-enabled handler");
  expectIncludes(publicGroups, "cleanupEmptyTransportGroups", "public transport groups list runs empty-group cleanup before listing");
  expectIncludes(publicBoard, "cleanupEmptyTransportGroups", "public transport board list runs empty-group cleanup before listing");
  expectIncludes(publicBoard, "sortBoardItemsByServiceTime", "public transport board sorts final rendered rows by service time");
  expectIncludes(publicBoard, "filterFutureBoardItems", "public transport board filters active rows by final service time");
  expectIncludes(joinPreview, "evaluateJoin", "join-carpool preview uses join evaluator");
  expectIncludes(joinSubmit, "evaluateJoin", "join-carpool submit uses join evaluator");
  expectIncludes(joinHelper, "evaluateJoinWindowAwareRelaxed", "join-carpool evaluator uses relaxed time-difference behavior");
  expectIncludes(joinHelper, "large_time_gap", "join-carpool evaluator returns large-time-gap warnings");
  expectIncludes(joinHelper, "cross_midnight_date_mismatch", "join-carpool evaluator warns for allowed cross-midnight joins");
  expectIncludes(joinSubmit, "transport_frontend_join_time_risk_confirmed", "frontend large-time-gap joins are logged after success");
  expectIncludes(lifecycle, "cleanupEmptyTransportGroups", "empty-group cleanup helper exists");
  expectIncludes(lifecycle, "DEFAULT_EMPTY_GROUP_GRACE_MINUTES = 10", "empty-group cleanup keeps the 10-minute grace window");
  expectIncludes(lifecycle, "active_member_count", "empty-group cleanup uses effective active members, not stale closed members");
  expectIncludes(lifecycle, "buildTimeDistanceWarning", "backend transfer uses warnings for large time gaps");
  expectNotRegex(lifecycle, /distance\s*>\s*MAX_TIME_ADJUST_CANDIDATE_HOURS\)\s*\{\s*throw buildTransportLifecycleError\("target group time is outside the allowed window"/, "backend transfer no longer hard-blocks large time gaps");
}

function formatDateTimeLocalTextForRegression(value) {
  if (!value) {
    return "--";
  }
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    return String(value);
  }
  const [, year, month, day, hour, minute] = match;
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

function checkPublicSubmissionSummaryDateTimes() {
  const pickupForm = "pickup-form.js";
  const transportPublic = "transport-public.js";

  expectIncludes(pickupForm, "function formatDateTimeLocalText(value)", "pickup summary has local datetime text formatter");
  expectIncludes(pickupForm, "`航班时间: ${formatDateTimeLocalText(data.flight_datetime)}`", "pickup summary flight time uses raw datetime-local text");
  expectIncludes(pickupForm, "`期望时间: ${formatDateTimeLocalText(data.preferred_time)}`", "pickup summary preferred time uses raw datetime-local text");
  expectNotRegex(pickupForm, /航班时间:\s*\$\{formatDateTime\(data\.flight_datetime\)\}/, "pickup summary flight time avoids timezone formatter");
  expectNotRegex(pickupForm, /期望时间:\s*\$\{formatDateTime\(data\.preferred_time\)\}/, "pickup summary preferred time avoids timezone formatter");

  expectIncludes(transportPublic, "function formatDateTimeLocalText(value)", "join summary has local datetime text formatter");
  expectIncludes(transportPublic, "flightDatetimeText: formatDateTimeLocalText(payload.flight_datetime)", "join summary flight time uses raw datetime-local text");
  expectIncludes(transportPublic, "preferredTimeText: formatDateTimeLocalText(payload.preferred_time_start || referenceDateTime)", "join summary preferred time uses raw datetime-local text");
  expectNotRegex(transportPublic, /Shared\.formatDateTime\(payload\.flight_datetime\)/, "join summary flight time avoids shared timezone formatter");
  expectNotRegex(transportPublic, /Shared\.formatDateTime\(payload\.preferred_time_start\s*\|\|\s*referenceDateTime\)/, "join summary preferred time avoids shared timezone formatter");

  const sampleFlight = formatDateTimeLocalTextForRegression("2026-09-18T19:30");
  const samplePreferred = formatDateTimeLocalTextForRegression("2026-09-18T21:00");
  if (sampleFlight === "2026/09/18 19:30" && samplePreferred === "2026/09/18 21:00") {
    pass("datetime-local summary samples keep the customer-entered wall time");
  } else {
    fail("datetime-local summary samples keep the customer-entered wall time", `${sampleFlight}, ${samplePreferred}`);
  }
}

function checkStorageWorkbench() {
  const list = "apps/admin-vue/src/views/StorageAllOrdersView.vue";
  const detail = "apps/admin-vue/src/views/StorageOrderDetailView.vue";
  const boxDetail = "apps/admin-vue/src/views/BoxOrderDetailView.vue";
  const api = "api/admin/[...action].js";

  expectRegex(list, /sort:\s*"service_date_nearest"/, "storage workbench defaults to nearest service date");
  expectIncludes(list, "toggleOfflineRecorded", "storage recorded/unrecorded button mode exists");
  expectIncludes(list, "offline-recorded-toggle", "storage offline-recorded column uses a reversible status button");
  expectIncludes(list, "togglePaymentReceived", "storage paid/unpaid button mode exists");
  expectIncludes(list, "quick_date: filters.quickDate", "storage quick-date filter is sent to API query");
  expectIncludes(list, "date_start: range.start", "storage quick-date range start is sent to API query");
  expectIncludes(list, "offline_recorded: filters.offlineRecorded", "storage offline-recorded quick filter is sent to API query");
  expectIncludes(list, "payment_status: filters.paymentStatus", "storage payment quick filter is sent to API query");
  expectIncludes(list, "service_type: filters.serviceType", "storage service-type quick filter is sent to API query");
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
  checkPublicSubmissionSummaryDateTimes();
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
