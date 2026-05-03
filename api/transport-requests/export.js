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
  "location_to",
  "created_at",
  "transport_group_members(group_id,is_initiator,request_id)",
  "site_users(email)"
].join(", ");

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

function serviceLabel(value) {
  return value === "dropoff" ? "送机" : "接机";
}

function buildRows(items) {
  return (items || []).map(item => ({
    "提交时间": formatDateTime(item.created_at),
    "Order No": item.order_no || "",
    "学生": item.student_name || "",
    "微信号": item.wechat || "",
    "服务": serviceLabel(item.service_type),
    "机场": item.airport_code || "",
    "航班": item.flight_no || "",
    "您抵达/起飞日期和时间": formatDateTime(item.flight_datetime),
    "目的地": item.location_to || "",
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
    "微信号",
    "服务",
    "机场",
    "航班",
    "您抵达/起飞日期和时间",
    "目的地",
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
    let query = supabase
      .from("transport_requests")
      .select(REQUEST_EXPORT_SELECT)
      .limit(5000);

    applyRequestFilters(query, queryParams);
    applyRequestSort(query, queryParams.sort);

    if (queryParams.grouped === "true") {
      query.not("transport_group_members", "is", null);
    }
    if (queryParams.grouped === "false") {
      query.is("transport_group_members", null);
    }

    const { data, error } = await query;
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
