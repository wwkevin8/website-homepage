const { unauthorized, forbidden } = require("./http");
const { hashPassword, getAdminSessionToken } = require("./admin-security");

const ADMIN_ROLES = {
  super_admin: "超级管理员",
  operations_admin: "运营管理员"
};

const ADMIN_STATUSES = {
  active: "启用",
  disabled: "停用"
};

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").trim();
}

function getRolePermissions(role) {
  return {
    canViewAdminManagers: role === "super_admin",
    canManageAdmins: role === "super_admin",
    canManageBusiness: role === "super_admin" || role === "operations_admin"
  };
}

function serializeAdmin(admin) {
  if (!admin) {
    return null;
  }

  return {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    email: admin.email,
    phone: admin.phone,
    role: admin.role,
    role_label: ADMIN_ROLES[admin.role] || admin.role,
    status: admin.status,
    status_label: ADMIN_STATUSES[admin.status] || admin.status,
    created_at: admin.created_at,
    updated_at: admin.updated_at,
    last_login_at: admin.last_login_at
  };
}

async function ensureBootstrapSuperAdmin(supabase) {
  const username = normalizeUsername(process.env.ADMIN_BOOTSTRAP_USERNAME);
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "").trim();

  if (!username || !password) {
    return;
  }

  const payload = {
    username,
    name: String(process.env.ADMIN_BOOTSTRAP_NAME || "系统管理员").trim() || "系统管理员",
    email: normalizeEmail(process.env.ADMIN_BOOTSTRAP_EMAIL) || null,
    phone: null,
    role: "super_admin",
    status: "active",
    password_hash: hashPassword(password)
  };

  const { data: existing, error: existingError } = await supabase
    .from("admin_users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  // Keep the configured bootstrap account aligned with the local env values.
  if (existing) {
    const { error: updateError } = await supabase
      .from("admin_users")
      .update(payload)
      .eq("id", existing.id);

    if (updateError) {
      throw updateError;
    }
    return;
  }

  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "active");

  if (error) {
    throw error;
  }

  if (Number(count || 0) > 0) {
    return;
  }

  const { error: insertError } = await supabase.from("admin_users").insert(payload);
  if (insertError) {
    throw insertError;
  }
}

async function getAdminById(supabase, adminId) {
  if (!adminId) {
    return null;
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, username, name, email, phone, role, status, created_at, updated_at, last_login_at")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getAdminSession(req, supabase) {
  await ensureBootstrapSuperAdmin(supabase);

  const token = getAdminSessionToken(req);
  if (!token || !token.adminId) {
    return {
      authenticated: false,
      is_admin: false,
      admin: null,
      permissions: getRolePermissions(null)
    };
  }

  const admin = await getAdminById(supabase, token.adminId);
  if (!admin || admin.status !== "active") {
    return {
      authenticated: false,
      is_admin: false,
      admin: null,
      permissions: getRolePermissions(null)
    };
  }

  return {
    authenticated: true,
    is_admin: true,
    admin: serializeAdmin(admin),
    permissions: getRolePermissions(admin.role)
  };
}

async function requireAdminUser(req, res, supabase, options = {}) {
  const session = await getAdminSession(req, supabase);

  if (!session.authenticated || !session.admin) {
    unauthorized(res, "请先登录后台账号");
    return null;
  }

  if (options.roles && !options.roles.includes(session.admin.role)) {
    forbidden(res, "您没有执行该操作的权限");
    return null;
  }

  return session.admin;
}

module.exports = {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  normalizeUsername,
  normalizeEmail,
  normalizePhone,
  getRolePermissions,
  serializeAdmin,
  ensureBootstrapSuperAdmin,
  getAdminById,
  getAdminSession,
  requireAdminUser
};
