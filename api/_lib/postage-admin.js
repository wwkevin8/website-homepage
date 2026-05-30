const { ok, badRequest, methodNotAllowed, parseJsonBody } = require("./http");
const {
  BOX_DELIVERY_STATUSES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  calculateFinalTotal,
  formatPostageOrder,
  mapPostageOrderPatch
} = require("./postage-orders");

const LIST_COLUMNS = "*";

function text(value) {
  return String(value ?? "").trim();
}

function parsePositiveInteger(value, fallback, max) {
  const number = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return max ? Math.min(number, max) : number;
}

function getUkDateInput(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateText, days) {
  const [year, month, day] = String(dateText || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function sanitizeSearch(value) {
  return text(value).replace(/[%(),]/g, " ").replace(/\s+/g, " ").slice(0, 120);
}

function applyQuickFilter(query, quickFilter) {
  const today = getUkDateInput();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  switch (quickFilter) {
    case "box_delivery_today":
      return query.eq("preferred_box_delivery_date", today);
    case "box_delivery_tomorrow":
      return query.eq("preferred_box_delivery_date", tomorrow);
    case "box_delivery_this_week":
      return query.gte("preferred_box_delivery_date", today).lte("preferred_box_delivery_date", weekEnd);
    case "pickup_today":
      return query.eq("preferred_pickup_date", today);
    case "pickup_tomorrow":
      return query.eq("preferred_pickup_date", tomorrow);
    case "pickup_this_week":
      return query.gte("preferred_pickup_date", today).lte("preferred_pickup_date", weekEnd);
    case "sensitive":
      return query.eq("has_sensitive_items", true);
    case "need_boxes":
      return query.eq("need_boxes", true);
    case "need_box_delivery_upstairs":
      return query.eq("box_delivery_need_upstairs", true);
    case "need_pickup_upstairs":
      return query.eq("pickup_need_upstairs", true);
    case "unassigned":
      return query.is("assigned_to", null);
    case "has_note":
      return query.not("internal_note", "is", null);
    case "missing_logistics":
      return query.is("tracking_number", null).neq("status", "cancelled");
    case "missing_final_total":
      return query.is("final_total", null).neq("status", "cancelled");
    case "pending_payment":
      return query.eq("payment_status", "unpaid").neq("status", "cancelled");
    default:
      return query;
  }
}

function applyListFilters(query, params) {
  const status = text(params.status);
  const boxDeliveryStatus = text(params.box_delivery_status);
  const paymentStatus = text(params.payment_status);
  const assignedTo = text(params.assigned_to);
  const search = sanitizeSearch(params.search || params.keyword || params.q);
  const quickFilter = text(params.quick_filter);

  if (status && ORDER_STATUSES.includes(status)) query = query.eq("status", status);
  if (boxDeliveryStatus && BOX_DELIVERY_STATUSES.includes(boxDeliveryStatus)) query = query.eq("box_delivery_status", boxDeliveryStatus);
  if (paymentStatus && PAYMENT_STATUSES.includes(paymentStatus)) query = query.eq("payment_status", paymentStatus);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (search) {
    const pattern = `*${search}*`;
    query = query.or([
      `order_no.ilike.${pattern}`,
      `customer_name.ilike.${pattern}`,
      `wechat_id.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `box_delivery_building.ilike.${pattern}`,
      `pickup_building.ilike.${pattern}`,
      `recipient_city.ilike.${pattern}`,
      `tracking_number.ilike.${pattern}`
    ].join(","));
  }
  return applyQuickFilter(query, quickFilter);
}

async function fetchPostageLogs(supabase, orderId) {
  const { data, error } = await supabase
    .from("postage_order_logs")
    .select("*")
    .eq("postage_order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.warn("[postage-admin] failed to fetch logs", error);
    return [];
  }
  return data || [];
}

function operatorName(adminUser = {}) {
  return adminUser.name || adminUser.username || adminUser.email || "admin";
}

async function writePostageLog(supabase, orderId, adminUser, action, beforeValue, afterValue) {
  const { error } = await supabase.from("postage_order_logs").insert({
    postage_order_id: orderId,
    action,
    before_value: beforeValue || null,
    after_value: afterValue || null,
    operator_id: adminUser?.id || null,
    operator_name: operatorName(adminUser)
  });
  if (error) {
    console.warn("[postage-admin] failed to write log", error);
  }
}

async function listPostageOrders(req, res, supabase) {
  const page = parsePositiveInteger(req.query?.page, 1);
  const pageSize = parsePositiveInteger(req.query?.page_size, 20, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const sort = text(req.query?.sort) || "created_desc";

  let query = supabase
    .from("postage_orders")
    .select(LIST_COLUMNS, { count: "exact" });
  query = applyListFilters(query, req.query || {});

  if (sort === "pickup_asc") {
    query = query.order("preferred_pickup_date", { ascending: true, nullsFirst: false });
  } else if (sort === "box_delivery_asc") {
    query = query.order("preferred_box_delivery_date", { ascending: true, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, count, error } = await query.range(from, to);
  if (error) throw error;

  ok(res, {
    items: (data || []).map(formatPostageOrder),
    page,
    page_size: pageSize,
    total: count || 0,
    total_pages: Math.ceil((count || 0) / pageSize),
    statuses: ORDER_STATUSES,
    box_delivery_statuses: BOX_DELIVERY_STATUSES,
    payment_statuses: PAYMENT_STATUSES
  });
}

async function getPostageOrder(req, res, supabase, orderId) {
  const { data, error } = await supabase
    .from("postage_orders")
    .select(LIST_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    badRequest(res, "Postage order not found");
    return;
  }
  const logs = await fetchPostageLogs(supabase, data.id);
  ok(res, { ...formatPostageOrder(data), logs });
}

async function updatePostageOrder(req, res, supabase, orderId, adminUser) {
  const body = await parseJsonBody(req);
  const { data: existing, error: existingError } = await supabase
    .from("postage_orders")
    .select(LIST_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) {
    badRequest(res, "Postage order not found");
    return;
  }

  let patch;
  try {
    patch = mapPostageOrderPatch(body);
  } catch (error) {
    badRequest(res, error.message);
    return;
  }

  const feeKeys = [
    "final_postage",
    "final_box_fee",
    "final_packing_fee",
    "box_delivery_fee",
    "box_delivery_upstairs_fee",
    "pickup_upstairs_fee",
    "other_fee",
    "discount"
  ];
  if (feeKeys.some(field => Object.prototype.hasOwnProperty.call(patch, field)) && !Object.prototype.hasOwnProperty.call(body, "final_total")) {
    patch.final_total = calculateFinalTotal({ ...existing, ...patch });
  }

  const { data, error } = await supabase
    .from("postage_orders")
    .update(patch)
    .eq("id", orderId)
    .select(LIST_COLUMNS)
    .single();
  if (error) throw error;

  await writePostageLog(supabase, orderId, adminUser, "postage_order_updated", existing, patch);
  const logs = await fetchPostageLogs(supabase, orderId);
  ok(res, { ...formatPostageOrder(data), logs });
}

async function handlePostageOrders(req, res, supabase, adminUser) {
  const id = text(req.query?.id || req.query?.postage_order_id);
  if (req.method === "GET") {
    if (id) {
      await getPostageOrder(req, res, supabase, id);
      return;
    }
    await listPostageOrders(req, res, supabase);
    return;
  }
  if (req.method === "PATCH") {
    if (!id) {
      badRequest(res, "postage order id is required");
      return;
    }
    await updatePostageOrder(req, res, supabase, id, adminUser);
    return;
  }
  methodNotAllowed(res, ["GET", "PATCH"]);
}

module.exports = {
  handlePostageOrders
};
