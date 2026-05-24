const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { serverError, methodNotAllowed } = require("../_lib/http");
const { applyRequestFilters, deriveRequestDisplayFlags } = require("../_lib/transport");

const REQUEST_EXPORT_SELECT = [
  "id",
  "order_no",
  "student_name",
  "email",
  "phone",
  "wechat",
  "site_user_id",
  "service_type",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "preferred_time_start",
  "location_from",
  "location_to",
  "admin_note",
  "contact_status",
  "payment_collection_status",
  "deposit_amount_gbp",
  "offline_recorded",
  "last_operated_by",
  "last_operated_at",
  "membership_benefit_claim_id",
  "membership_discount_amount",
  "created_at",
  "transport_group_members(group_id,is_initiator,request_id)",
  "site_users(email)"
].join(", ");

const MEMBERSHIP_COLUMNS = new Set([
  "membership_benefit_claim_id",
  "membership_discount_amount"
]);

const REQUEST_EXPORT_SELECT_LEGACY = REQUEST_EXPORT_SELECT
  .split(", ")
  .filter(column => !MEMBERSHIP_COLUMNS.has(column))
  .join(", ");

function isMissingMembershipColumnError(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return [
    "transport_requests.membership_benefit_claim_id",
    "transport_requests.membership_discount_amount"
  ].some(marker => message.includes(marker));
}

function applyRequestSort(query, value) {
  const sort = String(value || "submitted_latest").trim();

  if (sort === "submitted_oldest") {
    query.order("created_at", { ascending: true }).order("flight_datetime", { ascending: true });
    return;
  }

  if (sort === "flight_nearest") {
    query.order("flight_datetime", { ascending: true }).order("created_at", { ascending: false });
    return;
  }

  if (sort === "flight_latest") {
    query.order("flight_datetime", { ascending: false }).order("created_at", { ascending: false });
    return;
  }

  query.order("created_at", { ascending: false }).order("flight_datetime", { ascending: false });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  const hour = parts.find(part => part.type === "hour")?.value;
  const minute = parts.find(part => part.type === "minute")?.value;
  return year && month && day && hour && minute ? `${year}-${month}-${day} ${hour}:${minute}` : "";
}

function formatExcelTextDateTime(value) {
  const text = formatDateTime(value);
  return text ? `="${text}"` : "";
}

function serviceLabel(value) {
  return value === "dropoff" ? "送机" : "接机";
}

function contactStatusLabel(value) {
  return value === "contacted" ? "已联系" : "未联系";
}

function paymentCollectionStatusLabel(value) {
  const labels = {
    unpaid: "未收款",
    deposit_paid: "已付定金",
    fully_paid: "已付全款"
  };
  return labels[value] || labels.unpaid;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : String(value);
}

function buildRows(items) {
  return (items || []).map(item => ({
    "提交时间": formatExcelTextDateTime(item.created_at),
    "Order No": item.order_no || "",
    "学生": item.student_name || "",
    "电话": item.phone || "",
    "微信号": item.wechat || "",
    "服务": serviceLabel(item.service_type),
    "机场": item.airport_code || "",
    "航站楼": item.terminal || "",
    "航班": item.flight_no || "",
    "航班日期和时间": formatExcelTextDateTime(item.flight_datetime),
    "服务日期和时间": formatExcelTextDateTime(item.preferred_time_start || item.flight_datetime),
    "出发地": item.location_from || "",
    "目的地": item.location_to || "",
    "联系状态": contactStatusLabel(item.contact_status),
    "收款状态": paymentCollectionStatusLabel(item.payment_collection_status),
    "定金GBP": formatMoney(item.deposit_amount_gbp),
    "线下记录": item.offline_recorded ? "已记录" : "未记录",
    "客服备注": item.admin_note || "",
    "上次操作人": item.last_operated_by || "",
    "上次操作时间": formatExcelTextDateTime(item.last_operated_at),
    "Group ID": item.group_id || ""
  }));
}

function buildFilename(queryParams) {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0")
  ].join("");
  const servicePart = queryParams.service_type ? `-${queryParams.service_type}` : "";
  return `transport-requests${servicePart}-${stamp}.csv`;
}

function parseIdList(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 5000);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [
    "提交时间",
    "Order No",
    "学生",
    "电话",
    "微信号",
    "服务",
    "机场",
    "航站楼",
    "航班",
    "航班日期和时间",
    "服务日期和时间",
    "出发地",
    "目的地",
    "联系状态",
    "收款状态",
    "定金GBP",
    "线下记录",
    "客服备注",
    "上次操作人",
    "上次操作时间",
    "Group ID"
  ];
  const lines = [
    columns.map(csvEscape).join(","),
    ...rows.map(row => columns.map(column => csvEscape(row[column])).join(","))
  ];
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  try {
    const queryParams = req.query || {};
    const buildQuery = selectColumns => {
      let query = supabase
        .from("transport_requests")
        .select(selectColumns)
        .limit(5000);

      const ids = parseIdList(queryParams.ids);
      if (ids.length) {
        query.in("id", ids);
      } else {
        applyRequestFilters(query, queryParams);
      }
      applyRequestSort(query, queryParams.sort);

      if (!ids.length && queryParams.grouped === "true") {
        query.not("transport_group_members", "is", null);
      }
      if (!ids.length && queryParams.grouped === "false") {
        query.is("transport_group_members", null);
      }

      return query;
    };

    let { data, error } = await buildQuery(REQUEST_EXPORT_SELECT);
    if (error && isMissingMembershipColumnError(error)) {
      ({ data, error } = await buildQuery(REQUEST_EXPORT_SELECT_LEGACY));
    }
    if (error) {
      throw error;
    }

    const items = (data || []).map(item => deriveRequestDisplayFlags(item));
    const rows = buildRows(items);
    const csv = rowsToCsv(rows);

    const filename = buildFilename(queryParams);
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.end(Buffer.from(csv, "utf8"));
  } catch (error) {
    serverError(res, error);
  }
};
