const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, forbidden, parseJsonBody, methodNotAllowed, serverError } = require("../../_lib/http");
const { getTransportMembershipContext } = require("../../_lib/transport-membership-admin");

const ALLOWED_ACTIONS = new Set(["link", "replace", "unlink"]);
const ALLOWED_ROLES = new Set(["operations_admin", "super_admin"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value, field, options = {}) {
  const text = String(value || "").trim();
  if (!text && options.nullable) return null;
  if (!UUID_PATTERN.test(text)) {
    const error = new Error(`${field} must be a UUID`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function normalizeMembershipOperation(requestId, body = {}) {
  const action = String(body.action || "").trim().toLowerCase();
  const reason = String(body.reason || "").trim();
  if (!ALLOWED_ACTIONS.has(action)) {
    const error = new Error("action must be link, replace, or unlink");
    error.statusCode = 400;
    throw error;
  }
  if (!reason) {
    const error = new Error("operation reason is required");
    error.statusCode = 400;
    throw error;
  }
  return {
    p_idempotency_key: normalizeUuid(body.idempotency_key || body.idempotencyKey, "idempotency_key"),
    p_action: action,
    p_request_id: normalizeUuid(requestId, "request_id"),
    p_entitlement_id: normalizeUuid(body.entitlement_id || body.entitlementId, "entitlement_id", { nullable: action === "unlink" }),
    p_claim_id: normalizeUuid(body.claim_id || body.claimId, "claim_id", { nullable: true }),
    p_expected_current_claim_id: normalizeUuid(
      body.expected_current_claim_id || body.expectedCurrentClaimId,
      "expected_current_claim_id",
      { nullable: true }
    ),
    p_reason: reason,
    p_confirm_used: body.confirm_used === true || body.confirmUsed === true,
    p_force: body.force === true
  };
}

function sendRpcError(res, error) {
  const message = String(error?.message || "transport membership operation failed");
  const details = {
    code: error?.code || null,
    details: error?.details || null,
    hint: error?.hint || null
  };
  if (error?.code === "42501") {
    forbidden(res, message);
    return;
  }
  if (["22023", "23503", "23505", "23514", "40001", "P0002"].includes(error?.code)) {
    badRequest(res, message, details);
    return;
  }
  serverError(res, error);
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase, {
    roles: ["operations_admin", "super_admin"]
  });
  if (!adminUser) return;

  if (!ALLOWED_ROLES.has(adminUser.role)) {
    forbidden(res, "administrator role cannot manage transport membership links");
    return;
  }
  if (req.method === "GET") {
    try {
      ok(res, await getTransportMembershipContext(supabase, normalizeUuid(req.query?.id, "request_id")));
    } catch (error) {
      if (error?.statusCode === 400 || error?.code === "TRANSPORT_REQUEST_NOT_FOUND") {
        badRequest(res, error.message);
        return;
      }
      serverError(res, error);
    }
    return;
  }
  if (req.method !== "POST") {
    methodNotAllowed(res, ["GET", "POST"]);
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const rpcPayload = normalizeMembershipOperation(req.query?.id, body);
    if (rpcPayload.p_force && adminUser.role !== "super_admin") {
      forbidden(res, "only super_admin may force conflict handling");
      return;
    }
    if (rpcPayload.p_confirm_used && adminUser.role !== "super_admin") {
      forbidden(res, "only super_admin may confirm unlinking a used membership claim");
      return;
    }

    const { data, error } = await supabase.rpc("admin_manage_transport_membership_link", {
      p_admin_user_id: adminUser.id,
      ...rpcPayload
    });
    if (error) {
      sendRpcError(res, error);
      return;
    }
    ok(res, data || { ok: true });
  } catch (error) {
    if (error?.statusCode === 400) {
      badRequest(res, error.message);
      return;
    }
    serverError(res, error);
  }
};

module.exports.__test = {
  normalizeMembershipOperation
};
