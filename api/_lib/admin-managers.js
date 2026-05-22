const {
  ADMIN_ROLES,
  ADMIN_STATUSES,
  normalizeUsername,
  normalizeEmail,
  normalizePhone,
  serializeAdmin
} = require("./admin-auth");
const { hashPassword, generateTemporaryPassword } = require("./admin-security");

const ROOT_MANAGER_ACCOUNT = {
  email: "haoranw44@gmail.com"
};

function isRootManagerAccount(admin) {
  if (!admin) {
    return false;
  }

  return normalizeEmail(admin.email) === ROOT_MANAGER_ACCOUNT.email;
}

function assertRequiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`请填写${label}`);
  }
  return text;
}

function assertRole(value) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_ROLES, value)) {
    throw new Error("请选择有效的管理员角色");
  }
  return value;
}

function assertStatus(value) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_STATUSES, value)) {
    throw new Error("请选择有效的账号状态");
  }
  return value;
}

function assertPassword(value) {
  const text = String(value || "").trim();
  if (text.length < 8) {
    throw new Error("密码至少需要 8 位");
  }
  return text;
}

function assertUsername(value) {
  const username = normalizeUsername(assertRequiredText(value, "账号"));
  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    throw new Error("账号需为 4-32 位，只能包含小写字母、数字、点号、下划线或短横线，不能使用邮箱格式");
  }
  return username;
}

function mapManagerCreatePayload(body) {
  const username = assertUsername(body.username);

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

function mapManagerUpdatePayload(body, options = {}) {
  const payload = {
    name: assertRequiredText(body.name, "姓名"),
    email: normalizeEmail(body.email) || null,
    phone: normalizePhone(body.phone) || null,
    role: assertRole(body.role),
    status: assertStatus(body.status)
  };

  if (options.allowUsername) {
    payload.username = assertUsername(body.username);
  }

  if (String(body.password || "").trim()) {
    payload.password_hash = hashPassword(assertPassword(body.password));
  }

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
    throw new Error("只有超级管理员可以管理后台管理员账号");
  }

  if (!target) {
    return;
  }

  const nextStatus = nextPayload?.status || target.status;
  const nextRole = nextPayload?.role || target.role;
  const deleting = Boolean(nextPayload?.delete);
  const actorIsRootManager = isRootManagerAccount(actor);

  if (deleting && target.role === "super_admin" && !actorIsRootManager) {
    throw new Error("只有 Wkevin 可以删除其他超级管理员");
  }

  if (actor.id === target.id && (nextStatus === "disabled" || deleting)) {
    throw new Error(deleting ? "当前账号不能删除自己" : "当前账号不能停用自己");
  }

  if (target.role === "super_admin" && target.status === "active" && (deleting || nextRole !== "super_admin" || nextStatus !== "active")) {
    const remaining = await getActiveSuperAdminCount(supabase, target.id);
    if (remaining < 1) {
      throw new Error("至少需要保留一个启用中的超级管理员");
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
  assertPassword,
  mapManagerCreatePayload,
  mapManagerUpdatePayload,
  assertManagerMutationAllowed,
  buildManagerFilters,
  serializeManagerList,
  createTemporaryPasswordPayload,
  isRootManagerAccount
};
