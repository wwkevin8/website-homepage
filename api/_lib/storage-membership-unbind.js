const { requireAdminUser } = require("./admin-auth");
const { badRequest, methodNotAllowed, ok, parseJsonBody, sendJson } = require("./http");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function sendStorageUnbindError(res, error) {
  const message = String(error?.message || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("idempotency key was already used")) {
    sendJson(res, 409, { data: null, error: { message: "该操作请求已发生变化，请刷新后重试", details: null } });
    return;
  }
  if (normalized.includes("expected") || normalized.includes("does not match") || normalized.includes("still in progress")) {
    sendJson(res, 409, { data: null, error: { message: "权益或订单状态已变化，请刷新后重试", details: null } });
    return;
  }
  if (normalized.includes("not found")) {
    badRequest(res, "未找到对应的寄存权益或寄存订单");
    return;
  }
  if (normalized.includes("not a linked storage membership claim")) {
    badRequest(res, "该权益不是已关联寄存订单的寄存权益，无法通过此入口解除");
    return;
  }
  if (normalized.includes("active administrator") || normalized.includes("administrator role")) {
    sendJson(res, 403, { data: null, error: { message: "当前管理员无权执行此操作", details: null } });
    return;
  }
  console.error("[storage-membership-unbind] atomic operation failed", {
    code: error?.code || null,
    message
  });
  sendJson(res, 500, { data: null, error: { message: "解除寄存会员权益关联失败，请稍后重试", details: null } });
}

async function handleStorageMembershipUnbind(req, res, options = {}) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const supabase = options.supabase;
  if (!supabase) {
    throw new Error("Supabase administrator client is required");
  }

  const adminUser = options.adminUser || await requireAdminUser(req, res, supabase, {
    roles: ["operations_admin", "super_admin"]
  });
  if (!adminUser) return;
  if (!["operations_admin", "super_admin"].includes(adminUser.role)) {
    sendJson(res, 403, { data: null, error: { message: "当前管理员无权执行此操作", details: null } });
    return;
  }

  const claimId = String(options.claimId || req.query?.claimId || "").trim();
  if (!isUuid(claimId)) {
    badRequest(res, "会员权益标识无效");
    return;
  }

  const body = options.body || await parseJsonBody(req);
  const reason = String(body.reason || body.note || "").trim();
  const idempotencyKey = String(body.idempotency_key || body.idempotencyKey || "").trim();
  const expectedOrderId = String(body.expected_storage_order_id || body.expectedStorageOrderId || "").trim();
  const expectedClaimStatus = String(body.expected_claim_status || body.expectedClaimStatus || "").trim().toLowerCase();

  if (!reason) {
    badRequest(res, "请填写解除关联原因");
    return;
  }
  if (!isUuid(idempotencyKey)) {
    badRequest(res, "幂等请求标识无效，请刷新后重试");
    return;
  }
  if (!isUuid(expectedOrderId)) {
    badRequest(res, "寄存订单标识无效，请刷新后重试");
    return;
  }
  if (!expectedClaimStatus) {
    badRequest(res, "缺少权益当前状态，请刷新后重试");
    return;
  }

  const { data: operation, error: operationError } = await supabase.rpc(
    "admin_unbind_storage_membership_claim_atomic",
    {
      p_admin_user_id: adminUser.id,
      p_idempotency_key: idempotencyKey,
      p_claim_id: claimId,
      p_expected_storage_order_id: expectedOrderId,
      p_expected_claim_status: expectedClaimStatus,
      p_reason: reason
    }
  );
  if (operationError) {
    sendStorageUnbindError(res, operationError);
    return;
  }

  const { data: claim, error: claimError } = await supabase
    .from("membership_benefit_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (claimError) {
    sendStorageUnbindError(res, claimError);
    return;
  }
  ok(res, { claim, operation });
}

module.exports = {
  UUID_PATTERN,
  handleStorageMembershipUnbind,
  isUuid,
  sendStorageUnbindError
};
