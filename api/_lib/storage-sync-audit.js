const { EventEmitter } = require("events");
const { createUserSessionToken, COOKIE_NAME } = require("./user-auth");

const myStorageOrdersHandler = require("../../public-api-handlers/my-storage-orders");

const DEFAULT_SAMPLE_SIZE = 20;
const MAX_SAMPLE_SIZE = 100;
const DEFAULT_SITE_USER_CUTOVER_AT = "2026-05-07T00:00:00Z";
const SENSITIVE_FIELD_PATTERN = /(phone|wechat|whatsapp|email|address)/i;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeDate(value) {
  return String(value || "").slice(0, 10);
}

function storageStartDate(row) {
  return normalizeDate(row.storage_start_date || row.service_date);
}

function storageEndDate(row) {
  return normalizeDate(row.expected_storage_end_date || row.storage_start_date || row.service_date);
}

function normalizeSampleSize(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SAMPLE_SIZE;
  return Math.min(Math.max(parsed, 1), MAX_SAMPLE_SIZE);
}

function normalizeCutoverAt(value) {
  const candidate = String(value || process.env.STORAGE_SYNC_AUDIT_SITE_USER_CUTOVER_AT || DEFAULT_SITE_USER_CUTOVER_AT).trim();
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? DEFAULT_SITE_USER_CUTOVER_AT : new Date(timestamp).toISOString();
}

function isBeforeCutover(createdAt, cutoverAt) {
  const createdTime = Date.parse(createdAt || "");
  const cutoverTime = Date.parse(cutoverAt || DEFAULT_SITE_USER_CUTOVER_AT);
  if (Number.isNaN(createdTime)) return false;
  return createdTime < cutoverTime;
}

function hasValue(value) {
  return normalizeText(value) !== "";
}

function safeComparisonValue(value) {
  return hasValue(value) ? "present" : "missing";
}

function shouldRedactField(field) {
  return SENSITIVE_FIELD_PATTERN.test(String(field || ""));
}

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`relation "${relationName}" does not exist`)
    || message.includes(`Could not find the table 'public.${relationName}' in the schema cache`);
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "");
  return error?.code === "42703" || message.includes(`'${columnName}' column`) || message.includes(`column "${columnName}"`);
}

function createMockReq({ method = "GET", query = {}, headers = {} } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.query = query;
  req.headers = headers;
  process.nextTick(() => req.emit("end"));
  return req;
}

function createMockRes(resolve) {
  const headers = {};
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    end(body) {
      let parsedBody = body;
      if (typeof body === "string") {
        try {
          parsedBody = JSON.parse(body);
        } catch (error) {
          parsedBody = body;
        }
      }
      resolve({
        statusCode: this.statusCode,
        headers,
        body: parsedBody
      });
    }
  };
}

function invokeHandler(handler, options = {}) {
  return new Promise((resolve, reject) => {
    const req = createMockReq(options);
    const res = createMockRes(resolve);
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function addMismatch(mismatches, order, field, expected, actual, extra = {}) {
  const redact = extra.sensitive === true || shouldRedactField(field);
  const extraFields = { ...extra };
  delete extraFields.sensitive;
  mismatches.push({
    order_no: order?.order_no || "",
    storage_order_id: order?.id || "",
    surface: "storage_sync_audit",
    field,
    expected: redact ? safeComparisonValue(expected) : expected,
    actual: redact ? safeComparisonValue(actual) : actual,
    ...(redact ? { value_policy: "presence_only", sensitive: true } : {}),
    ...extraFields
  });
}

function compareField(mismatches, storageOrder, orderCenterRow, field, expected, actual) {
  if (normalizeText(expected) !== normalizeText(actual)) {
    addMismatch(mismatches, storageOrder, field, expected, actual, {
      order_center_id: orderCenterRow?.id || ""
    });
  }
}

async function fetchPersonalCenterOrders(siteUserId) {
  const response = await invokeHandler(myStorageOrdersHandler, {
    method: "GET",
    query: { scope: "user-center" },
    headers: {
      cookie: `${COOKIE_NAME}=${createUserSessionToken(siteUserId)}`
    }
  });
  if (response.statusCode !== 200 || response.body?.error) {
    throw new Error(response.body?.error?.message || "Failed to load storage orders from personal center");
  }
  return Array.isArray(response.body?.data) ? response.body.data : [];
}

async function runStorageSyncAudit(supabase, options = {}) {
  const sampleSize = normalizeSampleSize(options.sampleSize || options.sample_size);
  const cutoverAt = normalizeCutoverAt(options.cutoverAt || options.cutover_at);
  const mismatches = [];
  const skippedChecks = [];

  const { data: storageOrders, error: storageError } = await supabase
    .from("storage_orders")
    .select([
      "id",
      "order_no",
      "order_type",
      "status",
      "site_user_id",
      "customer_name",
      "phone",
      "wechat_id",
      "service_date",
      "storage_start_date",
      "expected_storage_end_date",
      "created_at"
    ].join(", "))
    .order("created_at", { ascending: false })
    .limit(sampleSize);

  if (storageError) throw storageError;

  const sampledOrders = Array.isArray(storageOrders) ? storageOrders : [];
  const sampledOrderNos = sampledOrders.map(item => item.order_no).filter(Boolean);
  const sampledIds = sampledOrders.map(item => item.id).filter(Boolean);

  let orderCenterRows = [];
  if (sampledIds.length) {
    const { data, error } = await supabase
      .from("orders")
      .select([
        "id",
        "source_id",
        "source_table",
        "order_no",
        "user_id",
        "service_type",
        "customer_name",
        "phone",
        "wechat_or_whatsapp",
        "status",
        "storage_start_date",
        "storage_end_date"
      ].join(", "))
      .eq("source_table", "storage_orders")
      .in("source_id", sampledIds);
    if (error) throw error;
    orderCenterRows = Array.isArray(data) ? data : [];
  }

  const orderCenterBySourceId = new Map(orderCenterRows.map(item => [String(item.source_id), item]));
  sampledOrders.forEach(storageOrder => {
    const orderCenterRow = orderCenterBySourceId.get(String(storageOrder.id));
    if (!orderCenterRow) {
      addMismatch(mismatches, storageOrder, "order_center_row", "present in orders", "missing");
      return;
    }

    compareField(mismatches, storageOrder, orderCenterRow, "order_no", storageOrder.order_no, orderCenterRow.order_no);
    compareField(mismatches, storageOrder, orderCenterRow, "user_id", storageOrder.site_user_id || "", orderCenterRow.user_id || "");
    compareField(mismatches, storageOrder, orderCenterRow, "service_type", "storage", orderCenterRow.service_type);
    compareField(mismatches, storageOrder, orderCenterRow, "customer_name", storageOrder.customer_name, orderCenterRow.customer_name);
    compareField(mismatches, storageOrder, orderCenterRow, "phone", storageOrder.phone, orderCenterRow.phone);
    compareField(mismatches, storageOrder, orderCenterRow, "wechat_or_whatsapp", storageOrder.wechat_id, orderCenterRow.wechat_or_whatsapp);
    compareField(mismatches, storageOrder, orderCenterRow, "status", storageOrder.status, orderCenterRow.status);
    compareField(mismatches, storageOrder, orderCenterRow, "storage_start_date", storageStartDate(storageOrder), normalizeDate(orderCenterRow.storage_start_date));
    compareField(mismatches, storageOrder, orderCenterRow, "storage_end_date", storageEndDate(storageOrder), normalizeDate(orderCenterRow.storage_end_date));
  });

  const ordersByUserId = new Map();
  sampledOrders.forEach(order => {
    if (!order.site_user_id) {
      if (!isBeforeCutover(order.created_at, cutoverAt)) {
        addMismatch(mismatches, order, "site_user_id", "present", "missing", {
          reason: "no_site_user_id_after_cutover",
          created_at: order.created_at || "",
          cutover_at: cutoverAt,
          sensitive: true
        });
        return;
      }
      skippedChecks.push({
        order_no: order.order_no,
        storage_order_id: order.id,
        surface: "personal_center",
        reason: "legacy_no_site_user_id",
        created_at: order.created_at || "",
        cutover_at: cutoverAt
      });
      return;
    }
    const key = String(order.site_user_id);
    ordersByUserId.set(key, [...(ordersByUserId.get(key) || []), order]);
  });

  let checkedUserOrderCount = 0;
  for (const [siteUserId, orders] of ordersByUserId.entries()) {
    let personalOrders = [];
    try {
      personalOrders = await fetchPersonalCenterOrders(siteUserId);
    } catch (error) {
      orders.forEach(order => {
        addMismatch(mismatches, order, "personal_center_api", "successful response", error.message || "request_failed");
      });
      continue;
    }
    checkedUserOrderCount += personalOrders.length;
    const personalOrderNos = new Set(personalOrders.map(item => item.orderNo || item.order_no).filter(Boolean));
    orders.forEach(order => {
      if (!personalOrderNos.has(order.order_no)) {
        addMismatch(mismatches, order, "personal_center_visible", "visible", "missing");
      }
    });
  }

  const report = {
    checked_at: new Date().toISOString(),
    sampled_order_count: sampledOrders.length,
    sampled_order_nos: sampledOrderNos,
    checked_user_order_count: checkedUserOrderCount,
    checked_order_center_count: orderCenterRows.length,
    cutover_at: cutoverAt,
    skipped_check_count: skippedChecks.length,
    skipped_checks: skippedChecks,
    mismatch_count: mismatches.length,
    mismatches
  };

  let storage = { stored: true };
  try {
    const insertPayload = {
      checked_at: report.checked_at,
      sampled_order_count: report.sampled_order_count,
      sampled_order_nos: report.sampled_order_nos,
      checked_user_order_count: report.checked_user_order_count,
      checked_order_center_count: report.checked_order_center_count,
      cutover_at: report.cutover_at,
      skipped_check_count: report.skipped_check_count,
      skipped_checks: report.skipped_checks,
      mismatch_count: report.mismatch_count,
      mismatches: report.mismatches
    };
    let insertResult = await supabase
      .from("storage_sync_audit_logs")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertResult.error && isMissingColumnError(insertResult.error, "cutover_at")) {
      delete insertPayload.cutover_at;
      insertResult = await supabase
        .from("storage_sync_audit_logs")
        .insert(insertPayload)
        .select("id")
        .single();
      storage.schema_warning = "missing_cutover_at_column";
    }

    if (insertResult.error) throw insertResult.error;
    storage.log_id = insertResult.data?.id || null;
  } catch (error) {
    if (isMissingRelationError(error, "storage_sync_audit_logs")) {
      storage = { stored: false, reason: "missing_table" };
    } else {
      throw error;
    }
  }

  return {
    ...report,
    storage,
    notification: {
      sent: false,
      skipped: true,
      reason: "notification_not_enabled"
    }
  };
}

module.exports = {
  isMissingRelationError,
  isMissingColumnError,
  runStorageSyncAudit
};
