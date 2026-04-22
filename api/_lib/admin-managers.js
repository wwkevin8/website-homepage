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
    throw new Error(`${label}涓嶈兘涓虹┖`);
  }
  return text;
}

function assertRole(value) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_ROLES, value)) {
    throw new Error("瑙掕壊鏃犳晥");
  }
  return value;
}

function assertStatus(value) {
  if (!Object.prototype.hasOwnProperty.call(ADMIN_STATUSES, value)) {
    throw new Error("鐘舵€佹棤鏁?");
  }
  return value;
}

function assertPassword(value) {
  const text = String(value || "").trim();
  if (text.length < 8) {
    throw new Error("瀵嗙爜闀垮害涓嶈兘灏戜簬 8 浣?");
  }
  return text;
}

function mapManagerCreatePayload(body) {
  const username = normalizeUsername(assertRequiredText(body.username, "璐﹀彿"));
  if (!/^[a-z0-9._-]{4,32}$/.test(username)) {
    throw new Error("璐﹀彿闇€涓?4 鍒?32 浣嶅瓧姣嶃€佹暟瀛楁垨 . _ -");
  }

  return {
    username,
    name: assertRequiredText(body.name, "濮撳悕"),
    email: normalizeEmail(body.email) || null,
    phone: normalizePhone(body.phone) || null,
    role: assertRole(body.role),
    status: assertStatus(body.status),
    password_hash: hashPassword(assertPassword(body.password))
  };
}

function mapManagerUpdatePayload(body) {
  const payload = {
    name: assertRequiredText(body.name, "濮撳悕"),
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
    throw new Error("鍙湁瓒呯骇绠＄悊鍛樺彲浠ョ鐞嗙鐞嗗憳璐﹀彿");
  }

  if (!target) {
    return;
  }

  const nextStatus = nextPayload?.status || target.status;
  const nextRole = nextPayload?.role || target.role;
  const deleting = Boolean(nextPayload?.delete);

  if (deleting && target.role === "super_admin") {
    throw new Error("瓒呯骇绠＄悊鍛樿处鍙蜂笉鑳藉垹闄?");
  }

  if (actor.id === target.id && (nextStatus === "disabled" || deleting)) {
    throw new Error(deleting ? "褰撳墠璐﹀彿涓嶈兘鍒犻櫎鑷繁" : "褰撳墠璐﹀彿涓嶈兘鍋滅敤鑷繁");
  }

  if (target.role === "super_admin" && target.status === "active" && (deleting || nextRole !== "super_admin" || nextStatus !== "active")) {
    const remaining = await getActiveSuperAdminCount(supabase, target.id);
    if (remaining < 1) {
      throw new Error("鑷冲皯淇濈暀涓€鍚嶈秴绾х鐞嗗憳");
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
  createTemporaryPasswordPayload
};
