const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, created, badRequest, unauthorized, methodNotAllowed, serverError, parseJsonBody } = require("../_lib/http");
const { getAdminSession, ensureBootstrapSuperAdmin, serializeAdmin, getRolePermissions, requireAdminUser } = require("../_lib/admin-auth");
const {
  clearAdminSessionCookie,
  setAdminSessionCookie,
  createAdminSessionToken,
  verifyPassword
} = require("../_lib/admin-security");
const {
  mapManagerCreatePayload,
  mapManagerUpdatePayload,
  buildManagerFilters,
  serializeManagerList,
  createTemporaryPasswordPayload,
  assertManagerMutationAllowed
} = require("../_lib/admin-managers");
const { buildStorageOrderAdminFilters } = require("../_lib/storage-orders");

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
      return [value];
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

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
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
  const [adminsResult, usersResult, loginEventsResult, transportRequestsResult, pendingResult, storagePendingResult] = await Promise.all([
    supabase.from("admin_users").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("site_users").select("id", { count: "exact", head: true }),
    supabase.from("user_login_events").select("id", { count: "exact", head: true }).gte("login_at", sevenDaysAgo),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }),
    supabase.from("transport_requests").select("id", { count: "exact", head: true }).in("status", ["draft", "open"]),
    supabase.from("storage_orders").select("id", { count: "exact", head: true }).eq("status", "pending_confirmation")
  ]);

  const failed = [adminsResult, usersResult, loginEventsResult, transportRequestsResult, pendingResult, storagePendingResult].find(result => result.error);
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
      storage_orders_pending: storagePendingResult.count || 0
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
  const pageSize = Math.min(parsePositiveInteger(queryParams.page_size, 20), 100);
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
  const pageSize = Math.min(parsePositiveInteger(queryParams.page_size, 20), 100);
  const search = String(queryParams.search || "").trim();
  const provider = String(queryParams.provider || "").trim().toLowerCase();

  let query = supabase
    .from("site_users")
    .select("id, email, nickname, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at", { count: "exact" })
    .order("last_login_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (search) {
    if (search.includes(",")) {
      badRequest(res, "关键词不能包含逗号");
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

async function handleManagersList(req, res, supabase) {
  const adminUser = await requireAdminUser(req, res, supabase, { roles: ["super_admin"] });
  if (!adminUser) {
    return;
  }

  if (req.method === "GET") {
    const queryParams = req.query || {};
    const page = parsePositiveInteger(queryParams.page, 1);
    const pageSize = Math.min(parsePositiveInteger(queryParams.page_size, 20), 100);
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
    created(res, { manager: serializeAdmin(data), message: "新增成功" });
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
    if (req.method !== "PATCH") {
      methodNotAllowed(res, ["PATCH"]);
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
    ok(res, { manager: serializeAdmin(data), message: "保存成功" });
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

  if (subAction === "enable") {
    const { data, error } = await supabase
      .from("admin_users")
      .update({ status: "active" })
      .eq("id", id)
      .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at")
      .single();
    if (error) {
      throw error;
    }
    ok(res, { manager: serializeAdmin(data), message: "启用成功" });
    return;
  }

  if (subAction === "disable") {
    try {
      await assertManagerMutationAllowed(supabase, adminUser, target, { role: target.role, status: "disabled" });
    } catch (error) {
      badRequest(res, error.message);
      return;
    }
    const { data, error } = await supabase
      .from("admin_users")
      .update({ status: "disabled" })
      .eq("id", id)
      .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at")
      .single();
    if (error) {
      throw error;
    }
    ok(res, { manager: serializeAdmin(data), message: "停用成功" });
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
