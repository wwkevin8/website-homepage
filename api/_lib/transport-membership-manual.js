const crypto = require("crypto");
const { normalizeRow } = require("./transport-manual-import");
const { calculateMembershipDiscount } = require("./membership");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredUuid(value, field) {
  const text = String(value || "").trim();
  if (!UUID_PATTERN.test(text)) {
    const error = new Error(`${field} must be a valid UUID`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function optionalUuid(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return requiredUuid(value, field);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key]);
    return result;
  }, {});
}

function payloadHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function buildMembershipManualCommand(adminUser, body = {}) {
  const reason = String(body.reason || "").trim();
  if (!reason) {
    const error = new Error("reason is required");
    error.statusCode = 400;
    throw error;
  }

  const row = body.row && typeof body.row === "object" ? body.row : body.order;
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    const error = new Error("order row is required");
    error.statusCode = 400;
    throw error;
  }
  const normalized = normalizeRow(row);
  const errors = require("./transport-manual-import").validateRequired
    ? require("./transport-manual-import").validateRequired(normalized.clean)
    : [];
  if (errors.length) {
    const error = new Error("manual pickup validation failed");
    error.statusCode = 400;
    error.details = errors;
    throw error;
  }
  if (normalized.clean.service_type !== "pickup") {
    const error = new Error("membership manual entry only supports pickup");
    error.statusCode = 400;
    throw error;
  }

  const request = {
    ...normalized.requestPayload,
    shareable: false
  };
  const pricing = calculateMembershipDiscount(request, { benefit_type: "pickup" });
  if (!pricing.eligible) {
    const error = new Error("pickup membership pricing is not available");
    error.statusCode = 400;
    throw error;
  }
  const groupAction = String(body.group_action || "create_single").trim().toLowerCase();
  if (!["create_single", "join_existing"].includes(groupAction)) {
    const error = new Error("group_action must be create_single or join_existing");
    error.statusCode = 400;
    throw error;
  }

  const command = {
    admin_user_id: adminUser.id,
    idempotency_key: requiredUuid(body.idempotency_key || body.submission_id, "idempotency_key"),
    site_user_id: requiredUuid(body.site_user_id, "site_user_id"),
    entitlement_id: requiredUuid(body.entitlement_id, "entitlement_id"),
    claim_id: optionalUuid(body.claim_id, "claim_id"),
    request,
    pricing: {
      membership_discount_amount: pricing.membershipDiscountAmount,
      extra_charge_amount: pricing.extraChargeAmount,
      final_price: pricing.finalPrice,
      breakdown: pricing.breakdown
    },
    group_action: groupAction,
    target_group_id: groupAction === "join_existing"
      ? String(body.target_group_id || body.group_id || "").trim()
      : null,
    reason,
    confirm_contact_mismatch: body.confirm_contact_mismatch === true,
    confirm_duplicate: body.confirm_duplicate === true
  };
  if (groupAction === "join_existing" && !command.target_group_id) {
    const error = new Error("target_group_id is required when joining an existing group");
    error.statusCode = 400;
    throw error;
  }
  return { ...command, payload_hash: payloadHash(command) };
}

module.exports = { buildMembershipManualCommand, payloadHash };
