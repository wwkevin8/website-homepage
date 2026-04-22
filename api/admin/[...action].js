const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, created, badRequest, unauthorized, methodNotAllowed, serverError, parseJsonBody } = require("../_lib/http");
const { getAdminSession, ensureBootstrapSuperAdmin, serializeAdmin, getRolePermissions, requireAdminUser } = require("../_lib/admin-auth");
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
  updateOrderSourceRecord,
  createOrderNote,
  setOrderArchivedState,
  bulkArchiveOrders,
  logAdminOperation
} = require("../_lib/orders");

function parseActionParts(req) {
  const candidates = [
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

async function handleLogin(req, res, supabase) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const body = await parseJsonBody(req);
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!username || !password) {
    badRequest(res, "请输入账号和密码");
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
  clearAdminSessionCookie(res);
  ok(res, { authenticated: false, is_admin: false, admin: null, permissions: null });
}

async function handleSession(req, res, supabase) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }
  const session = await getAdminSession(req, supabase);
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
    badRequest(res, "鏂板瘑鐮佷笉鑳戒笌褰撳墠瀵嗙爜鐩稿悓");
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
    badRequest(res, "褰撳墠瀵嗙爜閿欒");
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

  ok(res, { changed: true, message: "瀵嗙爜淇敼鎴愬姛" });
}

async function handleDashboard(req, res, supabase) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [adminsResult, usersResult, loginEventsResult, transportRequestsResult, pendingResult, storagePendingResult, activeOrdersResult, archivedOrdersResult] = await Promise.all([
    supabase.from("admin_users").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("user_login_events").select("id", { count: "exact", head: true }).gte("login_at", sevenDaysAgo),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }).in("status", ["draft", "open"]),
    supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("archived", false),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("archived", true)
  ]);

  const failed = [adminsResult, usersResult, loginEventsResult, transportRequestsResult, pendingResult, storagePendingResult, activeOrdersResult, archivedOrdersResult].find(result => result.error);
  if (failed) {
    throw failed.error;
  }

  ok(res, {
    viewer: adminUser,
    cards: {
      active_admins: adminsResult.count || 0,
      total_users: usersResult.count || 0,
      logins_last_7_days: loginEventsResult.count || 0,
      transport_requests_total: transportRequestsResult.count || 0,
      transport_requests_pending: pendingResult.count || 0,
      storage_orders_pending: storagePendingResult.count || 0,
      active_orders_total: activeOrdersResult.count || 0,
      archived_orders_total: archivedOrdersResult.count || 0
    }
  });
}

async function handleStorageOrders(req, res, supabase) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 20);
  let query = supabase
    .from("storage_orders")
    .select("id, order_no, customer_name, wechat_id, phone, address_full, service_date, service_time, service_label, estimated_box_count, estimated_total_price, friend_pickup, friend_phone, notes, final_readable_message, status, notification_status, notification_error, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  buildStorageOrderAdminFilters(query, queryParams);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw error;
  }

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

async function handleUsers(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase);
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

    const { data, error } = await supabase
      .from("users")
      .select("id, email, nickname, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      badRequest(res, "鏈壘鍒拌鐢ㄦ埛");
      return;
    }

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

  let query = supabase
    .from("users")
    .select("id, email, nickname, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at", { count: "exact" })
    .order("last_login_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (search) {
    if (search.includes(",")) {
      badRequest(res, "鍏抽敭璇嶄笉鑳藉寘鍚€楀彿");
      return;
    }
    query = query.or(`email.ilike.%${search}%,nickname.ilike.%${search}%`);
  }

  if (provider) {
    query = query.eq("last_login_provider", provider);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw error;
  }

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
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const queryParams = req.query || {};
  const page = parsePositiveInteger(queryParams.page, 1);
  const pageSize = parsePageSize(queryParams.page_size, 20);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const query = buildOrdersListQuery(supabase, queryParams).range(from, to);
  const { data, error, count } = await query;
  if (error) {
    throw error;
  }

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
  const adminUser = await requireAdminUser(req, res, supabase, { roles: ["super_admin"] });
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
    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw error;
    }
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
    created(res, { manager: serializeAdmin(data), message: "鏂板鎴愬姛" });
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

      ok(res, { deleted: true, id, message: "鍒犻櫎鎴愬姛" });
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
    ok(res, { manager: serializeAdmin(data), message: "淇濆瓨鎴愬姛" });
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
    ok(res, { temporary_password: nextPassword.temporaryPassword, message: "密码已重置" });
    return;
  }

  methodNotAllowed(res, []);
}

module.exports = async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    await ensureBootstrapSuperAdmin(supabase);
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

    methodNotAllowed(res, []);
  } catch (error) {
    serverError(res, error);
  }
};
