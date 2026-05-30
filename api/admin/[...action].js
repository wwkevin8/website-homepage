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
  assertManagerMutationAllowed,
  isRootManagerAccount
} = require("../_lib/admin-managers");
const { buildStorageOrderAdminFilters } = require("../_lib/storage-orders");
const { recalculateStorageOrderPricing } = require("../_lib/storage-pricing");
const { handlePostageOrders } = require("../_lib/postage-admin");
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
  calculateMembershipDiscount,
  createMembershipActivationCode,
  createMembershipActivationCodes,
  createManualClaim,
  deleteMembershipActivationCode,
  deleteMembershipEntitlement,
  getCurrentMembershipCycle,
  grantMembershipEntitlement,
  listMembershipActivationCodes,
  logMembershipAudit,
  markClaimUsed,
  releaseClaimOrderBinding,
  revokeMembershipActivationCode
} = require("../_lib/membership");
const {
  banCommunityUser,
  deleteCommunityImage,
  getCommunityPostDetail,
  listCommentReports,
  listCommunityComments,
  listCommunityPosts,
  updateCommunityComment,
  updateCommunityPost
} = require("../_lib/admin-community");
const transportGroupsHandler = require("../transport-groups");

let cachedStorageOrderAdminColumns = null;
let cachedStorageOrderDetailColumns = null;
let dashboardCache = null;

const DASHBOARD_CACHE_TTL_MS = 120000;
const DASHBOARD_RISK_LABELS = {
  overdue_unprocessed: "超过 24 小时未登记",
  no_operator: "无最近操作人",
  offline_unrecorded: "未标记线下记录",
  missing_fields: "关键字段缺失"
};
const DASHBOARD_RISK_HELPERS = {
  overdue_unprocessed: "创建超过 24 小时仍未完成线下登记",
  no_operator: "需要明确客服责任人",
  offline_unrecorded: "可能尚未同步到客服台账",
  missing_fields: "学生已提交但后台信息不完整"
};
const ORDER_LIST_COLUMNS = "id, source_table, source_id, order_no, user_id, service_type, customer_name, phone, wechat_or_whatsapp, status, flight_no, pickup_date, storage_start_date, storage_end_date, archived, archived_at, completed_at, latest_note_at, created_at, updated_at";
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
  "offline_recorded",
  "last_operated_by",
  "last_operated_at",
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
  "calculator_snapshot_json"
];

function getUkTodayInputValue(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDaysToDateInputValue(dateText, days) {
  const [year, month, day] = String(dateText || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

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

function getRuntimeEnvironmentInfo() {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const localSupabaseUrl = String(process.env.LOCAL_SUPABASE_URL || "").trim();
  let host = "";
  try {
    host = new URL(supabaseUrl).hostname.toLowerCase();
  } catch (error) {
    host = "";
  }

  const isLocal = Boolean(
    supabaseUrl &&
    (
      (localSupabaseUrl && supabaseUrl === localSupabaseUrl) ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1"
    )
  );

  if (isLocal) {
    return {
      mode: "local_test",
      label: "LOCAL TEST MODE - 本地测试库，非真实订单",
      is_local_test: true,
      is_production: false
    };
  }

  return {
    mode: "production",
    label: "PRODUCTION",
    is_local_test: false,
    is_production: true
  };
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

function formatAdminCsvDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year && values.month && values.day && values.hour && values.minute
    ? `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`
    : "";
}

function formatAdminCsvExcelText(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return text ? `="${text}"` : "";
}

function getStorageExportServiceLabel(item = {}) {
  if (item.service_type_label) {
    return item.service_type_label;
  }
  if (item.storage_order_kind) {
    return storageOrderKindLabel(item.storage_order_kind);
  }
  const orderType = String(item.order_type || "").trim();
  if (orderType === "box_delivery") {
    return "买箱订单";
  }
  if (orderType === "storage_collection") {
    return "取寄存订单";
  }
  if (orderType === "storage_return") {
    return "送寄存订单";
  }
  return item.service_label || orderType || "寄存订单";
}

function storageExportPurchaseQuantity(item = {}) {
  const boxes = Array.isArray(item.purchased_boxes) ? item.purchased_boxes : [];
  const total = boxes.reduce((sum, entry) => {
    const quantity = Number(entry?.quantity || entry?.purchaseQty || entry?.purchase_quantity || 0);
    return sum + (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);
  }, 0);
  if (total > 0) {
    return total;
  }
  const serviceDetails = getStorageServiceDetailsFromJson(isPlainObject(item.customer_form_json) ? item.customer_form_json : {});
  const estimateSummary = isPlainObject(item.estimate_summary_json) ? item.estimate_summary_json : {};
  const fallback = Number(serviceDetails.purchaseQuantity || estimateSummary.totalPurchaseBoxes || 0);
  return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
}

function formatAdminCsvMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `£${Math.max(0, number).toFixed(2)}` : "";
}

function escapeExcelHtml(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeExcelCellText(value) {
  const text = value === null || value === undefined ? "" : String(value);
  const formulaTextMatch = text.match(/^="([\s\S]*)"$/);
  return formulaTextMatch ? formulaTextMatch[1] : text;
}

function rowsToExcelHtml(rows, columns) {
  const header = columns
    .map(column => `<th>${escapeExcelHtml(column)}</th>`)
    .join("");
  const body = rows
    .map(row => {
      const rowClass = row.__highlight ? ' class="member-row"' : "";
      const cells = columns
        .map(column => `<td>${escapeExcelHtml(normalizeExcelCellText(row[column]))}</td>`)
        .join("");
      return `<tr${rowClass}>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
    th { background: #f3f4f6; font-weight: 700; }
    th, td { border: 1px solid #d9dde5; padding: 6px 8px; mso-number-format: "\\@"; vertical-align: top; }
    tr.member-row td { background: #fff7d6; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

function buildStorageExportRows(items = []) {
  return items.map(item => {
    const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
    const serviceDetails = getStorageServiceDetailsFromJson(formJson);
    const address = firstNonEmptyText(
      item.address_full,
      serviceDetails.collectionAddress,
      serviceDetails.serviceAddress,
      serviceDetails.returnAddress,
      serviceDetails.addressFull,
      serviceDetails.address_full
    );
    return {
      __highlight: Boolean(item.membership_benefit_claim_id),
      "提交时间": formatAdminCsvExcelText(formatAdminCsvDateTime(item.created_at)),
      "订单编号": item.order_no || "",
      "主订单编号": item.parent_order_no || "",
      "买箱编号": item.box_order_no || "",
      "服务类型": getStorageExportServiceLabel(item),
      "姓名": item.customer_name || "",
      "微信": item.wechat_id || "",
      "电话": formatAdminCsvExcelText(item.phone || ""),
      "服务日期": formatAdminCsvExcelText(item.service_date || ""),
      "时间段": item.service_time_slot || item.service_time || "",
      "购买箱子纸皮数量": storageExportPurchaseQuantity(item) || "",
      "送箱日期": formatAdminCsvExcelText(item.box_delivery_date || ""),
      "寄存开始日期": formatAdminCsvExcelText(item.storage_start_date || item.storage_intake_date || ""),
      "寄存结束日期": formatAdminCsvExcelText(item.storage_end_date || item.expected_storage_end_date || ""),
      "地址": address || "",
      "房间 / 公寓": item.room_or_building || "",
      "邮编": item.postcode || "",
      "预期价格": formatAdminCsvMoney(item.estimated_total_price),
      "会员减免": formatAdminCsvMoney(item.membership_discount_amount),
      "会员不减免费用": formatAdminCsvMoney(item.extra_charge_amount),
      "最终价格": formatAdminCsvMoney(item.final_price),
      "状态": item.status || ""
    };
  });
}

function buildStorageExportColumns(orderType) {
  const normalizedOrderType = String(orderType || "").trim();
  const baseColumns = [
    "提交时间",
    "订单编号",
    "服务类型",
    "姓名",
    "微信",
    "电话",
    "服务日期",
    "时间段",
    "购买箱子纸皮数量",
    "送箱日期",
    "寄存开始日期",
    "寄存结束日期",
    "地址",
    "邮编",
    "预期价格"
  ];

  if (normalizedOrderType === "storage_collection" || normalizedOrderType === "storage_return") {
    return baseColumns;
  }

  return [
    "提交时间",
    "订单编号",
    "主订单编号",
    "买箱编号",
    "服务类型",
    "姓名",
    "微信",
    "电话",
    "服务日期",
    "时间段",
    "购买箱子纸皮数量",
    "送箱日期",
    "寄存开始日期",
    "寄存结束日期",
    "地址",
    "房间 / 公寓",
    "邮编",
    "预期价格",
    "会员减免",
    "额外加收",
    "最终价格",
    "状态"
  ];
}

function buildStorageExportRows(items = []) {
  return items.map(item => {
    const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
    const serviceDetails = getStorageServiceDetailsFromJson(formJson);
    const address = firstNonEmptyText(
      item.address_full,
      serviceDetails.collectionAddress,
      serviceDetails.serviceAddress,
      serviceDetails.returnAddress,
      serviceDetails.addressFull,
      serviceDetails.address_full
    );
    return {
      __highlight: Boolean(item.membership_benefit_claim_id),
      "提交时间": formatAdminCsvExcelText(formatAdminCsvDateTime(item.created_at)),
      "订单编号": item.display_order_no || item.order_no || "",
      "主订单编号": item.parent_order_no || "",
      "买箱编号": item.box_order_no || "",
      "服务类型": getStorageExportServiceLabel(item),
      "姓名": item.customer_name || "",
      "微信": item.wechat_id || "",
      "电话": formatAdminCsvExcelText(item.phone || ""),
      "邮箱": item.student_email || item.linked_user_email || "",
      "User ID": item.public_user_id || item.site_user_id || "",
      "服务日期": formatAdminCsvExcelText(item.service_date_unified || item.service_date || ""),
      "时间段": item.service_time_slot_unified || item.service_time_slot || item.service_time || "",
      "箱子摘要": storageExportPurchaseQuantity(item) || "",
      "送箱日期": formatAdminCsvExcelText(item.box_delivery_date || ""),
      "寄存开始日期": formatAdminCsvExcelText(item.storage_start_date || item.storage_intake_date || ""),
      "寄存结束日期": formatAdminCsvExcelText(item.storage_end_date || item.expected_storage_end_date || ""),
      "地址": address || "",
      "房间 / 公寓": item.room_or_building || "",
      "邮编": item.postcode || "",
      "总费用": formatAdminCsvMoney(item.final_price ?? item.estimated_total_price),
      "会员减免": formatAdminCsvMoney(item.membership_discount_amount),
      "会员不减免费用": formatAdminCsvMoney(item.extra_charge_amount),
      "订单状态": item.status || "",
      "线下记录": item.offline_recorded ? "已记录" : "未记录",
      "上次操作人": item.last_operated_by || "",
      "上次操作时间": formatAdminCsvExcelText(formatAdminCsvDateTime(item.last_operated_at))
    };
  });
}

function buildStorageExportColumns(orderType) {
  const normalizedOrderType = String(orderType || "").trim();
  const commonColumns = [
    "提交时间",
    "订单编号",
    "服务类型",
    "姓名",
    "微信",
    "电话",
    "邮箱",
    "User ID",
    "服务日期",
    "时间段",
    "地址",
    "房间 / 公寓",
    "邮编",
    "总费用",
    "订单状态",
    "线下记录",
    "上次操作人",
    "上次操作时间"
  ];
  if (normalizedOrderType === "all") {
    return [
      ...commonColumns.slice(0, 10),
      "箱子摘要",
      ...commonColumns.slice(10)
    ];
  }
  if (normalizedOrderType === "box_order") {
    return [
      "提交时间",
      "订单编号",
      "主订单编号",
      "买箱编号",
      "服务类型",
      "姓名",
      "微信",
      "电话",
      "邮箱",
      "User ID",
      "服务日期",
      "时间段",
      "箱子摘要",
      "送箱日期",
      "地址",
      "房间 / 公寓",
      "邮编",
      "总费用",
      "订单状态",
      "线下记录",
      "上次操作人",
      "上次操作时间"
    ];
  }
  return commonColumns;
}

function buildStorageExportFilename(queryParams = {}) {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0")
  ].join("");
  const orderType = String(queryParams.order_type || "storage").replace(/[^a-z0-9_-]+/gi, "");
  return `storage-orders-${orderType || "all"}-${stamp}.xls`;
}

function normalizeStorageExportAddressKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[,\s]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .trim();
}

function splitStorageExportAddress(value) {
  return String(value || "")
    .split("/")
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function buildStorageExportAddress(item = {}) {
  const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
  const serviceDetails = getStorageServiceDetailsFromJson(formJson);
  const address = firstNonEmptyText(
    item.address_full,
    serviceDetails.collectionAddress,
    serviceDetails.serviceAddress,
    serviceDetails.returnAddress,
    serviceDetails.addressFull,
    serviceDetails.address_full
  );
  const parts = [];
  const pushPart = value => {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const key = normalizeStorageExportAddressKey(text);
    if (!parts.some(part => normalizeStorageExportAddressKey(part) === key)) {
      parts.push(text);
    }
  };

  splitStorageExportAddress(address).forEach(pushPart);
  const addressBlob = normalizeStorageExportAddressKey(parts.join(" "));
  splitStorageExportAddress(item.room_or_building).forEach(part => {
    if (!addressBlob.includes(normalizeStorageExportAddressKey(part))) pushPart(part);
  });
  splitStorageExportAddress(item.postcode).forEach(part => {
    if (!addressBlob.includes(normalizeStorageExportAddressKey(part))) pushPart(part);
  });
  return parts.join(" / ");
}

function storageExportPositiveQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function storageExportBoxLabel(entry = {}) {
  const raw = entry.label || entry.boxLabel || entry.box_label || entry.boxType || entry.box_type || entry.type;
  const text = String(raw || "").trim();
  if (!text) return "箱型";
  return /^\d+$/.test(text) ? `${text}号箱` : text;
}

function storageExportBoxQuantity(entry = {}) {
  return storageExportPositiveQuantity(
    entry.quantity ?? entry.purchaseQty ?? entry.purchase_quantity ?? entry.purchaseQuantity ?? entry.count ?? entry.qty
  );
}

function storageExportPurchasedBoxItems(item = {}) {
  const direct = Array.isArray(item.purchased_boxes) ? item.purchased_boxes : [];
  const summary = isPlainObject(item.estimate_summary_json) && Array.isArray(item.estimate_summary_json.items)
    ? item.estimate_summary_json.items
    : [];
  const source = direct.length ? direct : summary;
  return source
    .map(entry => isPlainObject(entry) ? entry : {})
    .map(entry => ({ label: storageExportBoxLabel(entry), quantity: storageExportBoxQuantity(entry) }))
    .filter(entry => entry.quantity > 0);
}

function storageExportBoxSummaryLines(item = {}) {
  const items = storageExportPurchasedBoxItems(item);
  if (items.length) {
    return items.map(entry => `${entry.label} × ${entry.quantity}`);
  }
  const fallback = storageExportPositiveQuantity(item.estimated_box_count);
  return fallback ? [`箱子 × ${fallback}`] : [];
}

function storageExportTotalAmount(item = {}) {
  const summary = isPlainObject(item.estimate_summary_json) ? item.estimate_summary_json : {};
  const amount = Number(item.final_price ?? item.estimated_total_price ?? summary.finalTotal ?? summary.grandTotal ?? summary.total ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function buildStorageExecutionServiceContent(item = {}) {
  const label = getStorageExportServiceLabel(item);
  const boxLines = storageExportBoxSummaryLines(item);
  const lines = [];
  if (boxLines.length) {
    lines.push(`${label}｜${boxLines.join("，")}`);
  } else if (item.storage_order_kind === "storage_return" && storageExportPositiveQuantity(item.estimated_box_count)) {
    lines.push(`送${storageExportPositiveQuantity(item.estimated_box_count)}个箱子`);
  } else if (item.storage_order_kind === "storage_collection") {
    lines.push("取件寄存");
  } else {
    lines.push(label);
  }
  return lines.filter(Boolean).join("\n");
}

function storageExportBillingInfo(item = {}) {
  const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
  const admin = isPlainObject(formJson.admin) ? formJson.admin : {};
  return {
    ...(isPlainObject(formJson.billing) ? formJson.billing : {}),
    ...(isPlainObject(admin.billing) ? admin.billing : {})
  };
}

function storageExportPaymentStatusLabel(status) {
  return {
    unpaid: "待付",
    pending: "待确认",
    paid: "已支付",
    refunded: "已退款",
    waived: "免费"
  }[String(status || "").trim()] || "";
}

function storageExportMembershipPaymentNote(item = {}) {
  return (Number(item.membership_discount_amount || 0) > 0 || item.membership_benefit_claim_id)
    ? "会员服务"
    : "";
}

function buildStorageExecutionPaymentNote(item = {}) {
  const billing = storageExportBillingInfo(item);
  const note = firstNonEmptyText(billing.payment_note, billing.note, billing.remark, billing.paymentRemark);
  const status = storageExportPaymentStatusLabel(billing.payment_status || billing.status);
  const membershipNote = storageExportMembershipPaymentNote(item);
  const lines = [];
  if (membershipNote) lines.push(membershipNote);
  if (status) lines.push(status);
  if (note && note !== status) lines.push(note);
  if (lines.length) return lines.join("｜");
  return storageExportTotalAmount(item) > 0 ? "寄存费用待付" : "免费";
}

function storagePaymentStatusValue(item = {}) {
  const billing = storageExportBillingInfo(item);
  return String(billing.payment_status || billing.status || "").trim();
}

function storageIsPaid(item = {}) {
  const status = storagePaymentStatusValue(item);
  if (status === "paid") return true;
  return storageExportTotalAmount(item) <= 0 && status === "waived";
}

function storageChargeStatusValue(item = {}) {
  return storageExportTotalAmount(item) > 0 ? "charged" : "free";
}

function applyStorageWorkbenchFilters(rows, queryParams = {}) {
  const chargeStatus = String(queryParams.charge_status || queryParams.chargeStatus || "").trim();
  const paymentStatus = String(queryParams.payment_status || queryParams.paymentStatus || "").trim();
  return rows.filter(row => {
    if (chargeStatus === "charged" && storageChargeStatusValue(row) !== "charged") return false;
    if ((chargeStatus === "free" || chargeStatus === "free_or_pending") && storageChargeStatusValue(row) !== "free") return false;
    if (paymentStatus === "paid" && !storageIsPaid(row)) return false;
    if (paymentStatus === "unpaid" && storageIsPaid(row)) return false;
    return true;
  });
}

function buildStorageWorkbenchStats(rows = []) {
  const today = getUkTodayInputValue();
  const nextSeven = addDaysToDateInputValue(today, 7);
  return rows.reduce((stats, item) => {
    const serviceDate = String(item.service_date_unified || item.service_date || "").slice(0, 10);
    stats.total += 1;
    if (item.offline_recorded) stats.offline_recorded += 1;
    else stats.offline_unrecorded += 1;
    if (!storageIsPaid(item)) stats.unpaid += 1;
    if (serviceDate && serviceDate >= today && serviceDate <= nextSeven) stats.next_7_days += 1;
    return stats;
  }, {
    total: 0,
    offline_recorded: 0,
    offline_unrecorded: 0,
    unpaid: 0,
    next_7_days: 0
  });
}

function buildStorageExecutionRemark(item = {}) {
  const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
  const admin = isPlainObject(formJson.admin) ? formJson.admin : {};
  const customerServiceRemark = firstNonEmptyText(admin.service_notes);
  const studentRemark = firstNonEmptyText(item.item_description, item.notes);
  const lines = [];
  if (customerServiceRemark) {
    lines.push(customerServiceRemark);
  }
  if (
    studentRemark
    && !customerServiceRemark.includes(studentRemark)
    && !customerServiceRemark.includes(`同学备注：${studentRemark}`)
  ) {
    lines.push(`同学备注：${studentRemark}`);
  }
  return lines.join("\n");
}

function buildStorageExportRows(items = []) {
  return items.map((item, index) => ({
    __highlight: Boolean(item.membership_benefit_claim_id),
    "序号": index + 1,
    "服务日期": formatAdminCsvExcelText(item.service_date_unified || item.service_date || ""),
    "名字": item.customer_name || "",
    "服务内容": buildStorageExecutionServiceContent(item),
    "公寓（详细地址）": buildStorageExportAddress(item),
    "时间段": item.service_time_slot_unified || item.service_time_slot || item.service_time || "--",
    "电话": formatAdminCsvExcelText(item.phone || ""),
    "价格": formatAdminCsvMoney(storageExportTotalAmount(item)),
    "费用/支付备注": buildStorageExecutionPaymentNote(item),
    "客服备注": buildStorageExecutionRemark(item)
  }));
}

function buildStorageExportColumns(orderType) {
  return [
    "序号",
    "服务日期",
    "名字",
    "服务内容",
    "公寓（详细地址）",
    "时间段",
    "电话",
    "价格",
    "费用/支付备注",
    "客服备注"
  ];
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

function resolveAdminDisplayName(adminUser = {}) {
  return String(adminUser.name || adminUser.username || adminUser.email || "admin").trim() || "admin";
}

function storageOfflineTrackingMigrationMessage() {
  return "线下记录字段还没有在数据库上线，请先执行 supabase/20260519_storage_order_offline_tracking.sql 后再进行标记操作。";
}

function isStorageOfflineTrackingColumn(column) {
  return ["offline_recorded", "last_operated_by", "last_operated_at"].includes(String(column || ""));
}

function normalizeStorageOrderKind(value) {
  const normalized = String(value || "").trim();
  if (["box_order", "storage_collection", "storage_return"].includes(normalized)) {
    return normalized;
  }
  if (normalized === "box_delivery") {
    return "box_order";
  }
  return "";
}

function storageOrderKindLabel(kind) {
  return {
    box_order: "买箱",
    storage_collection: "取寄存",
    storage_return: "送寄存"
  }[kind] || "寄存";
}

function storageOrderKindFromRecord(item = {}) {
  const explicit = normalizeStorageOrderKind(item.order_type);
  const orderNoText = String(item.storage_pickup_order_no || item.box_order_no || item.order_no || item.parent_order_no || "").toUpperCase();
  const labelText = String(item.service_label || "");
  if (explicit) return explicit;
  if (orderNoText.startsWith("ST-B")) return "box_order";
  if (orderNoText.startsWith("ST-P") || labelText.includes("取寄存") || labelText.includes("预约寄存")) return "storage_collection";
  if (orderNoText.startsWith("ST-S") || orderNoText.startsWith("ST-R") || labelText.includes("送寄存") || labelText.includes("取回")) return "storage_return";
  return "storage_collection";
}

function storageOrderDisplayNo(item = {}, kind = storageOrderKindFromRecord(item)) {
  if (kind === "box_order") {
    return firstNonEmptyText(item.box_order_no, item.order_no, item.parent_order_no);
  }
  if (kind === "storage_collection") {
    return firstNonEmptyText(item.storage_pickup_order_no, item.order_no, item.parent_order_no);
  }
  if (kind === "storage_return") {
    return firstNonEmptyText(item.storage_return_order_no, item.order_no, item.related_order_no, item.parent_order_no);
  }
  return firstNonEmptyText(item.order_no, item.storage_pickup_order_no, item.box_order_no, item.parent_order_no);
}

function storageOrderServiceDate(item = {}, kind = storageOrderKindFromRecord(item)) {
  if (kind === "box_order") {
    return firstNonEmptyText(item.box_delivery_date, item.service_date);
  }
  if (kind === "storage_return") {
    return firstNonEmptyText(item.storage_end_date, item.expected_storage_end_date, item.service_date);
  }
  return firstNonEmptyText(item.storage_start_date, item.storage_intake_date, item.service_date);
}

function storageOrderTimeSlot(item = {}, kind = storageOrderKindFromRecord(item)) {
  if (kind === "box_order") {
    return firstNonEmptyText(item.box_delivery_time_slot, item.service_time_slot, item.service_time);
  }
  return firstNonEmptyText(item.service_time_slot, item.service_time);
}

function hasStoragePurchasedBoxes(item = {}) {
  const boxes = Array.isArray(item.purchased_boxes) ? item.purchased_boxes : [];
  if (boxes.some(entry => Number(entry?.quantity || entry?.purchaseQty || entry?.purchase_quantity || 0) > 0)) {
    return true;
  }
  const summaryItems = Array.isArray(item.estimate_summary_json?.items) ? item.estimate_summary_json.items : [];
  return summaryItems.some(entry => Number(entry?.purchaseQty || entry?.purchase_quantity || entry?.purchaseQuantity || 0) > 0);
}

function expandStorageOrderForAdmin(item = {}) {
  const rows = [];
  const baseKind = storageOrderKindFromRecord(item);
  const addKind = kind => {
    const normalizedKind = normalizeStorageOrderKind(kind);
    if (!normalizedKind || rows.some(row => row.storage_order_kind === normalizedKind)) {
      return;
    }
    rows.push({
      ...item,
      id: `${item.id}:${normalizedKind}`,
      storage_order_id: item.id,
      storage_order_kind: normalizedKind,
      display_order_no: storageOrderDisplayNo(item, normalizedKind),
      service_type_label: storageOrderKindLabel(normalizedKind),
      service_date_unified: storageOrderServiceDate(item, normalizedKind),
      service_time_slot_unified: storageOrderTimeSlot(item, normalizedKind)
    });
  };

  if (item.box_order_no || baseKind === "box_order" || hasStoragePurchasedBoxes(item)) {
    addKind("box_order");
  }
  if (baseKind === "storage_collection" || item.storage_pickup_order_no) {
    addKind("storage_collection");
  }
  if (baseKind === "storage_return") {
    addKind("storage_return");
  }
  if (!rows.length) {
    addKind(baseKind || "storage_collection");
  }
  return rows;
}

function filterExpandedStorageRows(rows, queryParams = {}) {
  const serviceType = normalizeStorageOrderKind(queryParams.service_type || queryParams.order_type_filter || queryParams.storage_order_kind);
  const dateScope = String(queryParams.date_scope || queryParams.date_status || "active").trim();
  const dateStart = String(queryParams.date_start || queryParams.start_date || "").trim();
  const dateEnd = String(queryParams.date_end || queryParams.end_date || "").trim();
  const today = getUkTodayInputValue();
  return rows.filter(row => {
    if (serviceType && row.storage_order_kind !== serviceType) {
      return false;
    }
    const serviceDate = String(row.service_date_unified || "").slice(0, 10);
    if (dateScope === "active" && (!serviceDate || serviceDate < today)) {
      return false;
    }
    if ((dateScope === "expired" || dateScope === "invalid") && (!serviceDate || serviceDate >= today)) {
      return false;
    }
    if (dateStart && (!serviceDate || serviceDate < dateStart)) {
      return false;
    }
    if (dateEnd && (!serviceDate || serviceDate > dateEnd)) {
      return false;
    }
    return true;
  });
}

function sortStorageAdminRows(rows, sortValue) {
  const sort = String(sortValue || "submitted_latest").trim();
  const direction = sort.endsWith("_oldest") || sort.endsWith("_low") || sort === "service_date_nearest" ? 1 : -1;
  const valueFor = row => {
    if (sort.startsWith("service_date")) return row.service_date_unified || "";
    if (sort.startsWith("total")) return Number(row.final_price ?? row.estimated_total_price ?? 0) || 0;
    return row.created_at || "";
  };
  return [...rows].sort((a, b) => {
    const left = valueFor(a);
    const right = valueFor(b);
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

function parseStorageBaseIds(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(raw
    .map(item => String(item || "").split(":")[0].trim())
    .filter(Boolean)));
}

function parseStorageExpandedRowIds(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(",");
  return new Set(raw
    .map(item => String(item || "").trim())
    .filter(Boolean));
}

function applyStorageOperationalFilters(query, queryParams = {}, supportedColumns = null) {
  const hasColumn = column => !supportedColumns || supportedColumns.has(column);
  if (queryParams.offline_recorded === "true" && hasColumn("offline_recorded")) {
    query.eq("offline_recorded", true);
  } else if (queryParams.offline_recorded === "false" && hasColumn("offline_recorded")) {
    query.eq("offline_recorded", false);
  }
  const lastOperatedBy = String(queryParams.last_operated_by || "").trim();
  if (lastOperatedBy && hasColumn("last_operated_by")) {
    query.eq("last_operated_by", lastOperatedBy);
  }
}

async function listStorageOperatorOptions(supabase) {
  const { data, error } = await supabase
    .from("storage_orders")
    .select("last_operated_by, last_operated_at")
    .not("last_operated_by", "is", null)
    .order("last_operated_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    const missingColumn = extractMissingColumnName(error, "storage_orders");
    if (missingColumn === "last_operated_by" || missingColumn === "last_operated_at") {
      return [];
    }
    throw error;
  }
  return Array.from(new Set((data || [])
    .map(item => String(item.last_operated_by || "").trim())
    .filter(Boolean)));
}

async function fetchStorageOperationLogs(supabase, storageOrderId) {
  if (!storageOrderId) return [];
  const { data, error } = await supabase
    .from("admin_operation_logs")
    .select("id, action, before_data, after_data, metadata, created_at, admin_user_id, admin_user:admin_users(id, name, username, email)")
    .eq("target_type", "storage_order")
    .eq("target_id", storageOrderId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("[admin-storage] failed to fetch operation logs", error);
    return [];
  }
  return data || [];
}

function storageOrderNoCandidates(item = {}) {
  const formJson = isPlainObject(item.customer_form_json) ? item.customer_form_json : {};
  const serviceDetails = isPlainObject(formJson.serviceDetails)
    ? formJson.serviceDetails
    : (isPlainObject(formJson.service_details) ? formJson.service_details : {});
  const rawCandidates = [
    item.storage_pickup_order_no,
    item.related_order_no,
    item.parent_order_no,
    item.box_order_no,
    item.order_no,
    formJson.storagePickupOrderNo,
    formJson.storage_pickup_order_no,
    serviceDetails.storagePickupOrderNo,
    serviceDetails.storage_pickup_order_no
  ]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  const derivedPickupCandidates = rawCandidates
    .filter(value => /ST-B-?/i.test(value))
    .map(value => value.replace(/^(.*ST-)B(-?.*)$/i, "$1P$2"));
  return [...rawCandidates, ...derivedPickupCandidates]
    .filter(value => /^.*ST-[PSR]/i.test(value));
}

async function fetchRelatedStorageOrderForBoxOrder(supabase, item = {}) {
  const candidates = Array.from(new Set(storageOrderNoCandidates(item)));
  if (!candidates.length) return null;
  let selectedColumns = cachedStorageOrderDetailColumns || [...STORAGE_ORDER_DETAIL_COLUMNS];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const query = supabase
      .from("storage_orders")
      .select(selectedColumns.join(", "))
      .neq("id", item.id)
      .or(candidates.map(value => [
        `order_no.eq.${value}`,
        `storage_pickup_order_no.eq.${value}`,
        `box_order_no.eq.${value}`,
        `related_order_no.eq.${value}`,
        `parent_order_no.eq.${value}`
      ].join(",")).join(","))
      .limit(1);
    const { data, error } = await query;
    if (!error) {
      cachedStorageOrderDetailColumns = [...selectedColumns];
      return Array.isArray(data) && data.length ? data[0] : null;
    }
    const missingColumn = extractMissingColumnName(error, "storage_orders");
    if (!missingColumn || !selectedColumns.includes(missingColumn)) {
      throw error;
    }
    selectedColumns = selectedColumns.filter(column => column !== missingColumn);
    cachedStorageOrderDetailColumns = [...selectedColumns];
  }
  return null;
}

async function querySiteUsersWithFallback(supabase, { search = "", ids = [] } = {}) {
  let selectedColumns = ["id", "public_user_id", "email", "phone", "nickname", "wechat_id", "created_at"];
  let searchColumns = ["public_user_id", "email", "phone", "nickname", "wechat_id"];
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
  ok(res, {
    ...session,
    runtime_environment: getRuntimeEnvironmentInfo()
  });
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

async function safeDashboardQuery(buildQuery) {
  try {
    const result = await buildQuery();
    if (result?.error) {
      console.warn("[dashboard] optional query failed", result.error.message || result.error);
      return { data: [], count: 0, error: result.error, unavailable: true };
    }
    return {
      data: Array.isArray(result?.data) ? result.data : [],
      count: typeof result?.count === "number" ? result.count : (Array.isArray(result?.data) ? result.data.length : 0),
      error: null,
      unavailable: false
    };
  } catch (error) {
    console.warn("[dashboard] optional query threw", error.message || error);
    return { data: [], count: 0, error, unavailable: true };
  }
}

function dashboardCount(result) {
  return Number.isFinite(Number(result?.count)) ? Number(result.count) : 0;
}

function dashboardRows(result) {
  return Array.isArray(result?.data) ? result.data : [];
}

function formatDashboardDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getDashboardDayLabel(dateKey) {
  const [, month, day] = String(dateKey || "").split("-");
  return month && day ? `${month}/${day}` : dateKey;
}

function incrementTrendBucket(buckets, dateKey, field) {
  const bucket = buckets.get(dateKey);
  if (!bucket) {
    return;
  }
  bucket[field] += 1;
  bucket.total += 1;
}

function buildDashboardTrends(dateKeys, transportRows = [], storageRows = []) {
  const buckets = new Map(dateKeys.map(dateKey => [dateKey, {
    date: dateKey,
    label: getDashboardDayLabel(dateKey),
    transport: 0,
    storage: 0,
    box: 0,
    total: 0
  }]));

  transportRows.forEach(row => {
    if (!row.created_at) {
      return;
    }
    incrementTrendBucket(buckets, formatDashboardDateKey(new Date(row.created_at)), "transport");
  });

  storageRows.forEach(row => {
    if (!row.created_at) {
      return;
    }
    const field = String(row.order_type || "").trim() === "box_order" ? "box" : "storage";
    incrementTrendBucket(buckets, formatDashboardDateKey(new Date(row.created_at)), field);
  });

  return Array.from(buckets.values());
}

function getTransportServiceLabel(serviceType) {
  const value = String(serviceType || "").trim();
  if (value === "airport_dropoff") return "今日送机";
  if (value === "carpool") return "今日拼车";
  return "今日接机";
}

function getStorageOrderTypeLabel(orderType) {
  const value = String(orderType || "").trim();
  if (value === "box_order") return "今日送箱";
  if (value === "storage_return") return "今日送寄存";
  return "今日取寄存";
}

function getStorageDashboardOrderNo(item = {}) {
  return item.box_order_no || item.storage_pickup_order_no || item.order_no || "";
}

function getStorageDashboardHref(item = {}) {
  const orderType = String(item.order_type || "").trim();
  const route = orderType === "box_order" ? "box-orders" : "storage-orders";
  return `/admin/storage/${route}/${encodeURIComponent(item.id)}`;
}

function getDashboardOperationType(action) {
  const value = String(action || "").trim();
  const labels = {
    order_status_updated: "订单状态更新",
    order_contact_updated: "联系方式更新",
    order_archived: "订单状态维护",
    order_unarchived: "订单状态维护",
    orders_bulk_archived: "订单批量维护",
    storage_order_updated: "寄存订单更新",
    storage_order_deleted: "寄存订单删除",
    storage_orders_marked_offline_recorded: "寄存线下记录标记",
    storage_orders_unmarked_offline_recorded: "寄存线下记录取消",
    transport_request_updated: "接送机订单更新",
    transport_request_deleted: "接送机订单删除",
    transport_group_members_replaced: "拼车成员调整",
    membership_claim_order_unbound: "会员订单解绑"
  };
  return labels[value] || value || "后台操作";
}

function getDashboardTargetLabel(row = {}, orderNo = "") {
  const targetType = String(row.target_type || "").trim();
  if (targetType === "transport_request") return "接送机订单";
  if (targetType === "transport_group") return "拼车组";
  if (targetType === "storage_order" || targetType === "storage_orders") return "寄存订单";
  if (targetType === "membership_claim") return "会员权益";
  if (targetType === "order") return orderNo ? "订单中心" : "订单";
  return targetType || "后台记录";
}

async function enrichDashboardOperations(supabase, rows = []) {
  if (!rows.length) {
    return [];
  }

  const orderIds = Array.from(new Set(rows.map(row => row.order_id).filter(Boolean)));
  const transportIds = Array.from(new Set(rows
    .filter(row => String(row.target_type || "") === "transport_request" && row.target_id)
    .map(row => row.target_id)));
  const storageIds = Array.from(new Set(rows
    .filter(row => ["storage_order", "storage_orders"].includes(String(row.target_type || "")) && row.target_id)
    .map(row => row.target_id)));

  const [ordersResult, transportResult, storageResult] = await Promise.all([
    orderIds.length
      ? safeDashboardQuery(() => supabase.from("orders").select("id, order_no").in("id", orderIds))
      : Promise.resolve({ data: [] }),
    transportIds.length
      ? safeDashboardQuery(() => supabase.from("transport_requests").select("id, order_no").in("id", transportIds))
      : Promise.resolve({ data: [] }),
    storageIds.length
      ? safeDashboardQuery(() => supabase.from("storage_orders").select("id, order_no, box_order_no, storage_pickup_order_no").in("id", storageIds))
      : Promise.resolve({ data: [] })
  ]);

  const orderNoByOrderId = new Map(dashboardRows(ordersResult).map(item => [String(item.id), item.order_no || ""]));
  const transportNoById = new Map(dashboardRows(transportResult).map(item => [String(item.id), item.order_no || ""]));
  const storageNoById = new Map(dashboardRows(storageResult).map(item => [
    String(item.id),
    item.box_order_no || item.storage_pickup_order_no || item.order_no || ""
  ]));

  return rows.map(row => {
    const admin = row.admin_user || {};
    const targetId = String(row.target_id || "");
    const targetType = String(row.target_type || "");
    const orderNo = orderNoByOrderId.get(String(row.order_id || ""))
      || (targetType === "transport_request" ? transportNoById.get(targetId) : "")
      || (["storage_order", "storage_orders"].includes(targetType) ? storageNoById.get(targetId) : "")
      || "";
    return {
      id: row.id,
      time: row.created_at || null,
      operator: admin.name || admin.username || admin.email || "未知管理员",
      target: getDashboardTargetLabel(row, orderNo),
      action: getDashboardOperationType(row.action),
      order_no: orderNo,
      target_id: row.target_id || null,
      target_type: row.target_type || ""
    };
  });
}

function normalizeDashboardRisk(value) {
  const risk = String(value || "").trim();
  return Object.prototype.hasOwnProperty.call(DASHBOARD_RISK_LABELS, risk) ? risk : "";
}

function getDashboardRiskHref(risk) {
  return `/admin/orders?risk=${encodeURIComponent(risk)}`;
}

function buildRiskFallbackOrderFromTransport(item = {}) {
  return {
    id: `transport:${item.id}`,
    source_table: "transport_requests",
    source_id: item.id,
    order_no: item.order_no || "",
    service_type: item.service_type || "pickup",
    customer_name: item.student_name || "",
    phone: item.phone || "",
    wechat_or_whatsapp: item.wechat || "",
    status: item.status || "",
    flight_no: item.flight_no || "",
    pickup_date: item.flight_datetime || "",
    storage_start_date: null,
    storage_end_date: null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || item.last_operated_at || item.created_at || null,
    offline_recorded: item.offline_recorded ?? null,
    last_operated_by: item.last_operated_by || null,
    last_operated_at: item.last_operated_at || null,
    source_detail_href: `/admin/transport/requests/${encodeURIComponent(item.id)}`,
    order_detail_available: false
  };
}

function buildRiskFallbackOrderFromStorage(item = {}) {
  const kind = storageOrderKindFromRecord(item);
  return {
    id: `storage:${item.id}`,
    source_table: "storage_orders",
    source_id: item.id,
    order_no: getStorageDashboardOrderNo(item),
    service_type: "storage",
    customer_name: item.customer_name || "",
    phone: item.phone || "",
    wechat_or_whatsapp: item.wechat_id || "",
    status: item.status || "",
    flight_no: "",
    pickup_date: null,
    storage_start_date: item.storage_start_date || item.service_date || item.box_delivery_date || null,
    storage_end_date: item.storage_end_date || item.expected_storage_end_date || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || item.last_operated_at || item.created_at || null,
    offline_recorded: item.offline_recorded ?? null,
    last_operated_by: item.last_operated_by || null,
    last_operated_at: item.last_operated_at || null,
    source_detail_href: getStorageDashboardHref({ ...item, order_type: kind }),
    order_detail_available: false
  };
}

function mergeOrderWithSourceRiskFields(order = {}, source = {}) {
  return {
    ...order,
    offline_recorded: source.offline_recorded ?? order.offline_recorded ?? null,
    last_operated_by: source.last_operated_by || order.last_operated_by || null,
    last_operated_at: source.last_operated_at || order.last_operated_at || null,
    source_detail_href: order.source_table === "transport_requests"
      ? `/admin/transport/requests/${encodeURIComponent(order.source_id)}`
      : getStorageDashboardHref({ ...source, id: order.source_id }),
    order_detail_available: true
  };
}

async function fetchDashboardRiskSources(supabase, risk, options = {}) {
  const normalizedRisk = normalizeDashboardRisk(risk);
  if (!normalizedRisk) {
    return { risk: "", label: "", helper: "", transport: [], storage: [], total: 0 };
  }

  const cutoff = options.cutoff || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(Math.max(Number(options.limit || 5000), 1), 10000);
  const transportSelect = "id, order_no, student_name, phone, wechat, service_type, flight_no, flight_datetime, status, created_at, updated_at, offline_recorded, last_operated_by, last_operated_at";
  const storageSelect = "id, order_no, box_order_no, storage_pickup_order_no, order_type, customer_name, phone, wechat_id, service_date, box_delivery_date, storage_start_date, storage_end_date, expected_storage_end_date, status, created_at, updated_at, offline_recorded, last_operated_by, last_operated_at";
  let transportQuery = supabase.from("transport_requests").select(transportSelect).limit(limit);
  let storageQuery = supabase.from("storage_orders").select(storageSelect).limit(limit);

  if (normalizedRisk === "overdue_unprocessed") {
    transportQuery = transportQuery.in("status", ["published", "matched"]).eq("offline_recorded", false).lt("created_at", cutoff).order("created_at", { ascending: true });
    storageQuery = storageQuery.in("status", ["pending_confirmation", "confirmed"]).eq("offline_recorded", false).lt("created_at", cutoff).order("created_at", { ascending: true });
  } else if (normalizedRisk === "no_operator") {
    transportQuery = transportQuery.in("status", ["published", "matched"]).is("last_operated_by", null).order("created_at", { ascending: false });
    storageQuery = storageQuery.in("status", ["pending_confirmation", "confirmed"]).is("last_operated_by", null).order("created_at", { ascending: false });
  } else if (normalizedRisk === "offline_unrecorded") {
    transportQuery = transportQuery.in("status", ["published", "matched"]).eq("offline_recorded", false).order("created_at", { ascending: false });
    storageQuery = storageQuery.in("status", ["pending_confirmation", "confirmed"]).eq("offline_recorded", false).order("created_at", { ascending: false });
  } else if (normalizedRisk === "missing_fields") {
    transportQuery = transportQuery.or("student_name.is.null,phone.is.null,wechat.is.null,flight_datetime.is.null").order("created_at", { ascending: false });
    storageQuery = storageQuery.or("customer_name.is.null,phone.is.null,wechat_id.is.null,service_date.is.null").order("created_at", { ascending: false });
  }

  const [transportResult, storageResult] = await Promise.all([
    safeDashboardQuery(() => transportQuery),
    safeDashboardQuery(() => storageQuery)
  ]);
  const transport = dashboardRows(transportResult);
  const storage = dashboardRows(storageResult);

  return {
    risk: normalizedRisk,
    label: DASHBOARD_RISK_LABELS[normalizedRisk],
    helper: DASHBOARD_RISK_HELPERS[normalizedRisk],
    transport,
    storage,
    total: transport.length + storage.length
  };
}

async function buildRiskOrderRows(supabase, riskSources) {
  const transportById = new Map((riskSources.transport || []).map(item => [String(item.id), item]));
  const storageById = new Map((riskSources.storage || []).map(item => [String(item.id), item]));
  const transportIds = Array.from(transportById.keys());
  const storageIds = Array.from(storageById.keys());

  const [transportOrdersResult, storageOrdersResult] = await Promise.all([
    transportIds.length
      ? safeDashboardQuery(() => supabase.from("orders").select(ORDER_LIST_COLUMNS).eq("source_table", "transport_requests").in("source_id", transportIds))
      : Promise.resolve({ data: [] }),
    storageIds.length
      ? safeDashboardQuery(() => supabase.from("orders").select(ORDER_LIST_COLUMNS).eq("source_table", "storage_orders").in("source_id", storageIds))
      : Promise.resolve({ data: [] })
  ]);

  const rows = [];
  const usedTransportIds = new Set();
  const usedStorageIds = new Set();

  dashboardRows(transportOrdersResult).forEach(order => {
    const source = transportById.get(String(order.source_id));
    if (!source) return;
    usedTransportIds.add(String(order.source_id));
    rows.push(mergeOrderWithSourceRiskFields(order, source));
  });
  dashboardRows(storageOrdersResult).forEach(order => {
    const source = storageById.get(String(order.source_id));
    if (!source) return;
    usedStorageIds.add(String(order.source_id));
    rows.push(mergeOrderWithSourceRiskFields(order, source));
  });

  (riskSources.transport || []).forEach(item => {
    if (!usedTransportIds.has(String(item.id))) {
      rows.push(buildRiskFallbackOrderFromTransport(item));
    }
  });
  (riskSources.storage || []).forEach(item => {
    if (!usedStorageIds.has(String(item.id))) {
      rows.push(buildRiskFallbackOrderFromStorage(item));
    }
  });

  return rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

function filterDashboardRiskOrderRows(rows = [], queryParams = {}) {
  const sourceTable = String(queryParams.source_table || "").trim();
  const serviceType = String(queryParams.service_type || "").trim();
  const status = String(queryParams.status || "").trim();
  const offlineRecorded = normalizeOfflineRecordedFilter(queryParams.offline_recorded);
  const orderNo = String(queryParams.order_no || "").trim().toLowerCase();
  const customerName = String(queryParams.customer_name || "").trim().toLowerCase();
  const phone = String(queryParams.phone || "").trim();
  const createdFrom = String(queryParams.created_from || queryParams.date_from || "").trim();
  const createdTo = String(queryParams.created_to || queryParams.date_to || "").trim();
  const sort = String(queryParams.sort || "latest").trim();

  return rows
    .filter(row => {
      if (sourceTable && row.source_table !== sourceTable) return false;
      if (serviceType && row.service_type !== serviceType) return false;
      if (status && row.status !== status) return false;
      if (offlineRecorded !== null && Boolean(row.offline_recorded) !== offlineRecorded) return false;
      if (orderNo && !String(row.order_no || "").toLowerCase().includes(orderNo)) return false;
      if (customerName && !String(row.customer_name || "").toLowerCase().includes(customerName)) return false;
      if (phone && !String(row.phone || "").includes(phone)) return false;
      if (createdFrom && String(row.created_at || "") < `${createdFrom}T00:00:00.000Z`) return false;
      if (createdTo && String(row.created_at || "") > `${createdTo}T23:59:59.999Z`) return false;
      return true;
    })
    .sort((a, b) => {
      const left = new Date(a.created_at || 0).getTime();
      const right = new Date(b.created_at || 0).getTime();
      return sort === "oldest" ? left - right : right - left;
    });
}

function normalizeOfflineRecordedFilter(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "registered", "yes"].includes(normalized)) return true;
  if (["false", "0", "unregistered", "no"].includes(normalized)) return false;
  return null;
}

async function fetchDashboardRegistrationSources(supabase, offlineRecorded) {
  const transportSelect = "id, order_no, student_name, phone, wechat, service_type, flight_no, flight_datetime, status, created_at, updated_at, offline_recorded, last_operated_by, last_operated_at";
  const storageSelect = "id, order_no, box_order_no, storage_pickup_order_no, order_type, customer_name, phone, wechat_id, service_date, box_delivery_date, storage_start_date, storage_end_date, expected_storage_end_date, status, created_at, updated_at, offline_recorded, last_operated_by, last_operated_at";
  const [transportResult, storageResult] = await Promise.all([
    safeDashboardQuery(() => supabase
      .from("transport_requests")
      .select(transportSelect)
      .eq("offline_recorded", offlineRecorded)
      .in("status", ["published", "matched"])
      .order("created_at", { ascending: false })
      .limit(10000)),
    safeDashboardQuery(() => supabase
      .from("storage_orders")
      .select(storageSelect)
      .eq("offline_recorded", offlineRecorded)
      .in("status", ["pending_confirmation", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(10000))
  ]);
  return {
    transport: dashboardRows(transportResult),
    storage: dashboardRows(storageResult)
  };
}

function normalizeOrderSelectionItems(body = {}) {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const fromItems = rawItems
    .map(item => ({
      source_table: String(item?.source_table || "").trim(),
      source_id: String(item?.source_id || "").trim()
    }))
    .filter(item => ["transport_requests", "storage_orders"].includes(item.source_table) && item.source_id);

  if (fromItems.length) {
    return fromItems.slice(0, 500);
  }

  return String(body.ids || body.order_ids || "")
    .split(",")
    .map(id => String(id || "").trim())
    .filter(Boolean)
    .slice(0, 500)
    .map(id => {
      if (id.startsWith("transport:")) return { source_table: "transport_requests", source_id: id.slice("transport:".length) };
      if (id.startsWith("storage:")) return { source_table: "storage_orders", source_id: id.slice("storage:".length) };
      return null;
    })
    .filter(Boolean);
}

async function setOrdersOfflineRecorded(supabase, adminUser, body = {}) {
  const items = normalizeOrderSelectionItems(body);
  if (!items.length) {
    throw new Error("请选择需要登记的订单");
  }
  const nextOfflineRecorded = body.offline_recorded !== false && body.offline_recorded !== "false";
  const operatedBy = resolveAdminDisplayName(adminUser);
  const operatedAt = new Date().toISOString();
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.source_table]) acc[item.source_table] = [];
    acc[item.source_table].push(item.source_id);
    return acc;
  }, {});

  const updatedItems = [];
  if (grouped.transport_requests?.length) {
    const { data, error } = await supabase
      .from("transport_requests")
      .update({
        offline_recorded: nextOfflineRecorded,
        last_operated_by: operatedBy,
        last_operated_at: operatedAt
      })
      .in("id", Array.from(new Set(grouped.transport_requests)))
      .select("id, order_no, offline_recorded, last_operated_by, last_operated_at");
    if (error) throw error;
    (data || []).forEach(item => updatedItems.push({ ...item, source_table: "transport_requests", source_id: item.id }));
  }

  if (grouped.storage_orders?.length) {
    const { data, error } = await supabase
      .from("storage_orders")
      .update({
        offline_recorded: nextOfflineRecorded,
        last_operated_by: operatedBy,
        last_operated_at: operatedAt
      })
      .in("id", Array.from(new Set(grouped.storage_orders)))
      .select("id, order_no, box_order_no, storage_pickup_order_no, offline_recorded, last_operated_by, last_operated_at");
    if (error) throw error;
    (data || []).forEach(item => updatedItems.push({ ...item, source_table: "storage_orders", source_id: item.id }));
  }

  await Promise.all(updatedItems.map(item => logAdminOperation(supabase, {
    admin_user_id: adminUser.id,
    target_type: item.source_table === "transport_requests" ? "transport_request" : "storage_order",
    target_id: item.source_id,
    action: nextOfflineRecorded ? "order_marked_offline_recorded" : "order_unmarked_offline_recorded",
    after_data: {
      offline_recorded: nextOfflineRecorded,
      last_operated_by: operatedBy,
      last_operated_at: operatedAt
    }
  })));

  return {
    updated_count: updatedItems.length,
    offline_recorded: nextOfflineRecorded,
    items: updatedItems
  };
}

async function enrichOrdersWithRiskFields(supabase, rows = []) {
  const transportIds = rows
    .filter(row => row.source_table === "transport_requests" && row.source_id)
    .map(row => row.source_id);
  const storageIds = rows
    .filter(row => row.source_table === "storage_orders" && row.source_id)
    .map(row => row.source_id);

  const [transportResult, storageResult] = await Promise.all([
    transportIds.length
      ? safeDashboardQuery(() => supabase.from("transport_requests").select("id, offline_recorded, last_operated_by, last_operated_at").in("id", transportIds))
      : Promise.resolve({ data: [] }),
    storageIds.length
      ? safeDashboardQuery(() => supabase.from("storage_orders").select("id, order_type, box_order_no, storage_pickup_order_no, offline_recorded, last_operated_by, last_operated_at").in("id", storageIds))
      : Promise.resolve({ data: [] })
  ]);

  const transportById = new Map(dashboardRows(transportResult).map(item => [String(item.id), item]));
  const storageById = new Map(dashboardRows(storageResult).map(item => [String(item.id), item]));

  return rows.map(row => {
    const source = row.source_table === "transport_requests"
      ? transportById.get(String(row.source_id))
      : storageById.get(String(row.source_id));
    return mergeOrderWithSourceRiskFields(row, source || {});
  });
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
      trends: cached.trends,
      status_distribution: cached.status_distribution,
      today_todos: cached.today_todos,
      risk_alerts: cached.risk_alerts,
      recent_operations: cached.recent_operations,
      generated_at: cached.generated_at,
      cache: {
        hit: true,
        ttl_ms: DASHBOARD_CACHE_TTL_MS
      }
    });
    return;
  }

  const now = new Date();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const todayKey = formatDashboardDateKey(now);
  const tomorrowKey = formatDashboardDateKey(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const trendKeys = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getTime() - (6 - index) * 24 * 60 * 60 * 1000);
    return formatDashboardDateKey(date);
  });
  const queryStartedAt = nowMs();
  const [
    adminsResult,
    usersResult,
    loginEventsResult,
    transportRequestsResult,
    pendingResult,
    transportPublishedResult,
    transportMatchedResult,
    storagePendingResult,
    activeOrdersResult,
    unarchivedOrdersResult,
    archivedOrdersResult,
    transportTrendResult,
    storageTrendResult,
    todayTransportResult,
    todayStorageResult,
    overdueTransportResult,
    overdueStorageResult,
    transportOfflineMissingResult,
    storageOfflineMissingResult,
    transportOperatorMissingResult,
    storageOperatorMissingResult,
    incompleteTransportResult,
    incompleteStorageResult,
    statusTransportPublishedResult,
    statusTransportMatchedResult,
    statusTransportClosedResult,
    statusStoragePendingResult,
    statusStorageConfirmedResult,
    statusStorageCancelledResult,
    statusOrdersArchivedResult,
    transportDailyAuditResult,
    storageDailyAuditResult,
    recentOperationsResult
  ] = await Promise.all([
    safeDashboardQuery(() => supabase.from("admin_users").select("id", { count: "estimated", head: true }).eq("status", "active")),
    safeDashboardQuery(() => supabase.from("users").select("id", { count: "estimated", head: true })),
    safeDashboardQuery(() => supabase.from("user_login_events").select("id", { count: "estimated", head: true }).gte("login_at", sevenDaysAgo)),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "estimated", head: true })),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).in("status", ["published", "matched"])),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "published")),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "matched")),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation")),
    safeDashboardQuery(() => supabase.from("orders").select("id", { count: "estimated", head: true }).eq("archived", false)),
    safeDashboardQuery(() => supabase.from("orders").select("id", { count: "exact", head: true }).eq("archived", false).in("status", ["confirmed", "closed", "cancelled"])),
    safeDashboardQuery(() => supabase.from("orders").select("id", { count: "estimated", head: true }).eq("archived", true)),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id, created_at, service_type").gte("created_at", sevenDaysAgo).limit(5000)),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id, created_at, order_type").gte("created_at", sevenDaysAgo).limit(5000)),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id, order_no, service_type, flight_datetime, student_name, status").gte("flight_datetime", `${todayKey}T00:00:00.000Z`).lt("flight_datetime", `${tomorrowKey}T00:00:00.000Z`).in("status", ["published", "matched"]).order("flight_datetime", { ascending: true }).limit(6)),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id, order_no, box_order_no, storage_pickup_order_no, order_type, service_date, box_delivery_date, customer_name, status").or(`service_date.eq.${todayKey},box_delivery_date.eq.${todayKey}`).in("status", ["pending_confirmation", "confirmed"]).order("created_at", { ascending: false }).limit(6)),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id, order_no, created_at, student_name, status", { count: "exact" }).in("status", ["published", "matched"]).eq("offline_recorded", false).lt("created_at", overdueCutoff).order("created_at", { ascending: true }).limit(5)),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id, order_no, created_at, customer_name, status", { count: "exact" }).in("status", ["pending_confirmation", "confirmed"]).eq("offline_recorded", false).lt("created_at", overdueCutoff).order("created_at", { ascending: true }).limit(5)),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("offline_recorded", false).in("status", ["published", "matched"])),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("offline_recorded", false).in("status", ["pending_confirmation", "confirmed"])),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).is("last_operated_by", null).in("status", ["published", "matched"])),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).is("last_operated_by", null).in("status", ["pending_confirmation", "confirmed"])),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).or("student_name.is.null,phone.is.null,wechat.is.null,flight_datetime.is.null")),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).or("customer_name.is.null,phone.is.null,wechat_id.is.null,service_date.is.null")),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "published")),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "matched")),
    safeDashboardQuery(() => supabase.from("transport_requests").select("id", { count: "exact", head: true }).eq("status", "closed")),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation")),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "confirmed")),
    safeDashboardQuery(() => supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "cancelled")),
    safeDashboardQuery(() => supabase.from("orders").select("id", { count: "exact", head: true }).eq("archived", true)),
    safeDashboardQuery(() => supabase.from("transport_sync_audit_logs").select("mismatch_count, checked_at").gte("checked_at", `${todayKey}T00:00:00.000Z`).lt("checked_at", `${tomorrowKey}T00:00:00.000Z`).limit(100)),
    safeDashboardQuery(() => supabase.from("storage_sync_audit_logs").select("mismatch_count, checked_at").gte("checked_at", `${todayKey}T00:00:00.000Z`).lt("checked_at", `${tomorrowKey}T00:00:00.000Z`).limit(100)),
    safeDashboardQuery(() => supabase
      .from("admin_operation_logs")
      .select("id, action, target_type, target_id, order_id, created_at, admin_user:admin_users(id, name, username, email)")
      .neq("action", "empty_group_deleted")
      .order("created_at", { ascending: false })
      .limit(8))
  ]);
  const queryMs = nowMs() - queryStartedAt;

  const cards = {
    active_admins: dashboardCount(adminsResult),
    total_users: dashboardCount(usersResult),
    logins_last_7_days: dashboardCount(loginEventsResult),
    transport_requests_total: dashboardCount(transportRequestsResult),
    transport_requests_pending: dashboardCount(pendingResult),
    transport_requests_published: dashboardCount(transportPublishedResult),
    transport_requests_matched: dashboardCount(transportMatchedResult),
    storage_orders_pending: dashboardCount(storagePendingResult),
    active_orders_total: dashboardCount(activeOrdersResult),
    unarchived_orders_total: dashboardCount(unarchivedOrdersResult),
    archived_orders_total: dashboardCount(archivedOrdersResult)
  };
  const trends = buildDashboardTrends(trendKeys, transportTrendResult.data || [], storageTrendResult.data || []);
  let statusDistribution = [
    { key: "pending", label: "待处理", value: dashboardCount(statusTransportPublishedResult) + dashboardCount(statusStoragePendingResult), tone: "warning" },
    { key: "confirmed", label: "已确认/已成团", value: dashboardCount(statusTransportMatchedResult) + dashboardCount(statusStorageConfirmedResult), tone: "info" },
    { key: "completed", label: "已完成", value: dashboardCount(statusTransportClosedResult), tone: "success" },
    { key: "archived", label: "已归档", value: dashboardCount(statusOrdersArchivedResult), tone: "neutral" },
    { key: "cancelled", label: "已取消", value: dashboardCount(statusStorageCancelledResult), tone: "danger" }
  ];
  const todayTodos = [
    ...dashboardRows(todayTransportResult).map(item => ({
      id: item.id,
      type: "transport",
      title: getTransportServiceLabel(item.service_type),
      order_no: item.order_no || "",
      customer: item.student_name || "",
      due_at: item.flight_datetime || "",
      status: item.status || "",
      href: `/admin/transport/requests/${encodeURIComponent(item.id)}`
    })),
    ...dashboardRows(todayStorageResult).map(item => ({
      id: item.id,
      type: "storage",
      title: getStorageOrderTypeLabel(item.order_type),
      order_no: getStorageDashboardOrderNo(item),
      customer: item.customer_name || "",
      due_at: item.service_date || item.box_delivery_date || "",
      status: item.status || "",
      href: getStorageDashboardHref(item)
    })),
    ...dashboardRows(overdueTransportResult).map(item => ({
      id: item.id,
      type: "overdue",
      title: "接送机超过 24 小时未登记",
      order_no: item.order_no || "",
      customer: item.student_name || "",
      due_at: item.created_at || "",
      status: item.status || "",
      href: `/admin/transport/requests/${encodeURIComponent(item.id)}`
    })),
    ...dashboardRows(overdueStorageResult).map(item => ({
      id: item.id,
      type: "overdue",
      title: "寄存超过 24 小时未登记",
      order_no: item.order_no || "",
      customer: item.customer_name || "",
      due_at: item.created_at || "",
      status: item.status || "",
      href: `/admin/storage/storage-orders/${encodeURIComponent(item.id)}`
    }))
  ].slice(0, 10);
  let riskAlerts = [
    {
      key: "unarchived_orders",
      label: "未归档订单",
      value: cards.unarchived_orders_total,
      helper: "已结束但仍在活动视图中",
      href: "/admin/orders?archived=active"
    },
    {
      key: "missing_operator",
      label: "无最近操作人",
      value: dashboardCount(transportOperatorMissingResult) + dashboardCount(storageOperatorMissingResult),
      helper: "需要明确客服责任人",
      href: "/admin/transport/requests"
    },
    {
      key: "offline_missing",
      label: "未标记线下记录",
      value: dashboardCount(transportOfflineMissingResult) + dashboardCount(storageOfflineMissingResult),
      helper: "可能尚未同步到客服台账",
      href: "/admin/storage/orders?offline_recorded=false"
    },
    {
      key: "missing_required_fields",
      label: "关键字段缺失",
      value: dashboardCount(incompleteTransportResult) + dashboardCount(incompleteStorageResult),
      helper: "学生已提交但后台信息不完整",
      href: "/admin/orders"
    }
  ];
  const riskSourcesList = await Promise.all(Object.keys(DASHBOARD_RISK_LABELS).map(risk => fetchDashboardRiskSources(supabase, risk, {
    cutoff: overdueCutoff,
    limit: 5000
  })));
  const riskByKey = new Map(riskSourcesList.map(item => [item.risk, item]));
  const overdueSources = riskByKey.get("overdue_unprocessed") || { transport: [], storage: [] };
  const offlineUnrecordedSources = riskByKey.get("offline_unrecorded") || { transport: [], storage: [] };
  cards.transport_requests_pending = (offlineUnrecordedSources.transport || []).length;
  cards.storage_orders_pending = (offlineUnrecordedSources.storage || []).length;
  const activeSourceOrdersTotal = dashboardCount(transportPublishedResult)
    + dashboardCount(transportMatchedResult)
    + dashboardCount(storagePendingResult)
    + dashboardCount(statusStorageConfirmedResult);
  const unregisteredOrdersTotal = cards.transport_requests_pending + cards.storage_orders_pending;
  const dailyInspectionAnomaliesTotal = [
    ...dashboardRows(transportDailyAuditResult),
    ...dashboardRows(storageDailyAuditResult)
  ].reduce((sum, item) => sum + Number(item.mismatch_count || 0), 0);
  const dailyInspectionRunsTotal = dashboardRows(transportDailyAuditResult).length
    + dashboardRows(storageDailyAuditResult).length;
  cards.unregistered_orders_total = unregisteredOrdersTotal;
  cards.daily_inspection_runs_total = dailyInspectionRunsTotal;
  cards.daily_inspection_anomalies_total = dailyInspectionAnomaliesTotal;
  cards.active_orders_total = Math.max(0, activeSourceOrdersTotal - unregisteredOrdersTotal);
  cards.abnormal_orders_total = riskSourcesList.reduce((sum, item) => sum + Number(item.total || 0), 0);
  delete cards.unarchived_orders_total;
  delete cards.archived_orders_total;
  statusDistribution = [
    { key: "unregistered", label: "未登记", value: unregisteredOrdersTotal, tone: "warning" },
    { key: "registered", label: "已登记", value: cards.active_orders_total, tone: "success" }
  ];
  riskAlerts = Object.keys(DASHBOARD_RISK_LABELS).map(risk => {
    const source = riskByKey.get(risk) || { total: 0 };
    return {
      key: risk,
      risk,
      label: DASHBOARD_RISK_LABELS[risk],
      value: Number(source.total || 0),
      helper: DASHBOARD_RISK_HELPERS[risk],
      href: getDashboardRiskHref(risk)
    };
  });
  const recentOperations = await enrichDashboardOperations(supabase, recentOperationsResult.data || []);
  const generatedAt = new Date().toISOString();
  dashboardCache = {
    cachedAt: Date.now(),
    generated_at: generatedAt,
    cards,
    trends,
    status_distribution: statusDistribution,
    today_todos: todayTodos,
    risk_alerts: riskAlerts,
    recent_operations: recentOperations
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
    trends,
    status_distribution: statusDistribution,
    today_todos: todayTodos,
    risk_alerts: riskAlerts,
    recent_operations: recentOperations,
    generated_at: generatedAt,
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
      const relatedStorageOrder = await fetchRelatedStorageOrderForBoxOrder(supabase, existing).catch(error => {
        console.warn("[admin-storage] failed to fetch related storage order", error);
        return null;
      });
      const operationLogs = await fetchStorageOperationLogs(supabase, storageOrderId);
      logPerf("storage.detail", {
        authMs,
        queryMs: detailQueryMs,
        countMs: 0,
        enrichmentMs: nowMs() - enrichmentStartedAt,
        totalMs: nowMs() - startedAt,
        rows: enrichedExisting ? 1 : 0,
        cacheHit: null
      });
      ok(res, {
        order: relatedStorageOrder
          ? { ...(enrichedExisting || existing), related_storage_order: relatedStorageOrder }
          : (enrichedExisting || existing),
        operation_logs: operationLogs
      });
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
        "expected_storage_end_date",
        "offline_recorded"
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
      if (patch.offline_recorded !== undefined) {
        patch.offline_recorded = patch.offline_recorded === true || patch.offline_recorded === "true";
      }

      let membershipClaimPatch = null;
      if (body.recalculate_pricing === true || body.recalculate_pricing === "true") {
        const pricingResult = recalculateStorageOrderPricing(existing, patch);
        if (!pricingResult.ok) {
          badRequest(res, pricingResult.reason || "storage pricing recalculation failed");
          return;
        }
        Object.assign(patch, pricingResult.patch);
        if (existing.membership_benefit_claim_id) {
          const { data: membershipClaim, error: membershipClaimError } = await supabase
            .from("membership_benefit_claims")
            .select("*")
            .eq("id", existing.membership_benefit_claim_id)
            .maybeSingle();
          if (membershipClaimError) {
            throw membershipClaimError;
          }
          if (membershipClaim) {
            const discountResult = calculateMembershipDiscount({ ...existing, ...patch }, membershipClaim);
            patch.membership_discount_amount = discountResult.membershipDiscountAmount || 0;
            patch.extra_charge_amount = discountResult.extraChargeAmount || 0;
            patch.final_price = discountResult.finalPrice === null || discountResult.finalPrice === undefined
              ? patch.final_price
              : discountResult.finalPrice;
            patch.membership_discount_breakdown_json = discountResult.breakdown || {};
            membershipClaimPatch = {
              membership_discount_amount: patch.membership_discount_amount,
              extra_charge_amount: patch.extra_charge_amount,
              final_price: patch.final_price,
              discount_breakdown_json: patch.membership_discount_breakdown_json || {}
            };
          }
        }
      }

      let relatedStorageUpdate = null;
      if (
        (body.sync_related_storage_order === true || body.sync_related_storage_order === "true")
        && patch.estimated_box_count !== undefined
      ) {
        const relatedStorageOrder = await fetchRelatedStorageOrderForBoxOrder(supabase, existing);
        if (relatedStorageOrder) {
          const relatedPatch = {
            estimated_box_count: patch.estimated_box_count
          };
          const relatedPricingResult = recalculateStorageOrderPricing(relatedStorageOrder, relatedPatch);
          if (!relatedPricingResult.ok) {
            badRequest(res, relatedPricingResult.reason || "关联寄存订单费用重算失败。");
            return;
          }
          Object.assign(relatedPatch, relatedPricingResult.patch, {
            last_operated_by: resolveAdminDisplayName(adminUser),
            last_operated_at: new Date().toISOString()
          });
          relatedStorageUpdate = {
            before: relatedStorageOrder,
            patch: relatedPatch
          };
        }
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
      patch.last_operated_by = resolveAdminDisplayName(adminUser);
      patch.last_operated_at = new Date().toISOString();

      const { data: updateMarker, error: updateError } = await supabase
        .from("storage_orders")
        .update(patch)
        .eq("id", storageOrderId)
        .select("id")
        .single();

      if (updateError) {
        const missingColumn = extractMissingColumnName(updateError, "storage_orders");
        if (isStorageOfflineTrackingColumn(missingColumn)) {
          badRequest(res, storageOfflineTrackingMigrationMessage());
          return;
        }
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

      if (membershipClaimPatch && existing.membership_benefit_claim_id) {
        const { error: membershipClaimUpdateError } = await supabase
          .from("membership_benefit_claims")
          .update(membershipClaimPatch)
          .eq("id", existing.membership_benefit_claim_id);
        if (membershipClaimUpdateError) {
          throw membershipClaimUpdateError;
        }
      }

      let relatedUpdated = null;
      if (relatedStorageUpdate) {
        const { data, error: relatedUpdateError } = await supabase
          .from("storage_orders")
          .update(relatedStorageUpdate.patch)
          .eq("id", relatedStorageUpdate.before.id)
          .select((cachedStorageOrderDetailColumns || STORAGE_ORDER_DETAIL_COLUMNS).join(", "))
          .single();
        if (relatedUpdateError) {
          throw relatedUpdateError;
        }
        relatedUpdated = data;
        await logAdminOperation(supabase, {
          admin_user_id: adminUser.id,
          target_type: "storage_order",
          target_id: relatedStorageUpdate.before.id,
          action: "storage_order_updated",
          before_data: relatedStorageUpdate.before,
          after_data: relatedUpdated,
          metadata: {
            order_no: relatedStorageUpdate.before.order_no || null,
            source_order_no: existing.box_order_no || existing.order_no || null,
            changed_fields: Object.keys(relatedStorageUpdate.patch),
            sync_reason: "box_order_quantity_update"
          }
        }).catch(error => {
          console.warn("[admin-storage] failed to write related storage update operation log", error);
        });
      }

      const changedFields = Object.keys(patch);
      const offlineRecordOnlyChanged = changedFields.every(fieldName => [
        "offline_recorded",
        "last_operated_by",
        "last_operated_at"
      ].includes(fieldName));
      const operationAction = offlineRecordOnlyChanged && Object.prototype.hasOwnProperty.call(patch, "offline_recorded")
        ? (patch.offline_recorded ? "storage_orders_marked_offline_recorded" : "storage_orders_unmarked_offline_recorded")
        : "storage_order_updated";

      await logAdminOperation(supabase, {
        admin_user_id: adminUser.id,
        target_type: "storage_order",
        target_id: storageOrderId,
        action: operationAction,
        before_data: existing,
        after_data: updated,
        metadata: {
          order_no: existing.order_no || null,
          changed_fields: changedFields
        }
      }).catch(error => {
        console.warn("[admin-storage] failed to write update operation log", error);
      });

      ok(res, relatedUpdated ? { ...updated, related_storage_order: relatedUpdated } : updated);
      return;
    }

    const { error: deleteError } = await supabase
      .from("storage_orders")
      .delete()
      .eq("id", storageOrderId);

    if (deleteError) {
      throw deleteError;
    }

    const releasedMembershipClaim = await releaseClaimOrderBinding(supabase, {
      claim_id: existing.membership_benefit_claim_id,
      order_table: "storage_orders",
      order_id: existing.id,
      order_no: existing.order_no,
      admin_user_id: adminUser.id || null,
      reason: "storage_order_deleted"
    });

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

    ok(res, {
      deleted: true,
      id: storageOrderId,
      order_no: existing.order_no || null,
      released_membership_claim: releasedMembershipClaim
    });
    return;
  }

  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    if (body.action !== "set_offline_recorded") {
      badRequest(res, "Unsupported storage order bulk action");
      return;
    }
    const ids = parseStorageBaseIds(body.ids || body.storage_order_ids);
    if (!ids.length) {
      badRequest(res, "storage order ids are required");
      return;
    }
    if (ids.length > 200) {
      badRequest(res, "Too many storage orders selected");
      return;
    }

    const nextOfflineRecorded = body.offline_recorded === true || body.offline_recorded === "true";
    const operatedAt = new Date().toISOString();
    const operatedBy = resolveAdminDisplayName(adminUser);
    const beforeResult = await supabase
      .from("storage_orders")
      .select("id, order_no, box_order_no, storage_pickup_order_no, offline_recorded")
      .in("id", ids);
    if (beforeResult.error) {
      const missingColumn = extractMissingColumnName(beforeResult.error, "storage_orders");
      if (isStorageOfflineTrackingColumn(missingColumn)) {
        badRequest(res, storageOfflineTrackingMigrationMessage());
        return;
      }
      throw beforeResult.error;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("storage_orders")
      .update({
        offline_recorded: nextOfflineRecorded,
        last_operated_by: operatedBy,
        last_operated_at: operatedAt
      })
      .in("id", ids)
      .select("id, order_no, box_order_no, storage_pickup_order_no, offline_recorded, last_operated_by, last_operated_at");

    if (updateError) {
      const missingColumn = extractMissingColumnName(updateError, "storage_orders");
      if (isStorageOfflineTrackingColumn(missingColumn)) {
        badRequest(res, storageOfflineTrackingMigrationMessage());
        return;
      }
      throw updateError;
    }

    await logAdminOperation(supabase, {
      admin_user_id: adminUser.id,
      target_type: "storage_order",
      target_id: null,
      action: nextOfflineRecorded ? "storage_orders_marked_offline_recorded" : "storage_orders_unmarked_offline_recorded",
      before_data: { items: beforeResult.data || [] },
      after_data: { items: updatedRows || [] },
      metadata: {
        ids,
        updated_count: (updatedRows || []).length,
        offline_recorded: nextOfflineRecorded
      }
    }).catch(error => {
      console.warn("[admin-storage] failed to write bulk offline operation log", error);
    });

    ok(res, {
      updated_count: (updatedRows || []).length,
      offline_recorded: nextOfflineRecorded,
      items: updatedRows || []
    });
    return;
  }

  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET", "PATCH"]);
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 10);
  const sort = String(queryParams.sort || "service_date_nearest").trim();
  const allOrdersMode = String(queryParams.order_type || "").trim() === "all";
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchStartedAt = nowMs();
  const matchingSiteUserIds = await findStorageSearchSiteUserIds(supabase, queryParams.search);
  const searchMs = nowMs() - searchStartedAt;
  const storageOrderColumns = allOrdersMode
    ? [...STORAGE_ORDER_LIST_COLUMNS, "estimated_box_count", "item_description", "notes", "customer_form_json"]
    : STORAGE_ORDER_LIST_COLUMNS;
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
      .select(selectedColumns.join(", "), { count: "exact" });

    if (allOrdersMode) {
      query = query
        .order("created_at", { ascending: false })
        .limit(10000);
    } else if (sort === "created_at_desc" || sort === "submitted_latest") {
      query = query.order("created_at", { ascending: false });
    } else if (sort === "submitted_oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (sort === "service_date_latest") {
      query = query
        .order("service_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    } else if (sort === "total_high") {
      query = query
        .order("final_price", { ascending: false, nullsFirst: false })
        .order("estimated_total_price", { ascending: false, nullsFirst: false });
    } else if (sort === "total_low") {
      query = query
        .order("final_price", { ascending: true, nullsFirst: false })
        .order("estimated_total_price", { ascending: true, nullsFirst: false });
    } else {
      query = query
        .order("service_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
    }

    const filterParams = allOrdersMode
      ? { ...queryParams, order_type: "all", date_scope: "all", date_start: "", date_end: "" }
      : queryParams;

    buildStorageOrderAdminFilters(query, filterParams, {
      matchingSiteUserIds,
      supportedColumns: new Set(selectedColumns)
    });

    const result = allOrdersMode ? await query : await query.range(from, to);
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
  const storageTrackingReady = ["offline_recorded", "last_operated_by", "last_operated_at"]
    .every(column => selectedColumns.includes(column));

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
  const operatorOptions = await listStorageOperatorOptions(supabase);
  let responseItems = enrichedItems;
  let currentStats = buildStorageWorkbenchStats(enrichedItems);
  if (allOrdersMode) {
    const expandedRows = enrichedItems.flatMap(expandStorageOrderForAdmin);
    const filteredRows = applyStorageWorkbenchFilters(
      filterExpandedStorageRows(expandedRows, queryParams),
      queryParams
    );
    const sortedRows = sortStorageAdminRows(filteredRows, sort);
    count = sortedRows.length;
    currentStats = buildStorageWorkbenchStats(sortedRows);
    responseItems = sortedRows.slice(from, to + 1);
  }
  const enrichmentMs = nowMs() - enrichmentStartedAt;

  logPerf("storage.list", {
    authMs,
    page,
    pageSize,
    returned: responseItems.length,
    rows: responseItems.length,
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
    items: responseItems,
    operator_options: operatorOptions,
    current_stats: currentStats,
    storage_tracking_ready: storageTrackingReady,
    storage_tracking_message: storageTrackingReady ? "" : storageOfflineTrackingMigrationMessage(),
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  });
}

async function handleStorageOrdersExport(req, res, supabase) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const queryParams = req.query || {};
  const sort = String(queryParams.sort || "service_date_nearest").trim();
  const allOrdersMode = String(queryParams.order_type || "").trim() === "all";
  const selectedRowIds = parseStorageExpandedRowIds(queryParams.row_ids || queryParams.selected_row_ids);
  const selectedBaseIds = parseStorageBaseIds(queryParams.ids || queryParams.storage_order_ids || Array.from(selectedRowIds));
  const searchStartedAt = nowMs();
  const matchingSiteUserIds = selectedBaseIds.length
    ? []
    : await findStorageSearchSiteUserIds(supabase, queryParams.search);
  const searchMs = nowMs() - searchStartedAt;
  const selectColumns = [...STORAGE_ORDER_DETAIL_COLUMNS];

  let query = supabase
    .from("storage_orders")
    .select(selectColumns.join(", "))
    .limit(5000);

  if (selectedBaseIds.length) {
    query = query.in("id", selectedBaseIds);
  }

  if (allOrdersMode || sort === "created_at_desc" || sort === "submitted_latest") {
    query = query.order("created_at", { ascending: false });
  } else if (sort === "submitted_oldest") {
    query = query.order("created_at", { ascending: true });
  } else if (sort === "service_date_latest") {
    query = query
      .order("service_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else if (sort === "total_high") {
    query = query
      .order("final_price", { ascending: false, nullsFirst: false })
      .order("estimated_total_price", { ascending: false, nullsFirst: false });
  } else if (sort === "total_low") {
    query = query
      .order("final_price", { ascending: true, nullsFirst: false })
      .order("estimated_total_price", { ascending: true, nullsFirst: false });
  } else {
    query = query
      .order("service_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  const filterParams = allOrdersMode
    ? { ...queryParams, order_type: "all", date_scope: "all", date_start: "", date_end: "" }
    : queryParams;

  if (!selectedBaseIds.length) {
    buildStorageOrderAdminFilters(query, filterParams, {
      matchingSiteUserIds,
      supportedColumns: new Set(selectColumns)
    });
  }

  const queryStartedAt = nowMs();
  const { data, error } = await query;
  if (error) {
    throw error;
  }

  let items = (await enrichStorageOrdersWithPublicUserIds(supabase, data || []))
    .map(normalizeStorageAdminListItem);
  if (allOrdersMode) {
    items = sortStorageAdminRows(
      applyStorageWorkbenchFilters(
        filterExpandedStorageRows(items.flatMap(expandStorageOrderForAdmin), queryParams),
        queryParams
      ),
      sort
    );
    if (selectedRowIds.size) {
      items = items.filter(item => selectedRowIds.has(String(item.id)));
    }
  }
  const rows = buildStorageExportRows(items);
  const columns = buildStorageExportColumns(queryParams.order_type);
  const excelHtml = rowsToExcelHtml(rows, columns);

  logPerf("storage.export", {
    admin: adminUser.id,
    rows: rows.length,
    searchMs,
    queryMs: nowMs() - queryStartedAt
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${buildStorageExportFilename(queryParams)}"`);
  res.end(Buffer.from(`\ufeff${excelHtml}`, "utf8"));
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
  if (!["GET", "PATCH"].includes(req.method)) {
    methodNotAllowed(res, ["GET", "PATCH"]);
    return;
  }

  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    if (body?.action !== "set_offline_recorded") {
      badRequest(res, "Unsupported orders bulk action.");
      return;
    }
    const result = await setOrdersOfflineRecorded(supabase, adminUser, body);
    ok(res, result);
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 20);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const risk = normalizeDashboardRisk(queryParams.risk);
  const offlineRecordedFilter = normalizeOfflineRecordedFilter(queryParams.offline_recorded);

  if (risk) {
    const riskStartedAt = nowMs();
    const riskSources = await fetchDashboardRiskSources(supabase, risk, { limit: 10000 });
    const allRiskRows = await buildRiskOrderRows(supabase, riskSources);
    const riskRows = filterDashboardRiskOrderRows(allRiskRows, queryParams);
    const responseItems = riskRows.slice(from, to + 1);
    const queryMs = nowMs() - riskStartedAt;

    logPerf("orders.risk_list", {
      authMs,
      queryMs,
      countMs: queryMs,
      totalMs: nowMs() - startedAt,
      rows: responseItems.length,
      page,
      pageSize,
      risk,
      countMode: "derived",
      cacheHit: null
    });

    ok(res, {
      items: responseItems,
      risk: {
        key: risk,
        label: riskSources.label,
        helper: riskSources.helper,
        total: riskRows.length
      },
      pagination: {
        page,
        page_size: pageSize,
        total: riskRows.length,
        total_pages: riskRows.length ? Math.ceil(riskRows.length / pageSize) : 0
      }
    });
    return;
  }

  if (offlineRecordedFilter !== null) {
    const registrationStartedAt = nowMs();
    const registrationSources = await fetchDashboardRegistrationSources(supabase, offlineRecordedFilter);
    const allRegistrationRows = await buildRiskOrderRows(supabase, registrationSources);
    const registrationRows = filterDashboardRiskOrderRows(allRegistrationRows, queryParams);
    const responseItems = registrationRows.slice(from, to + 1);
    const queryMs = nowMs() - registrationStartedAt;

    logPerf("orders.registration_list", {
      authMs,
      queryMs,
      countMs: queryMs,
      totalMs: nowMs() - startedAt,
      rows: responseItems.length,
      page,
      pageSize,
      offline_recorded: offlineRecordedFilter,
      countMode: "derived",
      cacheHit: null
    });

    ok(res, {
      items: responseItems,
      pagination: {
        page,
        page_size: pageSize,
        total: registrationRows.length,
        total_pages: registrationRows.length ? Math.ceil(registrationRows.length / pageSize) : 0
      }
    });
    return;
  }

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
    items: await enrichOrdersWithRiskFields(supabase, data || []),
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

  const actionId = String(req.query?.id || req.query?.manager_id || "").trim();
  const action = String(req.query?.manager_action || req.query?.sub_action || "").trim();
  if (actionId && (req.method === "PATCH" || req.method === "DELETE" || req.method === "POST")) {
    await handleManagerDetailWithAdmin(req, res, supabase, adminUser, actionId, action);
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
    created(res, { manager: serializeAdmin(data), message: "管理员已创建" });
    return;
  }

  methodNotAllowed(res, ["GET", "POST"]);
}

async function handleManagerDetail(req, res, supabase, id, subAction) {
  const adminUser = await requireAdminUser(req, res, supabase, { roles: ["super_admin"] });
  if (!adminUser) {
    return;
  }

  await handleManagerDetailWithAdmin(req, res, supabase, adminUser, id, subAction);
}

async function handleManagerDetailWithAdmin(req, res, supabase, adminUser, id, subAction) {
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
      ok(res, { deleted: true, id, message: "管理员已删除" });
      return;
    }

    if (req.method !== "PATCH") {
      methodNotAllowed(res, ["PATCH", "DELETE"]);
      return;
    }

    const body = await parseJsonBody(req);
    let payload;
    try {
      payload = mapManagerUpdatePayload(body, { allowUsername: isRootManagerAccount(adminUser) });
      await assertManagerMutationAllowed(supabase, adminUser, target, payload);
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    if (payload.username && payload.username !== target.username) {
      const { data: duplicateByUsername, error: usernameError } = await supabase
        .from("admin_users")
        .select("id")
        .eq("username", payload.username)
        .neq("id", id)
        .maybeSingle();
      if (usernameError) {
        throw usernameError;
      }
      if (duplicateByUsername) {
        badRequest(res, "该账号已存在，请更换后重试");
        return;
      }
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
    ok(res, { manager: serializeAdmin(data), message: "管理员信息已保存" });
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

  const entitlementActionId = subAction || String(req.query?.id || req.query?.entitlement_id || "").trim();
  if (entitlementActionId && req.method === "DELETE") {
    try {
      ok(res, await deleteMembershipEntitlement(supabase, entitlementActionId, adminUser.id));
    } catch (error) {
      badRequest(res, error.message);
    }
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
  const displayStatus = String(queryParams.display_status || "").trim();
  const search = String(queryParams.search || "").trim();
  const matchingUserIds = search ? await findStorageSearchSiteUserIds(supabase, search) : [];

  let query = supabase
    .from("membership_entitlements")
    .select("*", { count: "exact" })
    .eq("membership_cycle", cycle)
    .order("created_at", { ascending: false });
  if (entitlementActionId) {
    query = query.eq("id", entitlementActionId);
  }
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
  let birthdayReminders = [];
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
  if (entitlementIds.length) {
    const reminderResult = await supabase
      .from("membership_birthday_reminders")
      .select("id, membership_id, advisor_admin_id, reminder_date, sent_to_email, resend_message_id, status, error_message, created_at")
      .in("membership_id", entitlementIds)
      .order("reminder_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (reminderResult.error) {
      const message = `${reminderResult.error.message || ""} ${reminderResult.error.details || ""}`.toLowerCase();
      if (!message.includes("membership_birthday_reminders")) {
        throw reminderResult.error;
      }
    } else {
      birthdayReminders = reminderResult.data || [];
    }
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
  const birthdayReminderByEntitlement = new Map();
  birthdayReminders.forEach(reminder => {
    const key = String(reminder.membership_id || "");
    if (key && !birthdayReminderByEntitlement.has(key)) {
      birthdayReminderByEntitlement.set(key, reminder);
    }
  });
  const activationCodeIds = Array.from(new Set(entitlements
    .map(entitlement => entitlement.metadata?.activation_code_id)
    .filter(Boolean)
    .map(String)));
  let activationCodeById = new Map();
  if (activationCodeIds.length) {
    const { data: activationCodes, error: activationCodeError } = await supabase
      .from("membership_activation_codes")
      .select("id, code_prefix, generated_by_admin_id, notes, member_birthday, created_at, redeemed_at")
      .in("id", activationCodeIds);
    if (activationCodeError) {
      throw activationCodeError;
    }
    activationCodeById = new Map((activationCodes || []).map(code => [String(code.id), code]));
  }
  const adminIds = Array.from(new Set(entitlements
    .flatMap(entitlement => {
      const activationCodeId = entitlement.metadata?.activation_code_id;
      const activationCode = activationCodeId ? activationCodeById.get(String(activationCodeId)) : null;
      const entitlementClaims = claims.filter(claim => claim.entitlement_id === entitlement.id);
      const entitlementLogs = auditLogs.filter(log => log.entitlement_id === entitlement.id);
      return [
        entitlement.advisor_admin_id,
        entitlement.created_by_admin_id,
        entitlement.granted_by_admin_id,
        activationCode?.generated_by_admin_id,
        ...entitlementClaims.flatMap(claim => [claim.created_by_admin_id, claim.updated_by_admin_id]),
        ...entitlementLogs.map(log => log.admin_user_id)
      ];
    })
    .filter(Boolean)
    .map(String)));
  let adminById = new Map();
  if (adminIds.length) {
    const { data: admins, error: adminError } = await supabase
      .from("admin_users")
      .select("id, name, username, email")
      .in("id", adminIds);
    if (adminError) {
      throw adminError;
    }
    adminById = new Map((admins || []).map(admin => [String(admin.id), admin]));
  }

  ok(res, {
    items: entitlements
      .map(entitlement => {
        const activationCodeId = entitlement.metadata?.activation_code_id;
        const activationCode = activationCodeId ? activationCodeById.get(String(activationCodeId)) : null;
        const advisorId = entitlement.advisor_admin_id
          || entitlement.created_by_admin_id
          || entitlement.granted_by_admin_id
          || activationCode?.generated_by_admin_id
          || null;
        const enrichedAuditLogs = (auditLogsByEntitlement.get(String(entitlement.id)) || [])
          .map(log => ({
            ...log,
            admin_user: log.admin_user_id ? adminById.get(String(log.admin_user_id)) || null : null
          }));
        const lastOperation = enrichedAuditLogs[0] || null;
        return {
          ...entitlement,
          user: userById.get(String(entitlement.site_user_id)) || null,
          claim: claimByEntitlement.get(entitlement.id) || null,
          advisor: advisorId ? adminById.get(String(advisorId)) || null : null,
          advisor_admin_id: advisorId,
          activation_code: activationCode || null,
          member_birthday: entitlement.birthday_month && entitlement.birthday_day
            ? `${String(entitlement.birthday_month).padStart(2, "0")}-${String(entitlement.birthday_day).padStart(2, "0")}`
            : (entitlement.metadata?.member_birthday || activationCode?.member_birthday || null),
          birthday_reminder_enabled: entitlement.birthday_reminder_enabled !== false,
          last_birthday_reminder: birthdayReminderByEntitlement.get(String(entitlement.id)) || null,
          audit_logs: enrichedAuditLogs,
          last_operation: lastOperation
            ? {
                id: lastOperation.id,
                action: lastOperation.action,
                created_at: lastOperation.created_at,
                admin_user_id: lastOperation.admin_user_id || null,
                admin_user: lastOperation.admin_user || null,
                metadata: lastOperation.metadata || {}
              }
            : null
        };
      })
      .filter(item => {
        if (!benefitType && !claimStatus) {
          return true;
        }
        return Boolean(item.claim);
      })
      .filter(item => {
        if (displayStatus === "unused") {
          return item.status === "active" && !item.claim;
        }
        return true;
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
  const actionClaimId = claimId || String(body.claim_id || body.claimId || req.query?.id || req.query?.claim_id || "").trim();
  const action = subAction || String(body.action || body.claim_action || req.query?.action || req.query?.claim_action || "").trim();
  if (!actionClaimId) {
    try {
      ok(res, { claim: await createManualClaim(supabase, body, adminUser.id) });
    } catch (error) {
      badRequest(res, error.message, error.claim ? { claim: error.claim } : null);
    }
    return;
  }
  if (action === "mark-used") {
    ok(res, { claim: await markClaimUsed(supabase, actionClaimId, adminUser.id) });
    return;
  }
  if (action === "cancel") {
    ok(res, { claim: await cancelOrResetClaim(supabase, actionClaimId, adminUser.id, { reason: body.reason || body.note }) });
    return;
  }
  if (action === "reset") {
    ok(res, { claim: await cancelOrResetClaim(supabase, actionClaimId, adminUser.id, { reset: true, reason: body.reason || body.note }) });
    return;
  }
  if (action === "unbind-order") {
    const claim = await releaseClaimOrderBinding(supabase, {
      claim_id: actionClaimId,
      admin_user_id: adminUser.id,
      reason: body.reason || body.note || "admin_unbound_order"
    });
    ok(res, { claim });
    return;
  }
  methodNotAllowed(res, ["POST"]);
}

function getUkDateOnly(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function birthdayDateForYear(month, day, year) {
  return new Date(Date.UTC(year, Number(month) - 1, Number(day)));
}

async function handleMembershipBirthdays(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const queryParams = req.query || {};
  const cycle = String(queryParams.cycle || getCurrentMembershipCycle()).trim();
  const days = Math.min(parsePositiveInteger(queryParams.days, 30), 366);
  const limit = Math.min(parsePageSize(queryParams.limit, 12), 50);
  const today = getUkDateOnly();
  const fromDate = new Date(today);
  fromDate.setUTCDate(today.getUTCDate() - days + 1);

  const { data: entitlements, error } = await supabase
    .from("membership_entitlements")
    .select("*")
    .eq("membership_cycle", cycle)
    .eq("status", "active")
    .not("birthday_month", "is", null)
    .not("birthday_day", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    throw error;
  }

  const currentYear = today.getUTCFullYear();
  const recentEntitlements = (entitlements || [])
    .map(entitlement => {
      const thisYearBirthday = birthdayDateForYear(entitlement.birthday_month, entitlement.birthday_day, currentYear);
      const previousYearBirthday = birthdayDateForYear(entitlement.birthday_month, entitlement.birthday_day, currentYear - 1);
      const birthdayDate = thisYearBirthday <= today ? thisYearBirthday : previousYearBirthday;
      return {
        entitlement,
        birthdayDate,
        daysAgo: Math.round((today.getTime() - birthdayDate.getTime()) / 86400000)
      };
    })
    .filter(item => item.birthdayDate >= fromDate && item.birthdayDate <= today)
    .sort((left, right) => right.birthdayDate - left.birthdayDate || new Date(right.entitlement.created_at) - new Date(left.entitlement.created_at))
    .slice(0, limit);

  const membershipIds = recentEntitlements.map(item => item.entitlement.id);
  const userIds = recentEntitlements.map(item => item.entitlement.site_user_id).filter(Boolean);
  const users = userIds.length ? await querySiteUsersWithFallback(supabase, { ids: userIds }) : [];
  const userById = new Map(users.map(user => [String(user.id), user]));

  let claims = [];
  let reminders = [];
  if (membershipIds.length) {
    const [claimResult, reminderResult] = await Promise.all([
      supabase
        .from("membership_benefit_claims")
        .select("*")
        .in("entitlement_id", membershipIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("membership_birthday_reminders")
        .select("id, membership_id, advisor_admin_id, reminder_date, sent_to_email, status, error_message, created_at")
        .in("membership_id", membershipIds)
        .order("reminder_date", { ascending: false })
        .order("created_at", { ascending: false })
    ]);
    if (claimResult.error) {
      throw claimResult.error;
    }
    if (reminderResult.error) {
      throw reminderResult.error;
    }
    claims = claimResult.data || [];
    reminders = reminderResult.data || [];
  }

  const claimByEntitlement = new Map();
  claims.forEach(claim => {
    const key = String(claim.entitlement_id || "");
    if (key && !claimByEntitlement.has(key)) {
      claimByEntitlement.set(key, claim);
    }
  });
  const reminderByEntitlement = new Map();
  reminders.forEach(reminder => {
    const key = String(reminder.membership_id || "");
    if (key && !reminderByEntitlement.has(key)) {
      reminderByEntitlement.set(key, reminder);
    }
  });

  const adminIds = Array.from(new Set(recentEntitlements
    .flatMap(item => {
      const entitlement = item.entitlement;
      const reminder = reminderByEntitlement.get(String(entitlement.id));
      return [
        entitlement.advisor_admin_id,
        entitlement.created_by_admin_id,
        entitlement.granted_by_admin_id,
        reminder?.advisor_admin_id
      ];
    })
    .filter(Boolean)
    .map(String)));
  let adminById = new Map();
  if (adminIds.length) {
    const { data: admins, error: adminError } = await supabase
      .from("admin_users")
      .select("id, name, username, email")
      .in("id", adminIds);
    if (adminError) {
      throw adminError;
    }
    adminById = new Map((admins || []).map(admin => [String(admin.id), admin]));
  }

  ok(res, {
    items: recentEntitlements.map(item => {
      const entitlement = item.entitlement;
      const reminder = reminderByEntitlement.get(String(entitlement.id)) || null;
      const advisorId = entitlement.advisor_admin_id
        || entitlement.created_by_admin_id
        || entitlement.granted_by_admin_id
        || reminder?.advisor_admin_id
        || null;
      return {
        id: entitlement.id,
        membership_id: entitlement.id,
        membership_cycle: entitlement.membership_cycle,
        status: entitlement.status,
        birthday_month: entitlement.birthday_month,
        birthday_day: entitlement.birthday_day,
        birthday_date: item.birthdayDate.toISOString().slice(0, 10),
        days_ago: item.daysAgo,
        user: userById.get(String(entitlement.site_user_id)) || null,
        claim: claimByEntitlement.get(String(entitlement.id)) || null,
        advisor: advisorId ? adminById.get(String(advisorId)) || null : null,
        last_birthday_reminder: reminder
      };
    }),
    range: {
      days,
      cycle,
      today: today.toISOString().slice(0, 10)
    }
  });
}

async function handleMembershipCodes(req, res, supabase, codeId = "", subAction = "") {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const actionCodeId = codeId || String(req.query?.id || req.query?.code_id || "").trim();
  const action = subAction || String(req.query?.action || req.query?.code_action || "").trim();

  if (!actionCodeId && req.method === "GET") {
    ok(res, await listMembershipActivationCodes(supabase, req.query || {}));
    return;
  }

  if (!actionCodeId && req.method === "POST") {
    const body = await parseJsonBody(req);
    try {
      const count = Number(body.count || body.quantity || 1);
      const payload = {
        membership_cycle: body.membership_cycle || getCurrentMembershipCycle(),
        bound_email: body.bound_email || null,
        bound_phone: body.bound_phone || null,
        booking_reference: body.booking_reference || null,
        benefit_type: body.benefit_type || null,
        notes: body.notes || null,
        expires_at: body.expires_at || null
      };
      const result = count > 1
        ? await createMembershipActivationCodes(supabase, { ...payload, count }, adminUser.id)
        : await createMembershipActivationCode(supabase, payload, adminUser.id);
      created(res, result);
    } catch (error) {
      badRequest(res, error.message);
    }
    return;
  }

  if (actionCodeId && action === "revoke") {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }
    const body = await parseJsonBody(req);
    try {
      ok(res, {
        activationCode: await revokeMembershipActivationCode(supabase, actionCodeId, adminUser.id, body.reason || body.note || "")
      });
    } catch (error) {
      badRequest(res, error.message);
    }
    return;
  }

  if (actionCodeId && !action && req.method === "DELETE") {
    try {
      ok(res, await deleteMembershipActivationCode(supabase, actionCodeId, adminUser.id));
    } catch (error) {
      badRequest(res, error.message);
    }
    return;
  }

  methodNotAllowed(res, ["GET", "POST", "DELETE"]);
}

async function handleCommunityPosts(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  const postId = String(req.query?.id || req.query?.post_id || "").trim();
  if (req.method === "GET") {
    if (postId) {
      const detail = await getCommunityPostDetail(supabase, postId);
      if (!detail) {
        badRequest(res, "社区帖子不存在");
        return;
      }
      ok(res, detail);
      return;
    }
    ok(res, await listCommunityPosts(supabase, req.query || {}));
    return;
  }
  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    try {
      ok(res, { post: await updateCommunityPost(supabase, postId, body) });
    } catch (error) {
      badRequest(res, error.message || "社区帖子更新失败");
    }
    return;
  }
  methodNotAllowed(res, ["GET", "PATCH"]);
}

async function handleCommunityComments(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  const commentId = String(req.query?.id || req.query?.comment_id || "").trim();
  if (req.method === "GET") {
    if (commentId && String(req.query?.include_reports || "") === "1") {
      ok(res, { reports: await listCommentReports(supabase, commentId) });
      return;
    }
    ok(res, await listCommunityComments(supabase, req.query || {}));
    return;
  }
  if (req.method === "PATCH") {
    const body = await parseJsonBody(req);
    try {
      ok(res, { comment: await updateCommunityComment(supabase, commentId, body) });
    } catch (error) {
      badRequest(res, error.message || "社区评论更新失败");
    }
    return;
  }
  methodNotAllowed(res, ["GET", "PATCH"]);
}

async function handleCommunityImages(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  if (req.method !== "DELETE") {
    methodNotAllowed(res, ["DELETE"]);
    return;
  }
  const imageId = String(req.query?.id || req.query?.image_id || "").trim();
  try {
    ok(res, { image: await deleteCommunityImage(supabase, imageId) });
  } catch (error) {
    badRequest(res, error.message || "社区图片删除失败");
  }
}

async function handleCommunityUsers(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  if (req.method !== "PATCH") {
    methodNotAllowed(res, ["PATCH"]);
    return;
  }
  const userId = String(req.query?.id || req.query?.user_id || "").trim();
  const body = await parseJsonBody(req);
  try {
    ok(res, { user: await banCommunityUser(supabase, userId, body) });
  } catch (error) {
    badRequest(res, error.message || "社区用户风控更新失败");
  }
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
    if (head === "storage-orders-export") {
      await handleStorageOrdersExport(req, res, supabase);
      return;
    }
    if (head === "storage-orders") {
      await handleStorageOrders(req, res, supabase);
      return;
    }
    if (head === "postage-orders") {
      const adminUser = await requireAdminUser(req, res, supabase);
      if (!adminUser) {
        return;
      }
      await handlePostageOrders(req, res, supabase, adminUser);
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
    if (head === "membership-birthdays") {
      await handleMembershipBirthdays(req, res, supabase);
      return;
    }
    if (head === "membership-codes") {
      await handleMembershipCodes(req, res, supabase, second || "", third || "");
      return;
    }
    if (head === "community-posts") {
      await handleCommunityPosts(req, res, supabase);
      return;
    }
    if (head === "community-comments") {
      await handleCommunityComments(req, res, supabase);
      return;
    }
    if (head === "community-images") {
      await handleCommunityImages(req, res, supabase);
      return;
    }
    if (head === "community-users") {
      await handleCommunityUsers(req, res, supabase);
      return;
    }
    if (head === "transport-groups" || head === "transport-dispatch") {
      await transportGroupsHandler(req, res);
      return;
    }

    methodNotAllowed(res, []);
  } catch (error) {
    serverError(res, error);
  }
};
