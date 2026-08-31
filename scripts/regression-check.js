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

function checkMembershipAdvisorFilter() {
  const view = "apps/admin-vue/src/views/MembershipsView.vue";
  const adminVueApi = "apps/admin-vue/src/api/admin-api.js";
  const adminApi = "api/admin/[...action].js";

  expectIncludes(view, "fetchMembershipAdvisors", "membership page loads dynamic advisor choices");
  expectIncludes(view, 'advisor_admin_id: filters.advisorAdminId', "membership page sends the selected advisor to the backend");
  expectIncludes(view, '<option value="unassigned">未分配</option>', "membership advisor filter includes unassigned memberships");
  expectIncludes(view, 'advisor.status !== "active" ? "（已停用）" : ""', "inactive historical advisors are labelled in the membership filter");
  expectIncludes(adminVueApi, 'return request("/api/admin/memberships?view=advisors");', "membership page uses the deployed single-level advisor route");
  expectNotRegex(adminVueApi, /request\("\/api\/admin\/memberships\/advisors"\)/, "membership page avoids the unsupported nested advisor route");
  expectRegex(adminApi, /if \(entitlement\.advisor_admin_id\)[\s\S]*if \(entitlement\.created_by_admin_id\)[\s\S]*if \(entitlement\.granted_by_admin_id\)[\s\S]*generated_by_admin_id/, "membership advisor resolution keeps strict short-circuit priority");
  expectIncludes(adminApi, 'const advisorFilter = String(queryParams.advisor_admin_id || "").trim();', "membership API accepts the advisor filter");
  expectIncludes(adminApi, '{ search: safeSearch, loadAll: true }', "membership search is not capped at the shared 100-user lookup limit");
  expectIncludes(adminApi, 'select("*", { count: "exact" })', "membership batch queries use exact counts across PostgREST pages");
  expectIncludes(adminApi, "filterMembershipEntitlements(filteredEntitlements", "membership filters run before pagination");
  expectIncludes(adminApi, "paginateMembershipItems(filteredEntitlements", "membership totals and page items use one filtered collection");
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
  const groupStats = "api/_lib/transport-group-stats.js";
  const lifecycle = "api/_lib/transport-group-lifecycle.js";
  const p0Integration = "scripts/test-transport-join-p0-integration.js";

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
  expectIncludes(adminVueApi, 'return request("/api/admin/memberships?view=advisors");', "membership advisor options use a Vercel-compatible single-level admin route");
  expectNotRegex(adminVueApi, /request\("\/api\/admin\/memberships\/advisors"\)/, "membership advisor options do not use an unsupported nested aggregate route");
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
  expectIncludes(publicBoard, "filterPublicSourceRows", "public board separates grouped requests from standalone request privacy filtering");
  expectIncludes(publicBoard, "isPublicJoinableGroup", "grouped board items use group-level joinability");
  expectIncludes(publicBoard, "group_visible_on_frontend", "grouped board items require explicit frontend visibility");
  expectNotRegex(publicBoard, /\.eq\(\s*["']shareable["']\s*,\s*true\s*\)/, "public board does not require a shareable member as the source of a grouped item");
  expectNotRegex(publicBoard, /const joinable = \[[^;]+item\.shareable/s, "member request shareable does not control grouped board joinability");
  expectIncludes(joinPreview, "evaluateJoin", "join-carpool preview uses join evaluator");
  expectIncludes(joinSubmit, "evaluateJoin", "join-carpool submit uses join evaluator");
  expectIncludes(joinHelper, "evaluateJoinWindowAwareRelaxed", "join-carpool evaluator uses relaxed time-difference behavior");
  expectIncludes(joinHelper, "large_time_gap", "join-carpool evaluator returns large-time-gap warnings");
  expectIncludes(joinHelper, "cross_midnight_date_mismatch", "join-carpool evaluator warns for allowed cross-midnight joins");
  expectIncludes("scripts/test-transport-join-p0.js", "all members may be non-shareable", "P0 regression covers groups whose members are all non-shareable");
  expectIncludes(joinHelper, "group?.max_passengers", "join-carpool evaluator uses the group's actual capacity");
  expectIncludes(joinHelper, "group?.visible_on_frontend === true", "join-carpool evaluator requires an explicitly public group");
  expectRegex(joinHelper, /\[\s*"single_member"\s*,\s*"active"\s*,\s*"open"\s*\]\.includes\(groupStatus\)/, "JS join evaluator allows single_member, active, and open Groups");
  expectIncludes(p0Integration, "full_rejection", "P0 integration verifies blocked/full Groups cannot be joined");
  expectIncludes(p0Integration, "concurrent_last_seat", "P0 integration verifies atomic final-seat protection");
  expectIncludes(p0Integration, "createProtectedEmptyGroup", "P0 integration creates its own protected empty-group fixture");
  expectIncludes(groupStats, "localeCompare", "join target selection is deterministic across member query order");
  expectIncludes(joinSubmit, "transport_frontend_join_time_risk_confirmed", "frontend large-time-gap joins are logged after success");
  expectIncludes(joinSubmit, 'supabase.rpc("join_transport_group_atomic"', "public submit delegates final state, duplicate, and capacity checks to the atomic RPC");
  expectNotRegex(joinSubmit, /createRequestRecord|addRequestToGroup/, "public submit no longer uses non-transactional request/member writes");
  expectIncludes(lifecycle, "cleanupEmptyTransportGroups", "empty-group cleanup helper exists");
  expectIncludes(lifecycle, "DEFAULT_EMPTY_GROUP_GRACE_MINUTES = 10", "empty-group cleanup keeps the 10-minute grace window");
  expectIncludes(lifecycle, "active_member_count", "empty-group cleanup uses effective active members, not stale closed members");
  expectIncludes(lifecycle, "buildTimeDistanceWarning", "backend transfer uses warnings for large time gaps");
  expectIncludes(lifecycle, "beforeInsertStats", "final membership write rechecks capacity before insert");
  expectIncludes(lifecycle, "afterInsertStats.current_passenger_count > afterInsertStats.max_passengers", "final membership write rolls back a concurrent over-capacity insert");
  expectNotRegex(lifecycle, /distance\s*>\s*MAX_TIME_ADJUST_CANDIDATE_HOURS\)\s*\{\s*throw buildTransportLifecycleError\("target group time is outside the allowed window"/, "backend transfer no longer hard-blocks large time gaps");
  expectIncludes(publicBoard, '.select("group_id, id, status, visible_on_frontend, max_passengers, group_date, flight_time_reference")', "public board preserves UUID id and text group_id as separate fields");
  expectRegex(groupStats, /!\["closed",\s*"cancelled"\]\.includes/, "public Group aggregates exclude inactive Requests");
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
  const pickupFormHtml = "pickup-form.html";
  const pickupForm = "pickup-form.js";
  const transportPublic = "transport-public.js";
  const transportApi = "transport-api.js";
  const joinHelper = "api/_lib/transport-join.js";

  expectIncludes(pickupForm, "function formatDateTimeLocalText(value)", "pickup summary has local datetime text formatter");
  expectIncludes(pickupForm, "`航班时间: ${formatDateTimeLocalText(data.flight_datetime)}`", "pickup summary flight time uses raw datetime-local text");
  expectNotRegex(pickupForm, /航班时间:\s*\$\{formatDateTime\(data\.flight_datetime\)\}/, "pickup summary flight time avoids timezone formatter");
  expectNotRegex(pickupFormHtml, /name=["']preferred_time["']|接送期望时间段/, "pickup form no longer renders preferred time field");
  expectNotRegex(pickupForm, /preferred_time(?:_start|_end)?/, "pickup frontend no longer reads or submits preferred time");
  expectNotRegex(pickupFormHtml, /name=["']deadline_date["']|拼车截止日期/, "pickup form no longer renders carpool deadline field");
  expectNotRegex(pickupForm, /deadline_date|截止日期/, "pickup frontend no longer validates, summarizes, or stores carpool deadline");
  expectRegex(pickupFormHtml, /id="carpoolSummaryCard"\s+hidden/, "pickup summary is hidden before a confirmed submission");
  expectNotRegex(pickupFormHtml, /提交后会在这里生成摘要|无论提交成功还是失败|暂未生成摘要/, "pickup page has no pre-submit summary placeholder copy");
  expectIncludes(pickupForm, "正在核查是否已有相同登记，请勿重复提交……", "pickup submit distinguishes duplicate checking state");
  expectIncludes(pickupForm, "正在提交，请勿关闭页面或重复点击……", "pickup submit distinguishes create state");
  expectIncludes(pickupForm, 'event: "transport_submit_timing"', "pickup submit records sanitized stage timings");
  expectIncludes(pickupForm, 'setCarButtonState(submitButton, "已提交", false)', "pickup success permanently labels the button as submitted");
  expectIncludes(pickupForm, "提交结果暂时无法确认，请勿重复提交，并联系客服核查。", "pickup uncertain result blocks repeat submission and routes to support");
  expectIncludes(pickupForm, "复制核查信息", "pickup uncertain result provides verification copy action");
  expectNotRegex(pickupForm, /generateReferenceNumber|Math\.random\(\).*900000000/, "pickup success never invents a registration number");

  expectIncludes(transportPublic, "function formatDateTimeLocalText(value)", "join summary has local datetime text formatter");
  expectIncludes(transportPublic, "flightDatetimeText: formatDateTimeLocalText(payload.flight_datetime)", "join summary flight time uses raw datetime-local text");
  expectNotRegex(transportPublic, /Shared\.formatDateTime\(payload\.flight_datetime\)/, "join summary flight time avoids shared timezone formatter");
  expectNotRegex(transportPublic, /preferred_time(?:_start|_end)?|接送期望时间/, "join frontend no longer renders, reads, or submits preferred time");
  expectNotRegex(transportPublic, /deadline_date|deadlineDate|拼车截至日期/, "join frontend no longer renders or summarizes carpool deadline");
  expectIncludes(transportPublic, "正在核查是否已有相同登记，请勿重复提交……", "join submit distinguishes duplicate checking state");
  expectIncludes(transportPublic, "正在提交，请勿关闭页面或重复点击……", "join submit distinguishes create state");
  expectIncludes(transportPublic, 'event: "transport_submit_timing"', "join submit records sanitized stage timings");
  expectIncludes(transportPublic, "提交成功 · 请核对登记信息", "join summary is success-only and clearly titled");
  expectIncludes(transportPublic, "提交结果暂时无法确认，请勿重复提交，并联系客服核查。", "join uncertain result blocks repeat submission and routes to support");
  expectIncludes(transportPublic, "复制核查信息", "join uncertain result provides verification copy action");
  expectIncludes(transportApi, "acceptedStatuses: [200, 201]", "join creation only accepts explicit success statuses");
  expectIncludes(transportApi, 'submissionOutcome = "uncertain"', "transport API identifies uncertain transport responses");
  expectNotRegex("scripts/playwright-transport-flow.js", /deadline_date|deadlineDate/, "transport flow test no longer fills removed carpool deadline field");
  expectIncludes(joinHelper, "return source?.flight_datetime || null;", "join evaluator uses actual flight datetime");
  expectNotRegex(joinHelper, /body\.preferred_time|source\?\.preferred_time_start/, "join backend no longer derives or matches on preferred time");

  const sampleFlight = formatDateTimeLocalTextForRegression("2026-09-18T19:30");
  if (sampleFlight === "2026/09/18 19:30") {
    pass("datetime-local summary samples keep the customer-entered wall time");
  } else {
    fail("datetime-local summary samples keep the customer-entered wall time", sampleFlight);
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

function checkTransportMembershipOwnershipFilter() {
  const migration = "supabase/migrations/20260830120000_transport_membership_atomic_linking.sql";
  const helperFile = "api/_lib/transport-membership-query.js";
  const listApi = "api/transport-requests/index.js";
  const exportApi = "api/transport-requests/export.js";
  const adminApi = "api/admin/[...action].js";
  const view = "apps/admin-vue/src/views/TransportRequestsView.vue";
  const filters = "apps/admin-vue/src/components/TransportRequestFilters.vue";
  const helper = require(path.join(root, helperFile));

  expectIncludes(migration, "security_invoker = true", "transport membership view uses security invoker");
  expectIncludes(migration, "security_barrier = true", "transport membership view uses security barrier");
  expectIncludes(migration, "grant select on table public.admin_transport_requests_membership_view to service_role", "transport membership view grants only service-role read access");
  expectIncludes(migration, "when count(*) = 1", "transport membership view resolves only one reverse claim");
  expectIncludes(migration, "reverse_ambiguous", "transport membership view marks ambiguous reverse claims");
  expectRegex(migration, /coalesce\(\s*entitlement\.advisor_admin_id,\s*entitlement\.created_by_admin_id,\s*entitlement\.granted_by_admin_id,\s*activation_code\.generated_by_admin_id\s*\)/, "transport membership advisor priority is strict");
  expectIncludes(listApi, "from(TRANSPORT_MEMBERSHIP_VIEW)", "transport list reads membership view");
  expectIncludes(exportApi, "from(TRANSPORT_MEMBERSHIP_VIEW)", "transport export reads membership view");
  expectNotRegex(listApi, /claims\.find\(row => row\.status === "selected"/, "transport list has no same-user unbound claim inference");
  expectIncludes(adminApi, 'membershipView === "advisors"', "advisor choices use authenticated admin membership route");
  expectIncludes(adminApi, 'req.query?.view', "advisor choices are dispatched through the single-level membership query route");
  expectIncludes(view, 'membershipCategory: ""', "membership category defaults and resets to all pickup orders");
  expectIncludes(filters, '<option value="">全部接机订单</option>', "membership selector includes all pickup orders");
  expectIncludes(filters, '<option value="linked">全部会员接机订单</option>', "membership selector includes all membership pickup orders");
  expectIncludes(filters, '<option value="needs_review">需核查</option>', "membership selector includes combined review bucket");
  expectNotRegex(filters, /<option value="unlinked">|<option value="unassigned">/, "membership selector hides unlinked and standalone unassigned choices");

  const review = helper.normalizeTransportMembershipFilters({ membership_advisor_id: "needs_review" });
  if (review.membershipRelation === "linked" && review.membershipAdvisorId === "needs_review") {
    pass("needs-review forces linked membership relation");
  } else {
    fail("needs-review forces linked membership relation", JSON.stringify(review));
  }
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

function checkStorageMembershipAtomicUnbind() {
  const migration = "supabase/migrations/20260830140000_storage_membership_atomic_unbind.sql";
  const adminApi = "api/admin/[...action].js";
  const sharedHandler = "api/_lib/storage-membership-unbind.js";
  const explicitRoute = "api/admin/membership-claims/[claimId]/unbind-order.js";
  const storageDetail = "apps/admin-vue/src/views/StorageOrderDetailView.vue";
  expectIncludes(migration, "admin_unbind_storage_membership_claim_atomic", "storage membership unlink has a dedicated atomic RPC");
  expectIncludes(migration, "set search_path = public, pg_temp", "storage membership unlink RPC fixes its search path");
  expectRegex(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i, "storage membership unlink RPC denies public frontend roles");
  expectIncludes(migration, "update public.storage_orders", "storage membership unlink clears the order side in the transaction");
  expectIncludes(migration, "update public.membership_benefit_claims", "storage membership unlink clears the claim side in the transaction");
  expectNotRegex(migration, /set\s+(membership_discount_amount|extra_charge_amount|final_price|estimated_total_price)\s*=/i, "storage membership unlink does not rewrite financial fields");
  expectIncludes(adminApi, "handleStorageMembershipUnbind", "legacy storage unbind HTTP entry delegates to the shared handler");
  expectIncludes(sharedHandler, 'supabase.rpc(\n    "admin_unbind_storage_membership_claim_atomic"', "shared storage unbind handler delegates to the atomic RPC");
  expectIncludes(explicitRoute, "handleStorageMembershipUnbind", "Vercel exposes an explicit multi-segment storage unbind route");
  expectNotRegex(explicitRoute, /\.from\(|\.rpc\(|requireAdminUser|parseJsonBody/, "explicit storage unbind route does not duplicate business logic");
  expectIncludes(storageDetail, 'storage_membership_claim_unbound: "已解除会员寄存权益关联"', "storage membership unlink has a Chinese operation label");
}

function checkVercelMembershipPublicRoutes() {
  const explicitRoute = "api/public/membership/[action].js";
  expectIncludes(explicitRoute, 'require("../[...action]")', "Vercel exposes public membership multi-segment routes through the existing aggregate handler");
  expectIncludes(explicitRoute, "membership/${action}", "public membership route preserves the aggregate membership action namespace");
  expectNotRegex(explicitRoute, /membershipRedeemCodeHandler|membershipBenefitSelectionHandler|\.from\(|\.rpc\(/, "public membership deployment route does not duplicate business logic");
}

function checkTransportGroupPriceConsistency() {
  const stats = "api/_lib/transport-group-stats.js";
  const personal = "public-api-handlers/my-transport-requests.js";
  const board = "public-api-handlers/transport-board.js";
  const adminGroups = "api/transport-groups/index.js";
  const flow = "scripts/playwright-transport-flow.js";
  const matrix = "scripts/test-transport-group-pricing-consistency.js";
  expectIncludes(stats, "computeTransportGroupPricingSnapshot", "transport group price has one authoritative calculator");
  expectIncludes(personal, "loadGroupStatsMap", "personal transport requests use authoritative group pricing");
  expectIncludes(board, "loadGroupStatsMap", "public transport board uses authoritative group pricing");
  expectIncludes(adminGroups, "loadGroupStatsMap", "administrator group list uses authoritative group pricing");
  expectIncludes(flow, "repricedAveragePrice", "transport flow refreshes consumers after a group date reprices the current quote");
  expectIncludes(flow, "adminGroupAveragePrice", "transport flow compares personal and administrator current group prices");
  expectIncludes(flow, "PLAYWRIGHT_IDENTITY_TIMEOUT_MS", "protected Preview transport flow uses a configurable condition timeout instead of a fixed delay");
  expectIncludes(flow, "PLAYWRIGHT_RESPONSE_TIMEOUT_MS", "protected Preview transport flow uses a configurable response timeout instead of a fixed delay");
  expectIncludes(flow, "PLAYWRIGHT_ADMIN_LOGIN_TIMEOUT_MS", "protected Preview transport flow uses a configurable admin login condition timeout instead of a fixed delay");
  expectIncludes(matrix, "membership_does_not_change_public_group_quote", "group price matrix keeps membership discounts out of the public quote");
  expectIncludes(matrix, "financial_fields_unchanged", "group price matrix preserves payment and member financial fields");
}

function main() {
  console.log("Regression stability check");
  checkLegacyEntrypoints();
  checkTransportRequests();
  checkMembershipAdvisorFilter();
  checkTransportGroups();
  checkPublicSubmissionSummaryDateTimes();
  checkStorageWorkbench();
  checkTransportMembershipOwnershipFilter();
  checkStorageMembershipAtomicUnbind();
  checkVercelMembershipPublicRoutes();
  checkTransportGroupPriceConsistency();
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
