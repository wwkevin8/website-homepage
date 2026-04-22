const ORDER_SOURCE_STATUS_MAP = {
  storage_orders: ["pending_confirmation", "confirmed", "cancelled"],
  transport_requests: ["draft", "open", "closed", "cancelled"]
};

const ORDER_TERMINAL_STATUSES = new Set(["confirmed", "closed", "cancelled"]);

function normalizeString(value) {
  return String(value || "").trim();
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePageSize(value, fallback = 10) {
  const parsed = parsePositiveInteger(value, fallback);
  return [10, 20, 50].includes(parsed) ? parsed : fallback;
}

function parseArchivedMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "archived") {
    return "archived";
  }
  if (normalized === "all") {
    return "all";
  }
  return "active";
}

function parseSortOrder(value) {
  return normalizeString(value).toLowerCase() === "oldest" ? "oldest" : "latest";
}

function applyOrdersFilters(query, filters = {}) {
  const orderNo = normalizeString(filters.order_no).toUpperCase();
  const customerName = normalizeString(filters.customer_name);
  const phone = normalizeString(filters.phone);
  const serviceType = normalizeString(filters.service_type);
  const status = normalizeString(filters.status);
  const createdFrom = normalizeString(filters.created_from || filters.date_from);
  const createdTo = normalizeString(filters.created_to || filters.date_to);
  const archived = parseArchivedMode(filters.archived);
  const search = normalizeString(filters.search);

  if (archived === "active") {
    query.eq("archived", false);
  } else if (archived === "archived") {
    query.eq("archived", true);
  }

  if (orderNo) {
    query.ilike("order_no", `%${orderNo}%`);
  }
  if (customerName) {
    query.ilike("customer_name", `%${customerName}%`);
  }
  if (phone) {
    query.ilike("phone", `%${phone}%`);
  }
  if (serviceType) {
    query.eq("service_type", serviceType);
  }
  if (status) {
    query.eq("status", status);
  }
  if (createdFrom) {
    query.gte("created_at", `${createdFrom}T00:00:00.000Z`);
  }
  if (createdTo) {
    query.lte("created_at", `${createdTo}T23:59:59.999Z`);
  }
  if (search) {
    const safe = search.replace(/,/g, " ").trim();
    query.or(`order_no.ilike.%${safe}%,customer_name.ilike.%${safe}%,phone.ilike.%${safe}%,wechat_or_whatsapp.ilike.%${safe}%`);
  }
}

function buildOrdersListQuery(supabase, filters = {}) {
  const sort = parseSortOrder(filters.sort);
  const ascending = sort === "oldest";
  const query = supabase
    .from("orders")
    .select("id, source_table, source_id, order_no, user_id, service_type, customer_name, phone, wechat_or_whatsapp, status, flight_no, pickup_date, storage_start_date, storage_end_date, archived, archived_at, completed_at, latest_note_at, created_at, updated_at", { count: "exact" })
    .order("created_at", { ascending });

  applyOrdersFilters(query, filters);
  return query;
}

function getAllowedStatuses(sourceTable) {
  return ORDER_SOURCE_STATUS_MAP[sourceTable] || [];
}

function assertStatusAllowed(sourceTable, status) {
  const nextStatus = normalizeString(status);
  if (!nextStatus) {
    throw new Error("status is required");
  }
  if (!getAllowedStatuses(sourceTable).includes(nextStatus)) {
    throw new Error("status is invalid for this order type");
  }
  return nextStatus;
}

function assertNotePayload(body) {
  const note = normalizeString(body.note);
  if (!note) {
    throw new Error("note is required");
  }
  return {
    note,
    note_type: normalizeString(body.note_type) || "admin"
  };
}

function assertContactPayload(body) {
  const customerName = normalizeString(body.customer_name);
  const phone = normalizeString(body.phone);
  const contact = normalizeString(body.wechat_or_whatsapp);

  if (!customerName) {
    throw new Error("customer_name is required");
  }

  return {
    customer_name: customerName,
    phone: phone || null,
    wechat_or_whatsapp: contact || null
  };
}

async function logAdminOperation(supabase, payload) {
  const record = {
    admin_user_id: payload.admin_user_id || null,
    order_id: payload.order_id || null,
    target_type: payload.target_type || "order",
    target_id: payload.target_id || payload.order_id || null,
    action: payload.action,
    before_data: payload.before_data || null,
    after_data: payload.after_data || null,
    metadata: payload.metadata || {}
  };

  const { error } = await supabase.from("admin_operation_logs").insert(record);
  if (error) {
    throw error;
  }
}

async function getOrderById(supabase, orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, source_table, source_id, order_no, user_id, service_type, customer_name, phone, wechat_or_whatsapp, status, flight_no, pickup_date, storage_start_date, storage_end_date, archived, archived_at, completed_at, latest_note_at, created_at, updated_at, legacy_payload")
    .eq("id", orderId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchOrderDetail(supabase, orderId) {
  const order = await getOrderById(supabase, orderId);

  const [statusLogsResult, notesResult, operationLogsResult, attachmentsResult] = await Promise.all([
    supabase
      .from("order_status_logs")
      .select("id, status, previous_status, changed_at, change_source, metadata, changed_by_admin_id, changed_by_admin:admin_users(id, name, username)")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: false }),
    supabase
      .from("order_notes")
      .select("id, note, note_type, created_at, updated_at, created_by_admin_id, created_by_admin:admin_users(id, name, username)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("admin_operation_logs")
      .select("id, action, before_data, after_data, metadata, created_at, admin_user_id, admin_user:admin_users(id, name, username)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("order_attachments")
      .select("id, file_name, file_url, mime_type, file_size_bytes, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
  ]);

  const failed = [statusLogsResult, notesResult, operationLogsResult, attachmentsResult].find(result => result.error);
  if (failed) {
    throw failed.error;
  }

  return {
    order,
    status_logs: statusLogsResult.data || [],
    notes: notesResult.data || [],
    operation_logs: operationLogsResult.data || [],
    attachments: attachmentsResult.data || []
  };
}

async function updateOrderSourceRecord(supabase, order, payload) {
  const nextStatus = payload.status ? assertStatusAllowed(order.source_table, payload.status) : null;
  const updates = {};

  if (nextStatus) {
    updates.status = nextStatus;
  }

  if (payload.customer_name !== undefined || payload.phone !== undefined || payload.wechat_or_whatsapp !== undefined) {
    const contact = assertContactPayload(payload);
    if (order.source_table === "storage_orders") {
      updates.customer_name = contact.customer_name;
      updates.phone = contact.phone;
      updates.wechat_id = contact.wechat_or_whatsapp;
    } else if (order.source_table === "transport_requests") {
      updates.student_name = contact.customer_name;
      updates.phone = contact.phone;
      updates.wechat = contact.wechat_or_whatsapp;
    }
  }

  if (!Object.keys(updates).length) {
    throw new Error("No valid changes provided");
  }

  const tableName = order.source_table;
  const { error } = await supabase
    .from(tableName)
    .update(updates)
    .eq("id", order.source_id);

  if (error) {
    throw error;
  }

  return getOrderById(supabase, order.id);
}

async function createOrderNote(supabase, orderId, adminUserId, body) {
  const payload = assertNotePayload(body);
  const { data, error } = await supabase
    .from("order_notes")
    .insert({
      order_id: orderId,
      note: payload.note,
      note_type: payload.note_type,
      created_by_admin_id: adminUserId || null
    })
    .select("id, note, note_type, created_at, updated_at, created_by_admin_id, created_by_admin:admin_users(id, name, username)")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function setOrderArchivedState(supabase, orderId, archived) {
  const patch = archived
    ? { archived: true, archived_at: new Date().toISOString() }
    : { archived: false, archived_at: null };

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("id, archived, archived_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function bulkArchiveOrders(supabase, olderThanMonths) {
  const months = Math.max(parsePositiveInteger(olderThanMonths, 6), 1);
  const { data, error } = await supabase.rpc("archive_orders_older_than", {
    older_than_months: months
  });

  if (error) {
    throw error;
  }

  return Number(data || 0);
}

function isTerminalStatus(status) {
  return ORDER_TERMINAL_STATUSES.has(status);
}

module.exports = {
  parsePositiveInteger,
  parsePageSize,
  parseArchivedMode,
  parseSortOrder,
  buildOrdersListQuery,
  getAllowedStatuses,
  assertStatusAllowed,
  assertContactPayload,
  assertNotePayload,
  logAdminOperation,
  getOrderById,
  fetchOrderDetail,
  updateOrderSourceRecord,
  createOrderNote,
  setOrderArchivedState,
  bulkArchiveOrders,
  isTerminalStatus
};
