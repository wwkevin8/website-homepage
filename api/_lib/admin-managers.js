const {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  normalizeUsername,
  normalizeEmail,
  normalizePhone,
  serializeAdmin
} = require("./admin-auth");
const { hashPassword, generateTemporaryPassword } = require("./admin-security");

function assertRequiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${label}不能为空`);
  }
  return text;
}

function assertRole(value) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_ROLES, value)) {
    throw new Error("角色无效");
  }
  return value;
}

function assertStatus(value) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_STATUSES, value)) {
    throw new Error("状态无效");
  }
  return value;
}

function assertPassword(value) {
  const text = String(value || "").trim();
  if (text.length < 8) {
    throw new Error("密码长度不能少于 8 位");
  }
  return text;
}

function mapManagerCreatePayload(body) {
  const username = normalizeUsername(assertRequiredText(body.username, "账号"));
  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    throw new Error("账号需为 4 到 32 位字母、数字或 . _ -");
  }

  return {
    username,
    name: assertRequiredText(body.name, "姓名"),
    email: normalizeEmail(body.email) || null,
    phone: normalizePhone(body.phone) || null,
    role: assertRole(body.role),
    status: assertStatus(body.status),
    password_hash: hashPassword(assertPassword(body.password))
  };
}

function mapManagerUpdatePayload(body) {
  const payload = {
    name: assertRequiredText(body.name, "姓名"),
    email: normalizeEmail(body.email) || null,
    phone: normalizePhone(body.phone) || null,
    role: assertRole(body.role),
    status: assertStatus(body.status)
  };

  return payload;
}

async function getActiveSuperAdminCount(supabase, excludeId) {
  let query = supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "active");

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { count, error } = await query;
  if (error) {
    throw error;
  }

  return Number(count || 0);
}

async function assertManagerMutationAllowed(supabase, actor, target, nextPayload) {
  if (!actor || actor.role !== "super_admin") {
    throw new Error("只有超级管理员可以管理管理员账号");
  }

  if (!target) {
    return;
  }

  const nextStatus = nextPayload?.status || target.status;
  const nextRole = nextPayload?.role || target.role;

  if (actor.id === target.id && nextStatus === "disabled") {
    throw new Error("当前账号不能停用自己");
  }

  if (target.role === "super_admin" && target.status === "active" && (nextRole !== "super_admin" || nextStatus !== "active")) {
    const remaining = await getActiveSuperAdminCount(supabase, target.id);
    if (remaining < 1) {
      throw new Error("至少保留一名超级管理员");
    }
  }
}

function buildManagerFilters(query, filters) {
  const keyword = String(filters.keyword || "").trim();
  const role = String(filters.role || "").trim();
  const status = String(filters.status || "").trim();

  if (keyword) {
    const safeKeyword = keyword.replace(/,/g, " ");
    query.or(`name.ilike.%${safeKeyword}%,username.ilike.%${safeKeyword}%,email.ilike.%${safeKeyword}%,phone.ilike.%${safeKeyword}%`);
  }

  if (role) {
    query.eq("role", role);
  }

  if (status) {
    query.eq("status", status);
  }
}

function serializeManagerList(items) {
  return (items || []).map(serializeAdmin);
}

function createTemporaryPasswordPayload() {
  const password = generateTemporaryPassword();
  return {
    temporaryPassword: password,
    passwordHash: hashPassword(password)
  };
}

module.exports = {
  mapManagerCreatePayload,
  mapManagerUpdatePayload,
  assertManagerMutationAllowed,
  buildManagerFilters,
  serializeManagerList,
  createTemporaryPasswordPayload
};
