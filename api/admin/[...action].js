const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, created, badRequest, unauthorized, methodNotAllowed, serverError, parseJsonBody } = require("../_lib/http");
const {
  getAdminSession,
  ensureBootstrapSuperAdmin,
  serializeAdmin,
  getRolePermissions,
  requireAdminUser,
  clearAdminSessionCacheForAdmin,
  clearAdminSessionCacheForRequest
} = require("../_lib/admin-auth");
const {
  clearAdminSessionCookie,
  setAdminSessionCookie,
  createAdminSessionToken,
  verifyPassword,
  hashPassword
} = require("../_lib/admin-security");
const {
  assertPassword,
  mapManagerCreatePayload,
  mapManagerUpdatePayload,
  buildManagerFilters,
  serializeManagerList,
  createTemporaryPasswordPayload,
  assertManagerMutationAllowed
} = require("../_lib/admin-managers");
const { buildStorageOrderAdminFilters } = require("../_lib/storage-orders");
const {
  parsePositiveInteger,
  parsePageSize,
  buildOrdersListQuery,
  fetchOrderDetail,
  getOrderById,
  ORDERS_LIST_COUNT_MODE,
  updateOrderSourceRecord,
  createOrderNote,
  setOrderArchivedState,
  bulkArchiveOrders,
  logAdminOperation
} = require("../_lib/orders");
const {
  cancelOrResetClaim,
  createManualClaim,
  getCurrentMembershipCycle,
  grantMembershipEntitlement,
  logMembershipAudit,
  markClaimUsed
} = require("../_lib/membership");

let cachedStorageOrderAdminColumns = null;
let cachedStorageOrderDetailColumns = null;
let dashboardCache = null;

const DASHBOARD_CACHE_TTL_MS = 120000;
const STORAGE_ORDER_LIST_COLUMNS = [
  "id",
  "order_no",
  "order_type",
  "site_user_id",
  "student_email",
  "customer_name",
  "wechat_id",
  "phone",
  "service_date",
  "service_time",
  "service_time_slot",
  "service_label",
  "parent_order_no",
  "box_order_no",
  "storage_pickup_order_no",
  "box_delivery_date",
  "box_delivery_time_slot",
  "box_delivery_method",
  "purchased_boxes",
  "estimated_total_price",
  "estimate_summary_json",
  "storage_intake_date",
  "storage_start_date",
  "storage_end_date",
  "expected_storage_end_date",
  "address_full",
  "room_or_building",
  "postcode",
  "membership_benefit_claim_id",
  "membership_discount_amount",
  "extra_charge_amount",
  "final_price",
  "membership_discount_breakdown_json",
  "status",
  "created_at"
];
const STORAGE_ORDER_DETAIL_COLUMNS = [
  ...STORAGE_ORDER_LIST_COLUMNS,
  "updated_at",
  "estimated_box_count",
  "related_order_no",
  "has_lift",
  "needs_upstairs",
  "item_description",
  "notes",
  "final_readable_message",
  "customer_form_json",
  "service_flags_json",
  "estimate_summary_json",
  "calculator_snapshot_json"
];

function isPerfLogEnabled() {
  return process.env.NODE_ENV !== "production";
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function logPerf(label, details) {
  if (!isPerfLogEnabled()) {
    return;
  }
  console.info(`[perf][admin-api] ${label}`, details);
}

function parseActionParts(req) {
  const candidates = [
    req.query?.admin_action,
    req.query?.action,
    req.query?.["...action"],
    req.query?.slug
  ];

  for (const value of candidates) {
    if (Array.isArray(value) && value.length) {
      return value.filter(Boolean);
    }
    if (typeof value === "string" && value) {
      return value
        .split("/")
        .map(part => decodeURIComponent(part))
        .filter(Boolean);
    }
  }

  const rawUrl = String(req.url || "");
  const path = rawUrl.split("?")[0];
  const marker = "/api/admin/";
  const index = path.indexOf(marker);
  if (index >= 0) {
    return path
      .slice(index + marker.length)
      .split("/")
      .map(part => decodeURIComponent(part))
      .filter(Boolean);
  }

  return [];
}

function extractMissingColumnName(error, tableName) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  const tableMatch = tableName
    ? message.match(new RegExp(`${tableName}\\.([a-z0-9_]+)\\s+does not exist`, "i"))
    : null;
  const genericMatch = message.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i)
    || message.match(/'([a-z0-9_]+)' column of '[a-z0-9_]+'/i);
  return tableMatch?.[1] || genericMatch?.[1] || "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMergePlainObject(base, patch) {
  const output = isPlainObject(base) ? { ...base } : {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMergePlainObject(output[key], value);
      return;
    }
    output[key] = value;
  });
  return output;
}

function normalizeOptionalText(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const text = String(value).trim();
  return text || null;
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function getStorageServiceDetailsFromJson(formJson) {
  if (!isPlainObject(formJson)) {
    return {};
  }
  return isPlainObject(formJson.serviceDetails)
    ? formJson.serviceDetails
    : (isPlainObject(formJson.service_details) ? formJson.service_details : {});
}

function normalizeStorageAdminListItem(item = {}) {
  const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
  const serviceDetails = getStorageServiceDetailsFromJson(formJson);
  const estimateSummary = isPlainObject(item.estimate_summary_json) ? item.estimate_summary_json : {};
  const roomOrBuilding = firstNonEmptyText(
    item.room_or_building,
    serviceDetails.roomOrBuilding,
    serviceDetails.room_or_building,
    serviceDetails.apartmentName,
    serviceDetails.apartment_name,
    serviceDetails.buildingName,
    serviceDetails.building_name,
    formJson.roomOrBuilding,
    formJson.room_or_building
  );
  const postcode = firstNonEmptyText(
    item.postcode,
    serviceDetails.postcode,
    serviceDetails.postCode,
    serviceDetails.post_code,
    formJson.postcode,
    formJson.postCode,
    formJson.post_code
  );

  return {
    ...item,
    room_or_building: roomOrBuilding || item.room_or_building || null,
    postcode: postcode || item.postcode || null,
    box_delivery_date: firstNonEmptyText(item.box_delivery_date, serviceDetails.boxDeliveryDate, estimateSummary.boxDeliveryDate) || null,
    box_delivery_time_slot: firstNonEmptyText(item.box_delivery_time_slot, serviceDetails.boxDeliveryTimeSlot) || null,
    box_delivery_method: firstNonEmptyText(item.box_delivery_method, serviceDetails.boxDeliveryMethod, estimateSummary.boxDeliveryMethod) || null,
    storage_intake_date: firstNonEmptyText(item.storage_intake_date, item.service_date, serviceDetails.serviceDate) || null,
    storage_start_date: firstNonEmptyText(item.storage_start_date, item.service_date, serviceDetails.serviceDate, estimateSummary.startDate) || null,
    storage_end_date: firstNonEmptyText(item.storage_end_date, item.expected_storage_end_date, serviceDetails.expectedStorageEndDate, estimateSummary.endDate) || null
  };
}

function normalizeOptionalNumber(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function buildStorageAdminPatch(body) {
  const input = body.customer_form_admin
    || body.customer_form_json_admin
    || (isPlainObject(body.customer_form_json) ? body.customer_form_json.admin : null)
    || {};
  if (!isPlainObject(input)) {
    return {};
  }

  const patch = {};
  if (isPlainObject(input.billing)) {
    const billing = {};
    const actualTotal = normalizeOptionalNumber(input.billing.actual_total);
    const extraFee = normalizeOptionalNumber(input.billing.extra_fee);
    const paymentStatus = normalizeOptionalText(input.billing.payment_status);
    const paymentNote = normalizeOptionalText(input.billing.payment_note);
    if (actualTotal !== undefined) {
      billing.actual_total = actualTotal;
    }
    if (extraFee !== undefined) {
      billing.extra_fee = extraFee;
    }
    if (paymentStatus !== undefined) {
      billing.payment_status = paymentStatus && ["unpaid", "pending", "paid", "refunded", "waived"].includes(paymentStatus)
        ? paymentStatus
        : null;
    }
    if (paymentNote !== undefined) {
      billing.payment_note = paymentNote;
    }
    if (Object.keys(billing).length) {
      patch.billing = billing;
    }
  }

  if (isPlainObject(input.address)) {
    const address = {};
    const deliveryAddress = normalizeOptionalText(input.address.delivery_address);
    const warehouseNote = normalizeOptionalText(input.address.warehouse_note);
    if (deliveryAddress !== undefined) {
      address.delivery_address = deliveryAddress;
    }
    if (warehouseNote !== undefined) {
      address.warehouse_note = warehouseNote;
    }
    if (Object.keys(address).length) {
      patch.address = address;
    }
  }

  const serviceNotes = normalizeOptionalText(input.service_notes);
  if (serviceNotes !== undefined) {
    patch.service_notes = serviceNotes;
  }

  return patch;
}

async function querySiteUsersWithFallback(supabase, { search = "", ids = [] } = {}) {
  let selectedColumns = ["id", "public_user_id", "email", "phone", "nickname"];
  let searchColumns = ["public_user_id", "email", "phone", "nickname"];
  const safeSearch = String(search || "").replace(/,/g, " ").trim();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let query = supabase
      .from("site_users")
      .select(selectedColumns.join(", "))
      .limit(100);

    if (safeSearch) {
      const parts = searchColumns
        .filter(column => selectedColumns.includes(column))
        .map(column => `${column}.ilike.%${safeSearch}%`);
      if (!parts.length) {
        return [];
      }
      query = query.or(parts.join(","));
    }

    if (ids.length) {
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (!error) {
      return data || [];
    }

    const missingColumn = extractMissingColumnName(error, "site_users");
    if (!missingColumn || !selectedColumns.includes(missingColumn)) {
      throw error;
    }
    selectedColumns = selectedColumns.filter(column => column !== missingColumn);
    searchColumns = searchColumns.filter(column => column !== missingColumn);
  }

  return [];
}

async function findStorageSearchSiteUserIds(supabase, search) {
  const safeSearch = String(search || "").trim();
  if (!safeSearch) {
    return [];
  }
  const users = await querySiteUsersWithFallback(supabase, { search: safeSearch });
  return users.map(user => user.id).filter(Boolean);
}

async function enrichStorageOrdersWithPublicUserIds(supabase, items) {
  const userIds = [...new Set((items || []).map(item => item.site_user_id).filter(Boolean))];
  if (!userIds.length) {
    return items.map(item => ({
      ...item,
      public_user_id: item.customer_form_json?.publicUserId || null,
      linked_user_email: null
    }));
  }

  const users = await querySiteUsersWithFallback(supabase, { ids: userIds });
  const byId = new Map(users.map(user => [String(user.id), user]));
  return items.map(item => {
    const linkedUser = byId.get(String(item.site_user_id || ""));
    return {
      ...item,
      public_user_id: linkedUser?.public_user_id || item.customer_form_json?.publicUserId || null,
      linked_user_email: linkedUser?.email || null
    };
  });
}

async function queryAdminUsersWithFallback(supabase, { userId = "", search = "", provider = "", page = 1, pageSize = 20 } = {}) {
  let selectedColumns = [
    "id",
    "public_user_id",
    "email",
    "nickname",
    "phone",
    "first_login_at",
    "last_login_at",
    "last_login_provider",
    "login_count",
    "created_at"
  ];
  let searchColumns = ["public_user_id", "email", "nickname", "phone"];

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let query = supabase
      .from("users")
      .select(selectedColumns.join(", "), userId ? undefined : { count: "exact" });

    if (userId) {
      query = query.eq("id", userId).maybeSingle();
    } else {
      query = query
        .order("last_login_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (search) {
        const parts = searchColumns
          .filter(column => selectedColumns.includes(column))
          .map(column => `${column}.ilike.%${search}%`);
        if (parts.length) {
          query = query.or(parts.join(","));
        }
      }

      if (provider) {
        query = query.eq("last_login_provider", provider);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);
    }

    const { data, error, count } = await query;
    if (!error) {
      return { data, count: count || 0 };
    }

    const missingColumn = extractMissingColumnName(error, "users");
    if (!missingColumn || !selectedColumns.includes(missingColumn)) {
      throw error;
    }
    selectedColumns = selectedColumns.filter(column => column !== missingColumn);
    searchColumns = searchColumns.filter(column => column !== missingColumn);
  }

  return { data: userId ? null : [], count: 0 };
}

async function handleLogin(req, res, supabase) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  await ensureBootstrapSuperAdmin(supabase);

  const body = await parseJsonBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!username || !password) {
    badRequest(res, "璇疯緭鍏ヨ处鍙峰拰瀵嗙爜");
    return;
  }

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at, password_hash")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    unauthorized(res, "账号或密码错误");
    return;
  }

  if (admin.status !== "active") {
    unauthorized(res, "该账号已停用，请联系超级管理员");
    return;
  }

  const loginAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("admin_users")
    .update({ last_login_at: loginAt })
    .eq("id", admin.id);

  if (updateError) {
    throw updateError;
  }

  clearAdminSessionCacheForAdmin(admin.id);
  setAdminSessionCookie(res, createAdminSessionToken(admin.id));
  ok(res, {
    authenticated: true,
    is_admin: true,
    admin: serializeAdmin({ ...admin, last_login_at: loginAt }),
    permissions: getRolePermissions(admin.role)
  });
}

async function handleLogout(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  clearAdminSessionCacheForRequest(req);
  clearAdminSessionCookie(res);
  ok(res, { authenticated: false, is_admin: false, admin: null, permissions: null });
}

async function handleSession(req, res, supabase) {
  const startedAt = nowMs();
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }
  const session = await getAdminSession(req, supabase);
  logPerf("session", {
    authenticated: Boolean(session.authenticated),
    totalMs: nowMs() - startedAt
  });
  ok(res, session);
}

async function handleMe(req, res, supabase, subAction) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  if (subAction !== "change-password") {
    methodNotAllowed(res, []);
    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const body = await parseJsonBody(req);
  const currentPassword = String(body.current_password || "");
  const nextPasswordRaw = String(body.new_password || "");
  const confirmPassword = String(body.confirm_password || "");

  if (!currentPassword) {
    badRequest(res, "请输入当前密码");
    return;
  }

  let nextPassword;
  try {
    nextPassword = assertPassword(nextPasswordRaw);
  } catch (error) {
    badRequest(res, error.message);
    return;
  }

  if (nextPassword !== confirmPassword) {
    badRequest(res, "两次输入的新密码不一致");
    return;
  }

  if (currentPassword === nextPassword) {
    badRequest(res, "新密码不能与当前密码相同");
    return;
  }

  const { data: target, error: targetError } = await supabase
    .from("admin_users")
    .select("id, password_hash, status")
    .eq("id", adminUser.id)
    .single();

  if (targetError) {
    throw targetError;
  }

  if (!target || target.status !== "active") {
    unauthorized(res, "当前账号不可用，请重新登录");
    return;
  }

  if (!verifyPassword(currentPassword, target.password_hash)) {
    badRequest(res, "当前密码不正确");
    return;
  }

  const { error: updateError } = await supabase
    .from("admin_users")
    .update({
      password_hash: hashPassword(nextPassword),
      updated_at: new Date().toISOString()
    })
    .eq("id", adminUser.id);

  if (updateError) {
    throw updateError;
  }

  clearAdminSessionCacheForAdmin(adminUser.id);
  clearAdminSessionCacheForRequest(req);

  ok(res, { changed: true, message: "密码修改成功" });
}

async function handleDashboard(req, res, supabase) {
  const startedAt = nowMs();
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  const cached = dashboardCache;
  if (cached && Date.now() - cached.cachedAt < DASHBOARD_CACHE_TTL_MS) {
    logPerf("dashboard.cache_hit", {
      cacheHit: true,
      ageMs: Date.now() - cached.cachedAt,
      authMs,
      statsQueryMs: 0,
      countMs: 0,
      totalMs: nowMs() - startedAt
    });
    ok(res, {
      viewer: adminUser,
      cards: cached.cards,
      cache: {
        hit: true,
        ttl_ms: DASHBOARD_CACHE_TTL_MS
      }
    });
    return;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const queryStartedAt = nowMs();
  const [adminsResult, usersResult, loginEventsResult, transportRequestsResult, pendingResult, transportPublishedResult, transportMatchedResult, storagePendingResult, activeOrdersResult, archivedOrdersResult] = await Promise.all([
    supabase.from("admin_users").select("id", { count: "estimated", head: true }).eq("status", "active"),
    supabase.from("users").select("id", { count: "estimated", head: true }),
    supabase.from("user_login_events").select("id", { count: "estimated", head: true }).gte("login_at", sevenDaysAgo),
    supabase.from("transport_requests").select("id", { count: "estimated", head: true }),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }).in("status", ["published", "matched"]),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "matched"),
    supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation"),
    supabase.from("orders").select("id", { count: "estimated", head: true }).eq("archived", false),
    supabase.from("orders").select("id", { count: "estimated", head: true }).eq("archived", true)
  ]);
  const queryMs = nowMs() - queryStartedAt;

  const failed = [adminsResult, usersResult, loginEventsResult, transportRequestsResult, pendingResult, transportPublishedResult, transportMatchedResult, storagePendingResult, activeOrdersResult, archivedOrdersResult].find(result => result.error);
  if (failed) {
    throw failed.error;
  }

  const cards = {
    active_admins: adminsResult.count || 0,
    total_users: usersResult.count || 0,
    logins_last_7_days: loginEventsResult.count || 0,
    transport_requests_total: transportRequestsResult.count || 0,
    transport_requests_pending: pendingResult.count || 0,
    transport_requests_published: transportPublishedResult.count || 0,
    transport_requests_matched: transportMatchedResult.count || 0,
    storage_orders_pending: storagePendingResult.count || 0,
    active_orders_total: activeOrdersResult.count || 0,
    archived_orders_total: archivedOrdersResult.count || 0
  };
  dashboardCache = {
    cachedAt: Date.now(),
    cards
  };
  logPerf("dashboard", {
    cacheHit: false,
    authMs,
    statsQueryMs: queryMs,
    countMs: queryMs,
    totalMs: nowMs() - startedAt,
    cacheTtlMs: DASHBOARD_CACHE_TTL_MS
  });

  ok(res, {
    viewer: adminUser,
    cards,
    cache: {
      hit: false,
      ttl_ms: DASHBOARD_CACHE_TTL_MS
    }
  });
}

async function handleStorageOrders(req, res, supabase) {
  const startedAt = nowMs();
  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  const parts = parseActionParts(req);
  const storageOrderId = parts[1] || String(req.query?.id || req.query?.storage_order_id || "").trim();

  if (storageOrderId) {
    if (!["GET", "DELETE", "PATCH"].includes(req.method)) {
      methodNotAllowed(res, ["GET", "DELETE", "PATCH"]);
      return;
    }

    const existingSelect = req.method === "DELETE"
      ? ["id", "order_no"]
      : (cachedStorageOrderDetailColumns || [...STORAGE_ORDER_DETAIL_COLUMNS]);
    let selectedDetailColumns = Array.isArray(existingSelect) ? [...existingSelect] : existingSelect;
    let existing = null;
    let existingError = null;
    const detailQueryStartedAt = nowMs();
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await supabase
        .from("storage_orders")
        .select(Array.isArray(selectedDetailColumns) ? selectedDetailColumns.join(", ") : selectedDetailColumns)
        .eq("id", storageOrderId)
        .maybeSingle();
      existing = result.data;
      existingError = result.error;
      if (!existingError) {
        if (req.method !== "DELETE" && Array.isArray(selectedDetailColumns)) {
          cachedStorageOrderDetailColumns = [...selectedDetailColumns];
        }
        break;
      }

      const missingColumn = extractMissingColumnName(existingError, "storage_orders");
      if (!Array.isArray(selectedDetailColumns) || !missingColumn || !selectedDetailColumns.includes(missingColumn)) {
        break;
      }
      selectedDetailColumns = selectedDetailColumns.filter(column => column !== missingColumn);
      cachedStorageOrderDetailColumns = [...selectedDetailColumns];
    }
    const detailQueryMs = nowMs() - detailQueryStartedAt;

    if (existingError) {
      throw existingError;
    }
    if (!existing) {
      badRequest(res, "瀵勫瓨璁㈠崟涓嶅瓨鍦ㄦ垨宸茶鍒犻櫎");
      return;
    }

    if (req.method === "GET") {
      const enrichmentStartedAt = nowMs();
      const [enrichedExisting] = await enrichStorageOrdersWithPublicUserIds(supabase, [existing]);
      logPerf("storage.detail", {
        authMs,
        queryMs: detailQueryMs,
        countMs: 0,
        enrichmentMs: nowMs() - enrichmentStartedAt,
        totalMs: nowMs() - startedAt,
        rows: enrichedExisting ? 1 : 0,
        cacheHit: null
      });
      ok(res, enrichedExisting || existing);
      return;
    }

    if (req.method === "PATCH") {
      const body = await parseJsonBody(req);
      if (Object.prototype.hasOwnProperty.call(body, "customer_email") && !Object.prototype.hasOwnProperty.call(body, "student_email")) {
        body.student_email = body.customer_email;
      }
      if (Object.prototype.hasOwnProperty.call(body, "customer_phone") && !Object.prototype.hasOwnProperty.call(body, "phone")) {
        body.phone = body.customer_phone;
      }
      if (Object.prototype.hasOwnProperty.call(body, "service_type") && !Object.prototype.hasOwnProperty.call(body, "order_type")) {
        body.order_type = body.service_type;
      }
      if (Object.prototype.hasOwnProperty.call(body, "time_slot") && !Object.prototype.hasOwnProperty.call(body, "service_time_slot")) {
        body.service_time_slot = body.time_slot;
      }
      if (Object.prototype.hasOwnProperty.call(body, "pickup_address") && !Object.prototype.hasOwnProperty.call(body, "address_full")) {
        body.address_full = body.pickup_address;
      }
      if (Object.prototype.hasOwnProperty.call(body, "delivery_address")) {
        body.customer_form_admin = isPlainObject(body.customer_form_admin) ? body.customer_form_admin : {};
        body.customer_form_admin.address = isPlainObject(body.customer_form_admin.address) ? body.customer_form_admin.address : {};
        body.customer_form_admin.address.delivery_address = body.delivery_address;
      }
      if (Object.prototype.hasOwnProperty.call(body, "service_notes")) {
        body.customer_form_admin = isPlainObject(body.customer_form_admin) ? body.customer_form_admin : {};
        body.customer_form_admin.service_notes = body.service_notes;
      }

      const allowedColumns = [
        "order_type",
        "status",
        "service_date",
        "service_time_slot",
        "customer_name",
        "wechat_id",
        "phone",
        "student_email",
        "address_full",
        "room_or_building",
        "postcode",
        "estimated_box_count",
        "related_order_no",
        "has_lift",
        "needs_upstairs",
        "item_description",
        "notes",
        "final_readable_message",
        "box_delivery_date",
        "box_delivery_time_slot",
        "box_delivery_method",
        "storage_intake_date",
        "storage_start_date",
        "storage_end_date",
        "expected_storage_end_date"
      ];
      const nullableColumns = new Set([
        "service_date",
        "service_time_slot",
        "student_email",
        "address_full",
        "room_or_building",
        "postcode",
        "related_order_no",
        "item_description",
        "notes",
        "final_readable_message",
        "box_delivery_date",
        "box_delivery_time_slot",
        "box_delivery_method",
        "storage_intake_date",
        "storage_start_date",
        "storage_end_date",
        "expected_storage_end_date"
      ]);
      const patch = {};

      allowedColumns.forEach(column => {
        if (!Object.prototype.hasOwnProperty.call(body, column)) {
          return;
        }
        const value = body[column];
        if (value === "" && nullableColumns.has(column)) {
          patch[column] = null;
          return;
        }
        patch[column] = value;
      });

      if (patch.order_type && !["storage_collection", "storage_return", "storage"].includes(patch.order_type)) {
        badRequest(res, "涓嶆敮鎸佺殑瀵勫瓨璁㈠崟绫诲瀷");
        return;
      }
      if (patch.status && !["pending_confirmation", "confirmed", "cancelled"].includes(patch.status)) {
        badRequest(res, "不支持的订单状态");
        return;
      }
      if (patch.estimated_box_count !== undefined && patch.estimated_box_count !== null) {
        const nextCount = Number.parseInt(String(patch.estimated_box_count), 10);
        patch.estimated_box_count = Number.isFinite(nextCount) ? Math.max(0, nextCount) : null;
      }

      const adminPatch = buildStorageAdminPatch(body);
      if (Object.keys(adminPatch).length) {
        const currentFormJson = isPlainObject(existing.customer_form_json) ? existing.customer_form_json : {};
        patch.customer_form_json = {
          ...currentFormJson,
          admin: deepMergePlainObject(currentFormJson.admin, adminPatch)
        };
      }
      if (!Object.keys(patch).length) {
        ok(res, existing);
        return;
      }

      const { data: updateMarker, error: updateError } = await supabase
        .from("storage_orders")
        .update(patch)
        .eq("id", storageOrderId)
        .select("id")
        .single();

      if (updateError) {
        throw updateError;
      }
      if (!updateMarker) {
        badRequest(res, "鐎靛嫬鐡ㄧ拋銏犲礋娑撳秴鐡ㄩ崷銊﹀灗瀹歌尪顫﹂崚鐘绘珟");
        return;
      }

      let updated = null;
      let updatedError = null;
      let selectedUpdatedColumns = cachedStorageOrderDetailColumns || [...STORAGE_ORDER_DETAIL_COLUMNS];
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = await supabase
          .from("storage_orders")
          .select(selectedUpdatedColumns.join(", "))
          .eq("id", storageOrderId)
          .single();
        updated = result.data;
        updatedError = result.error;
        if (!updatedError) {
          cachedStorageOrderDetailColumns = [...selectedUpdatedColumns];
          break;
        }

        const missingColumn = extractMissingColumnName(updatedError, "storage_orders");
        if (!missingColumn || !selectedUpdatedColumns.includes(missingColumn)) {
          break;
        }
        selectedUpdatedColumns = selectedUpdatedColumns.filter(column => column !== missingColumn);
        cachedStorageOrderDetailColumns = [...selectedUpdatedColumns];
      }

      if (updatedError) {
        throw updatedError;
      }

      await logAdminOperation(supabase, {
        admin_user_id: adminUser.id,
        target_type: "storage_order",
        target_id: storageOrderId,
        action: "storage_order_updated",
        before_data: existing,
        after_data: updated,
        metadata: {
          order_no: existing.order_no || null,
          changed_fields: Object.keys(patch)
        }
      }).catch(error => {
        console.warn("[admin-storage] failed to write update operation log", error);
      });

      ok(res, updated);
      return;
    }

    const { error: deleteError } = await supabase
      .from("storage_orders")
      .delete()
      .eq("id", storageOrderId);

    if (deleteError) {
      throw deleteError;
    }

    logAdminOperation(supabase, {
      admin_user_id: adminUser.id,
      target_type: "storage_order",
      target_id: storageOrderId,
      action: "storage_order_deleted",
      before_data: existing,
      metadata: {
        order_no: existing.order_no || null
      }
    }).catch(error => {
      console.warn("[admin-storage] failed to write delete operation log", error);
    });

    ok(res, { deleted: true, id: storageOrderId, order_no: existing.order_no || null });
    return;
  }

  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchStartedAt = nowMs();
  const matchingSiteUserIds = await findStorageSearchSiteUserIds(supabase, queryParams.search);
  const searchMs = nowMs() - searchStartedAt;
  const storageOrderColumns = STORAGE_ORDER_LIST_COLUMNS;
  const nullableStorageOrderColumns = new Set(storageOrderColumns);
  let selectedColumns = cachedStorageOrderAdminColumns
    ? cachedStorageOrderAdminColumns.filter(column => storageOrderColumns.includes(column))
    : [...storageOrderColumns];
  if (!selectedColumns.length) {
    selectedColumns = [...storageOrderColumns];
  }
  let data = null;
  let error = null;
  let count = 0;
  const listQueryStartedAt = nowMs();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    let query = supabase
      .from("storage_orders")
      .select(selectedColumns.join(", "), { count: "exact" })
      .order("created_at", { ascending: false });

    buildStorageOrderAdminFilters(query, queryParams, {
      matchingSiteUserIds,
      supportedColumns: new Set(selectedColumns)
    });

    const result = await query.range(from, to);
    data = result.data;
    error = result.error;
    count = result.count || 0;
    if (!error) {
      cachedStorageOrderAdminColumns = [...selectedColumns];
      break;
    }

    const missingColumn = extractMissingColumnName(error, "storage_orders");
    if (!missingColumn || !selectedColumns.includes(missingColumn)) {
      break;
    }
    selectedColumns = selectedColumns.filter(column => column !== missingColumn);
    cachedStorageOrderAdminColumns = [...selectedColumns];
  }
  const listQueryMs = nowMs() - listQueryStartedAt;

  if (error) {
    throw error;
  }

  const enrichmentStartedAt = nowMs();
  const normalizedItems = (data || []).map(item => {
    const normalized = { ...item };
    nullableStorageOrderColumns.forEach(column => {
      if (!(column in normalized)) {
        normalized[column] = null;
      }
    });
    return normalized;
  });
  const enrichedItems = (await enrichStorageOrdersWithPublicUserIds(supabase, normalizedItems))
    .map(normalizeStorageAdminListItem);
  const enrichmentMs = nowMs() - enrichmentStartedAt;

  logPerf("storage.list", {
    authMs,
    page,
    pageSize,
    returned: enrichedItems.length,
    rows: enrichedItems.length,
    total: count || 0,
    searchMs,
    queryMs: listQueryMs,
    countMs: listQueryMs,
    enrichmentMs,
    totalMs: nowMs() - startedAt,
    countMode: "exact",
    cacheHit: null
  });

  ok(res, {
    items: enrichedItems,
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  });
}

async function handleUsers(req, res, supabase) {
  const startedAt = nowMs();
  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  const parts = parseActionParts(req);
  const userId = parts[1] || "";

  if (userId) {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }

    const detailQueryStartedAt = nowMs();
    const { data } = await queryAdminUsersWithFallback(supabase, { userId });
    const queryMs = nowMs() - detailQueryStartedAt;

    if (!data) {
      badRequest(res, "用户不存在");
      return;
    }

    logPerf("users.detail", {
      authMs,
      queryMs,
      countMs: 0,
      searchMs: 0,
      totalMs: nowMs() - startedAt,
      rows: data ? 1 : 0,
      cacheHit: null
    });

    ok(res, {
      ...data,
      profile_flags: {
        has_nickname: Boolean(String(data.nickname || "").trim()),
        has_phone: Boolean(String(data.phone || "").trim())
      }
    });
    return;
  }

  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 20);
  const search = String(queryParams.search || "").trim();
  const provider = String(queryParams.provider || "").trim().toLowerCase();

  if (search) {
    if (search.includes(",")) {
      badRequest(res, "搜索关键词不能包含逗号");
      return;
    }
  }

  const queryStartedAt = nowMs();
  const { data, count } = await queryAdminUsersWithFallback(supabase, {
    search,
    provider,
    page,
    pageSize
  });
  const queryMs = nowMs() - queryStartedAt;
  const rows = Array.isArray(data) ? data.length : 0;

  logPerf("users.list", {
    authMs,
    queryMs,
    countMs: queryMs,
    searchMs: search ? queryMs : 0,
    totalMs: nowMs() - startedAt,
    rows,
    page,
    pageSize,
    countMode: "exact",
    cacheHit: null
  });

  ok(res, {
    items: data || [],
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  });
}

async function handleOrdersList(req, res, supabase) {
  const startedAt = nowMs();
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 20);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const query = buildOrdersListQuery(supabase, queryParams).range(from, to);
  const queryStartedAt = nowMs();
  const { data, error, count } = await query;
  const queryMs = nowMs() - queryStartedAt;
  if (error) {
    throw error;
  }
  const rows = Array.isArray(data) ? data.length : 0;

  logPerf("orders.list", {
    authMs,
    queryMs,
    countMs: ORDERS_LIST_COUNT_MODE === "exact" ? queryMs : 0,
    totalMs: nowMs() - startedAt,
    rows,
    page,
    pageSize,
    countMode: ORDERS_LIST_COUNT_MODE,
    cacheHit: null
  });

  ok(res, {
    items: data || [],
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  });
}

async function handleOrderDetail(req, res, supabase, orderId, subAction) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  if (!subAction && req.method === "GET") {
    ok(res, await fetchOrderDetail(supabase, orderId));
    return;
  }

  if (!subAction && req.method === "PATCH") {
    const existing = await getOrderById(supabase, orderId);
    const body = await parseJsonBody(req);
    const nextOrder = await updateOrderSourceRecord(supabase, existing, body);
    await logAdminOperation(supabase, {
      admin_user_id: adminUser.id,
      order_id: orderId,
      action: body.status && !("customer_name" in body || "phone" in body || "wechat_or_whatsapp" in body)
        ? "order_status_updated"
        : "order_contact_updated",
      before_data: {
        status: existing.status,
        customer_name: existing.customer_name,
        phone: existing.phone,
        wechat_or_whatsapp: existing.wechat_or_whatsapp
      },
      after_data: {
        status: nextOrder.status,
        customer_name: nextOrder.customer_name,
        phone: nextOrder.phone,
        wechat_or_whatsapp: nextOrder.wechat_or_whatsapp
      },
      metadata: {
        source_table: existing.source_table,
        source_id: existing.source_id
      }
    });
    ok(res, await fetchOrderDetail(supabase, orderId));
    return;
  }

  if (subAction === "notes") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }

    const body = await parseJsonBody(req);
    const note = await createOrderNote(supabase, orderId, adminUser.id, body);
    await logAdminOperation(supabase, {
      admin_user_id: adminUser.id,
      order_id: orderId,
      action: "order_note_created",
      after_data: {
        note: note.note,
        note_type: note.note_type
      }
    });
    created(res, note);
    return;
  }

  if (subAction === "archive" || subAction === "unarchive") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }

    const before = await getOrderById(supabase, orderId);
    const archived = subAction === "archive";
    const data = await setOrderArchivedState(supabase, orderId, archived);
    await logAdminOperation(supabase, {
      admin_user_id: adminUser.id,
      order_id: orderId,
      action: archived ? "order_archived" : "order_unarchived",
      before_data: {
        archived: before.archived,
        archived_at: before.archived_at
      },
      after_data: data
    });
    ok(res, data);
    return;
  }

  methodNotAllowed(res, ["GET", "PATCH", "POST"]);
}

async function handleOrdersArchiveRun(req, res, supabase) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const body = await parseJsonBody(req);
  const olderThanMonths = parsePositiveInteger(body.older_than_months, 6);
  const archivedCount = await bulkArchiveOrders(supabase, olderThanMonths);

  await logAdminOperation(supabase, {
    admin_user_id: adminUser.id,
    target_type: "order_archive_batch",
    action: "orders_bulk_archived",
    after_data: {
      archived_count: archivedCount,
      older_than_months: olderThanMonths
    }
  });

  ok(res, {
    archived_count: archivedCount,
    older_than_months: olderThanMonths
  });
}

async function handleManagersList(req, res, supabase) {
  const startedAt = nowMs();
  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase, { roles: ["super_admin"] });
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  if (req.method === "GET") {
    const queryParams = req.query || {};
    const page = parsePositiveInteger(queryParams.page, 1);
    const pageSize = parsePageSize(queryParams.page_size, 20);
    let query = supabase
      .from("admin_users")
      .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at", { count: "exact" })
      .order("created_at", { ascending: false });
    buildManagerFilters(query, queryParams);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const queryStartedAt = nowMs();
    const { data, error, count } = await query.range(from, to);
    const queryMs = nowMs() - queryStartedAt;
    if (error) {
      throw error;
    }
    const rows = Array.isArray(data) ? data.length : 0;

    logPerf("managers.list", {
      authMs,
      queryMs,
      countMs: queryMs,
      totalMs: nowMs() - startedAt,
      rows,
      page,
      pageSize,
      countMode: "exact",
      cacheHit: null
    });

    ok(res, {
      items: serializeManagerList(data),
      pagination: {
        page,
        page_size: pageSize,
        total: count || 0,
        total_pages: count ? Math.ceil(count / pageSize) : 0
      }
    });
    return;
  }

  if (req.method === "POST") {
    const body = await parseJsonBody(req);
    let payload;
    try {
      payload = mapManagerCreatePayload(body);
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    const { data: duplicateByUsername, error: usernameError } = await supabase.from("admin_users").select("id").eq("username", payload.username).maybeSingle();
    if (usernameError) {
      throw usernameError;
    }
    if (duplicateByUsername) {
      badRequest(res, "该账号已存在，请更换后重试");
      return;
    }

    if (payload.email) {
      const { data: duplicateByEmail, error: emailError } = await supabase.from("admin_users").select("id").eq("email", payload.email).maybeSingle();
      if (emailError) {
        throw emailError;
      }
      if (duplicateByEmail) {
        badRequest(res, "该邮箱已绑定其他管理员");
        return;
      }
    }

    const { data, error } = await supabase
      .from("admin_users")
      .insert(payload)
      .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at")
      .single();

    if (error) {
      throw error;
    }
    created(res, { manager: serializeAdmin(data), message: "閺傛澘顤冮幋鎰" });
    return;
  }

  methodNotAllowed(res, ["GET", "POST"]);
}

async function handleManagerDetail(req, res, supabase, id, subAction) {
  const adminUser = await requireAdminUser(req, res, supabase, { roles: ["super_admin"] });
  if (!adminUser) {
    return;
  }

  const { data: target, error: targetError } = await supabase
    .from("admin_users")
    .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at")
    .eq("id", id)
    .single();

  if (targetError) {
    throw targetError;
  }

  if (!subAction) {
    if (req.method === "DELETE") {
      try {
        await assertManagerMutationAllowed(supabase, adminUser, target, { delete: true, role: target.role, status: target.status });
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { error } = await supabase
        .from("admin_users")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }

      clearAdminSessionCacheForAdmin(id);
      ok(res, { deleted: true, id, message: "閸掔娀娅庨幋鎰" });
      return;
    }

    if (req.method !== "PATCH") {
      methodNotAllowed(res, ["PATCH", "DELETE"]);
      return;
    }

    const body = await parseJsonBody(req);
    let payload;
    try {
      payload = mapManagerUpdatePayload(body);
      await assertManagerMutationAllowed(supabase, adminUser, target, payload);
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    if (payload.email) {
      const { data: duplicateByEmail, error: emailError } = await supabase
        .from("admin_users")
        .select("id")
        .eq("email", payload.email)
        .neq("id", id)
        .maybeSingle();
      if (emailError) {
        throw emailError;
      }
      if (duplicateByEmail) {
        badRequest(res, "该邮箱已绑定其他管理员");
        return;
      }
    }

    const { data, error } = await supabase
      .from("admin_users")
      .update(payload)
      .eq("id", id)
      .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at")
      .single();

    if (error) {
      throw error;
    }
    clearAdminSessionCacheForAdmin(id);
    ok(res, { manager: serializeAdmin(data), message: "娣囨繂鐡ㄩ幋鎰" });
    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  if (subAction === "reset-password") {
    if (adminUser.id === id) {
      badRequest(res, "不能重置当前登录账号的密码");
      return;
    }
    const nextPassword = createTemporaryPasswordPayload();
    const { error } = await supabase.from("admin_users").update({ password_hash: nextPassword.passwordHash }).eq("id", id);
    if (error) {
      throw error;
    }
    clearAdminSessionCacheForAdmin(id);
    ok(res, { temporary_password: nextPassword.temporaryPassword, message: "密码已重置" });
    return;
  }

  methodNotAllowed(res, []);
}

async function handleMemberships(req, res, supabase, subAction = "") {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  if (subAction === "users") {
    if (req.method !== "GET") {
      methodNotAllowed(res, ["GET"]);
      return;
    }
    const search = String(req.query?.search || "").trim();
    if (!search) {
      ok(res, { items: [] });
      return;
    }
    const users = await querySiteUsersWithFallback(supabase, { search });
    ok(res, { items: users.slice(0, 20) });
    return;
  }

  if (req.method === "POST") {
    const body = await parseJsonBody(req);
    try {
      const entitlement = await grantMembershipEntitlement(supabase, {
        site_user_id: body.site_user_id,
        membership_cycle: body.membership_cycle || getCurrentMembershipCycle(),
        valid_from: body.valid_from || null,
        valid_until: body.valid_until || null,
        notes: body.notes || null,
        metadata: isPlainObject(body.metadata) ? body.metadata : {}
      }, adminUser.id);
      created(res, { entitlement });
    } catch (error) {
      badRequest(res, error.message);
    }
    return;
  }

  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 20);
  const cycle = String(queryParams.cycle || getCurrentMembershipCycle()).trim();
  const status = String(queryParams.status || "").trim();
  const benefitType = String(queryParams.benefit_type || "").trim();
  const claimStatus = String(queryParams.claim_status || "").trim();
  const search = String(queryParams.search || "").trim();
  const matchingUserIds = search ? await findStorageSearchSiteUserIds(supabase, search) : [];

  let query = supabase
    .from("membership_entitlements")
    .select("*", { count: "exact" })
    .eq("membership_cycle", cycle)
    .order("created_at", { ascending: false });
  if (status) {
    query = query.eq("status", status);
  }
  if (search) {
    if (!matchingUserIds.length) {
      ok(res, {
        items: [],
        pagination: { page, page_size: pageSize, total: 0, total_pages: 0 }
      });
      return;
    }
    query = query.in("site_user_id", matchingUserIds);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw error;
  }

  const entitlements = data || [];
  const entitlementIds = entitlements.map(item => item.id);
  const userIds = entitlements.map(item => item.site_user_id).filter(Boolean);
  let claims = [];
  let auditLogs = [];
  if (entitlementIds.length) {
    let claimsQuery = supabase
      .from("membership_benefit_claims")
      .select("*")
      .in("entitlement_id", entitlementIds)
      .order("created_at", { ascending: false });
    if (benefitType) {
      claimsQuery = claimsQuery.eq("benefit_type", benefitType);
    }
    if (claimStatus) {
      claimsQuery = claimsQuery.eq("status", claimStatus);
    }
    const claimsResult = await claimsQuery;
    if (claimsResult.error) {
      throw claimsResult.error;
    }
    claims = claimsResult.data || [];
  }
  if (entitlementIds.length) {
    const claimIds = claims.map(claim => claim.id).filter(Boolean);
    let auditQuery = supabase
      .from("membership_audit_logs")
      .select("id, admin_user_id, site_user_id, entitlement_id, claim_id, action, before_data, after_data, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (claimIds.length) {
      auditQuery = auditQuery.or(`entitlement_id.in.(${entitlementIds.join(",")}),claim_id.in.(${claimIds.join(",")})`);
    } else {
      auditQuery = auditQuery.in("entitlement_id", entitlementIds);
    }
    const auditResult = await auditQuery;
    if (auditResult.error) {
      throw auditResult.error;
    }
    auditLogs = auditResult.data || [];
  }
  const users = userIds.length ? await querySiteUsersWithFallback(supabase, { ids: userIds }) : [];
  const claimByEntitlement = new Map();
  claims.forEach(claim => {
    if (!claimByEntitlement.has(claim.entitlement_id)) {
      claimByEntitlement.set(claim.entitlement_id, claim);
    }
  });
  const userById = new Map(users.map(user => [String(user.id), user]));
  const auditLogsByEntitlement = new Map();
  auditLogs.forEach(log => {
    const key = String(log.entitlement_id || "");
    if (!key) {
      return;
    }
    if (!auditLogsByEntitlement.has(key)) {
      auditLogsByEntitlement.set(key, []);
    }
    auditLogsByEntitlement.get(key).push(log);
  });

  ok(res, {
    items: entitlements
      .map(entitlement => ({
        ...entitlement,
        user: userById.get(String(entitlement.site_user_id)) || null,
        claim: claimByEntitlement.get(entitlement.id) || null,
        audit_logs: auditLogsByEntitlement.get(String(entitlement.id)) || []
      }))
      .filter(item => {
        if (!benefitType && !claimStatus) {
          return true;
        }
        return Boolean(item.claim);
      }),
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  });
}

async function handleMembershipClaimAction(req, res, supabase, claimId, subAction) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  const body = await parseJsonBody(req);
  if (!claimId) {
    try {
      ok(res, { claim: await createManualClaim(supabase, body, adminUser.id) });
    } catch (error) {
      badRequest(res, error.message, error.claim ? { claim: error.claim } : null);
    }
    return;
  }
  if (subAction === "mark-used") {
    ok(res, { claim: await markClaimUsed(supabase, claimId, adminUser.id) });
    return;
  }
  if (subAction === "cancel") {
    ok(res, { claim: await cancelOrResetClaim(supabase, claimId, adminUser.id, { reason: body.reason || body.note }) });
    return;
  }
  if (subAction === "reset") {
    ok(res, { claim: await cancelOrResetClaim(supabase, claimId, adminUser.id, { reset: true, reason: body.reason || body.note }) });
    return;
  }
  methodNotAllowed(res, ["POST"]);
}

module.exports = async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const parts = parseActionParts(req);
    const [head, second, third] = parts;

    if (head === "login") {
      await handleLogin(req, res, supabase);
      return;
    }
    if (head === "logout") {
      await handleLogout(req, res);
      return;
    }
    if (head === "session") {
      await handleSession(req, res, supabase);
      return;
    }
    if (head === "me") {
      await handleMe(req, res, supabase, second || "");
      return;
    }
    if (head === "dashboard") {
      await handleDashboard(req, res, supabase);
      return;
    }
    if (head === "users") {
      await handleUsers(req, res, supabase);
      return;
    }
    if (head === "storage-orders") {
      await handleStorageOrders(req, res, supabase);
      return;
    }
    if (head === "orders" && !second) {
      await handleOrdersList(req, res, supabase);
      return;
    }
    if (head === "orders" && second === "archive" && third === "run") {
      await handleOrdersArchiveRun(req, res, supabase);
      return;
    }
    if (head === "orders" && second) {
      await handleOrderDetail(req, res, supabase, second, third || "");
      return;
    }
    if (head === "managers" && !second) {
      await handleManagersList(req, res, supabase);
      return;
    }
    if (head === "managers" && second) {
      await handleManagerDetail(req, res, supabase, second, third || "");
      return;
    }
    if (head === "memberships") {
      await handleMemberships(req, res, supabase, second || "");
      return;
    }
    if (head === "membership-claims") {
      await handleMembershipClaimAction(req, res, supabase, second || "", third || "");
      return;
    }

    methodNotAllowed(res, []);
  } catch (error) {
    serverError(res, error);
  }
};
