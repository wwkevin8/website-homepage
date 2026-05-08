const { unauthorized, forbidden } = require("./http");
const { hashPassword, getAdminSessionToken } = require("./admin-security");
const crypto = require("crypto");

const BOOTSTRAP_CACHE_TTL_MS = 10 * 60 * 1000;
const SESSION_CACHE_TTL_MS = 20 * 1000;
const SESSION_CACHE_MAX_SIZE = 500;

let bootstrapCheckedAt = 0;
let bootstrapPromise = null;
const sessionCache = new Map();

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
  console.info(`[perf][admin-auth] ${label}`, details);
}

function getSessionCacheKey(token) {
  if (!token || !token.adminId || !token.expiresAt) {
    return "";
  }
  return crypto
    .createHash("sha256")
    .update(`${token.adminId}:${token.expiresAt}`)
    .digest("hex");
}

function trimSessionCache() {
  const now = Date.now();
  for (const [key, entry] of sessionCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      sessionCache.delete(key);
    }
  }
  while (sessionCache.size > SESSION_CACHE_MAX_SIZE) {
    const firstKey = sessionCache.keys().next().value;
    if (!firstKey) {
      break;
    }
    sessionCache.delete(firstKey);
  }
}

function clearAdminSessionCache() {
  sessionCache.clear();
}

function clearAdminSessionCacheForAdmin(adminId) {
  if (!adminId) {
    return;
  }
  const safeAdminId = String(adminId);
  for (const [key, entry] of sessionCache.entries()) {
    if (String(entry?.adminId || "") === safeAdminId) {
      sessionCache.delete(key);
    }
  }
}

function clearAdminSessionCacheForRequest(req) {
  const token = getAdminSessionToken(req);
  const key = getSessionCacheKey(token);
  if (key) {
    sessionCache.delete(key);
  }
  if (token?.adminId) {
    clearAdminSessionCacheForAdmin(token.adminId);
  }
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

async function runBootstrapSuperAdmin(supabase) {
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

async function ensureBootstrapSuperAdmin(supabase, options = {}) {
  const username = normalizeUsername(process.env.ADMIN_BOOTSTRAP_USERNAME);
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "").trim();
  if (!username || !password) {
    return;
  }

  const force = Boolean(options.force);
  const ageMs = Date.now() - bootstrapCheckedAt;
  if (!force && bootstrapCheckedAt && ageMs < BOOTSTRAP_CACHE_TTL_MS) {
    logPerf("bootstrap.cache_hit", { ageMs, ttlMs: BOOTSTRAP_CACHE_TTL_MS });
    return;
  }

  if (!force && bootstrapPromise) {
    logPerf("bootstrap.wait_existing", { ttlMs: BOOTSTRAP_CACHE_TTL_MS });
    return bootstrapPromise;
  }

  const startedAt = nowMs();
  bootstrapPromise = runBootstrapSuperAdmin(supabase)
    .then(result => {
      bootstrapCheckedAt = Date.now();
      logPerf("bootstrap", {
        totalMs: nowMs() - startedAt,
        ttlMs: BOOTSTRAP_CACHE_TTL_MS
      });
      return result;
    })
    .finally(() => {
      bootstrapPromise = null;
    });

  return bootstrapPromise;
}

async function getAdminById(supabase, adminId) {
  if (!adminId) {
    return null;
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, username, name, email, role, status")
    .eq("id", adminId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function getAdminSession(req, supabase) {
  const startedAt = nowMs();
  const tokenStartedAt = nowMs();
  const token = getAdminSessionToken(req);
  const tokenMs = nowMs() - tokenStartedAt;
  if (!token || !token.adminId) {
    logPerf("session", {
      authenticated: false,
      cacheHit: false,
      tokenMs,
      lookupMs: 0,
      totalMs: nowMs() - startedAt
    });
    return {
      authenticated: false,
      is_admin: false,
      admin: null,
      permissions: getRolePermissions(null)
    };
  }

  const cacheKey = getSessionCacheKey(token);
  const cached = cacheKey ? sessionCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) {
    logPerf("session.cache_hit", {
      tokenMs,
      totalMs: nowMs() - startedAt,
      ttlRemainingMs: cached.expiresAt - Date.now()
    });
    return cached.session;
  }
  if (cached && cacheKey) {
    sessionCache.delete(cacheKey);
  }

  const lookupStartedAt = nowMs();
  const admin = await getAdminById(supabase, token.adminId);
  const lookupMs = nowMs() - lookupStartedAt;
  if (!admin || admin.status !== "active") {
    clearAdminSessionCacheForAdmin(token.adminId);
    logPerf("session", {
      authenticated: false,
      cacheHit: false,
      tokenMs,
      lookupMs,
      totalMs: nowMs() - startedAt
    });
    return {
      authenticated: false,
      is_admin: false,
      admin: null,
      permissions: getRolePermissions(null)
    };
  }

  const session = {
    authenticated: true,
    is_admin: true,
    admin: serializeAdmin(admin),
    permissions: getRolePermissions(admin.role)
  };

  if (cacheKey) {
    trimSessionCache();
    sessionCache.set(cacheKey, {
      adminId: String(admin.id),
      session,
      expiresAt: Date.now() + SESSION_CACHE_TTL_MS
    });
  }

  logPerf("session", {
    authenticated: true,
    cacheHit: false,
    tokenMs,
    lookupMs,
    totalMs: nowMs() - startedAt,
    cacheTtlMs: SESSION_CACHE_TTL_MS
  });

  return session;
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
  requireAdminUser,
  clearAdminSessionCache,
  clearAdminSessionCacheForAdmin,
  clearAdminSessionCacheForRequest
};
