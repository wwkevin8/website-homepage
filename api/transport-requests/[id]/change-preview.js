const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, methodNotAllowed, serverError, parseJsonBody } = require("../../_lib/http");
const { deriveDisplayGroupId } = require("../../_lib/transport");
const { findTimeAdjustCandidateGroups, validateRequestCanJoinGroup } = require("../../_lib/transport-group-lifecycle");
const { computeTransportGroupPricingSnapshot, roundCurrency } = require("../../_lib/transport-group-stats");
const crypto = require("crypto");

const DEFAULT_PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000;

const CHANGE_FIELDS = [
  "service_type",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "preferred_time_start",
  "preferred_time_end",
  "location_from",
  "location_to",
  "passenger_count",
  "luggage_count",
  "deposit_amount_gbp",
  "shareable",
  "notes",
  "admin_note"
];

const REPRICE_FIELDS = new Set([
  "service_type",
  "airport_code",
  "terminal",
  "preferred_time_start",
  "preferred_time_end",
  "location_from",
  "location_to",
  "passenger_count",
  "luggage_count",
  "shareable",
  "manual_price_gbp"
]);

function isInvalidUuidError(error) {
  return Boolean(error?.message && error.message.includes("invalid input syntax for type uuid"));
}

function normalizeText(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const next = String(value).trim();
  return next || null;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value || "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return fallback;
}

function normalizeInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : null;
}

function normalizeDateTime(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback || null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback || null : parsed.toISOString();
}

function datePart(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function auditValue(field, value) {
  if (value === undefined || value === null || value === "") return null;
  if (["flight_datetime", "preferred_time_start", "preferred_time_end"].includes(field)) {
    return normalizeDateTime(value, null);
  }
  if (["passenger_count", "luggage_count"].includes(field)) {
    return normalizeInteger(value, null);
  }
  if (field === "deposit_amount_gbp") {
    return normalizeMoney(value);
  }
  if (field === "shareable") {
    return Boolean(value);
  }
  return String(value);
}

function buildChangedFields(existing, next) {
  return CHANGE_FIELDS
    .map(field => {
      const before = auditValue(field, existing[field]);
      const after = auditValue(field, next[field]);
      return before === after ? null : { field, before, after };
    })
    .filter(Boolean);
}

function buildDraftRequest(existing, body = {}) {
  const changes = body.changes && typeof body.changes === "object" ? body.changes : body;
  const next = { ...existing };

  if (Object.prototype.hasOwnProperty.call(changes, "service_type")) next.service_type = normalizeText(changes.service_type) || existing.service_type;
  if (Object.prototype.hasOwnProperty.call(changes, "airport_code")) next.airport_code = normalizeText(changes.airport_code) || existing.airport_code;
  if (Object.prototype.hasOwnProperty.call(changes, "airport_name")) next.airport_name = normalizeText(changes.airport_name) || existing.airport_name;
  if (Object.prototype.hasOwnProperty.call(changes, "terminal")) next.terminal = normalizeText(changes.terminal);
  if (Object.prototype.hasOwnProperty.call(changes, "flight_no")) next.flight_no = normalizeText(changes.flight_no);
  if (Object.prototype.hasOwnProperty.call(changes, "flight_datetime")) next.flight_datetime = normalizeDateTime(changes.flight_datetime, existing.flight_datetime);
  if (Object.prototype.hasOwnProperty.call(changes, "preferred_time_start")) {
    next.preferred_time_start = normalizeDateTime(changes.preferred_time_start, existing.preferred_time_start || next.flight_datetime);
  }
  if (Object.prototype.hasOwnProperty.call(changes, "preferred_time_end")) next.preferred_time_end = normalizeDateTime(changes.preferred_time_end, existing.preferred_time_end);
  if (Object.prototype.hasOwnProperty.call(changes, "location_from")) next.location_from = normalizeText(changes.location_from) || existing.location_from;
  if (Object.prototype.hasOwnProperty.call(changes, "location_to")) next.location_to = normalizeText(changes.location_to) || existing.location_to;
  if (Object.prototype.hasOwnProperty.call(changes, "passenger_count")) next.passenger_count = normalizeInteger(changes.passenger_count, existing.passenger_count);
  if (Object.prototype.hasOwnProperty.call(changes, "luggage_count")) next.luggage_count = normalizeInteger(changes.luggage_count, existing.luggage_count);
  if (Object.prototype.hasOwnProperty.call(changes, "deposit_amount_gbp")) next.deposit_amount_gbp = normalizeMoney(changes.deposit_amount_gbp);
  if (Object.prototype.hasOwnProperty.call(changes, "shareable")) next.shareable = normalizeBoolean(changes.shareable, existing.shareable);
  if (Object.prototype.hasOwnProperty.call(changes, "notes")) next.notes = normalizeText(changes.notes);
  if (Object.prototype.hasOwnProperty.call(changes, "admin_note")) next.admin_note = normalizeText(changes.admin_note);

  return next;
}

async function getRequestWithMemberships(supabase, id) {
  let result = await supabase
    .from("transport_requests")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (result.error && !isInvalidUuidError(result.error)) {
    throw result.error;
  }

  let request = result.error ? null : (Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null));

  if (!request) {
    result = await supabase
      .from("transport_requests")
      .select("*")
      .eq("order_no", id)
      .limit(1);

    if (result.error) {
      throw result.error;
    }
    request = Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  if (!request) {
    const error = new Error("request not found");
    error.statusCode = 404;
    throw error;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("transport_group_members")
    .select("id,group_id,request_id,is_initiator")
    .eq("request_id", request.id);

  if (membershipError) {
    throw membershipError;
  }

  return {
    ...request,
    transport_group_members: memberships || []
  };
}

async function loadGroupWithMembers(supabase, groupId) {
  if (!groupId) {
    return { group: null, members: [] };
  }

  const { data: groups, error: groupError } = await supabase
    .from("transport_groups_public_view")
    .select("*")
    .eq("group_id", groupId)
    .limit(1);

  if (groupError) {
    throw groupError;
  }

  const group = Array.isArray(groups) ? (groups[0] || null) : (groups || null);
  if (!group) {
    return { group: null, members: [] };
  }

  const { data: members, error: membersError } = await supabase
    .from("transport_group_members")
    .select("group_id,request_id,passenger_count_snapshot,luggage_count_snapshot,created_at,transport_requests(id,order_no,status,passenger_count,luggage_count,airport_code,terminal,flight_no,flight_datetime,preferred_time_start,notes)")
    .eq("group_id", group.group_id || group.id)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw membersError;
  }

  return {
    group,
    members: members || []
  };
}

function buildSingleMemberGroupLike(request) {
  return {
    group_id: null,
    group_date: datePart(request.preferred_time_start || request.flight_datetime),
    airport_code: request.airport_code,
    airport_name: request.airport_name,
    terminal: request.terminal,
    max_passengers: 5,
    status: "single_member",
    created_at: request.created_at
  };
}

function buildRequestMember(request) {
  return {
    group_id: null,
    request_id: request.id,
    passenger_count_snapshot: request.passenger_count,
    luggage_count_snapshot: request.luggage_count,
    transport_requests: request
  };
}

function replaceRequestInMembers(members, request) {
  let replaced = false;
  const nextMembers = (members || []).map(member => {
    if (member.request_id === request.id || member.transport_requests?.id === request.id) {
      replaced = true;
      return {
        ...member,
        passenger_count_snapshot: request.passenger_count,
        luggage_count_snapshot: request.luggage_count,
        transport_requests: request
      };
    }
    return member;
  });

  if (!replaced) {
    nextMembers.push(buildRequestMember(request));
  }

  return nextMembers;
}

function summarizePricing(pricing) {
  return {
    pricing_season: pricing.pricing_season,
    base_price_per_person_gbp: pricing.base_price_per_person_gbp,
    cross_terminal_surcharge_total_gbp: pricing.cross_terminal_surcharge_total_gbp,
    group_total_price_gbp: pricing.group_total_price_gbp,
    per_person_price_gbp: pricing.per_person_price_gbp,
    total_price_gbp: pricing.total_price_gbp,
    average_price_gbp: pricing.average_price_gbp,
    current_passenger_count: pricing.current_passenger_count,
    has_cross_terminal: pricing.has_cross_terminal,
    terminal_values: pricing.terminal_values,
    terminal_summary: pricing.terminal_summary
  };
}

function getRequestPassengerCount(request) {
  const count = Number(request?.passenger_count || 0);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function buildRequestPricingResult(pricing, request, extraSnapshot = {}) {
  const passengerCount = getRequestPassengerCount(request);
  const perPersonPrice = roundCurrency(pricing.per_person_price_gbp ?? pricing.average_price_gbp);
  const requestTotalPrice = roundCurrency(perPersonPrice * passengerCount);

  return {
    price: requestTotalPrice,
    snapshot: {
      ...summarizePricing(pricing),
      ...extraSnapshot,
      passenger_count: passengerCount,
      per_person_price_gbp: perPersonPrice,
      request_total_price_gbp: requestTotalPrice
    }
  };
}

function resolveOldPricing(existing, currentGroup, currentMembers) {
  if (currentGroup) {
    const pricing = computeTransportGroupPricingSnapshot(currentGroup, currentMembers, { activeOnly: true });
    return buildRequestPricingResult(pricing, existing);
  }

  const manualPrice = normalizeMoney(existing.manual_price_gbp);
  if (manualPrice !== null) {
    return {
      price: manualPrice,
      snapshot: {
        manual_price_gbp: manualPrice,
        passenger_count: getRequestPassengerCount(existing),
        request_total_price_gbp: manualPrice,
        source: "manual_price_gbp"
      }
    };
  }

  const pricing = computeTransportGroupPricingSnapshot(
    buildSingleMemberGroupLike(existing),
    [buildRequestMember(existing)],
    { activeOnly: true }
  );

  return buildRequestPricingResult(pricing, existing);
}

function classifyGroupRetention(existing, next, currentGroup, nextPricingMembers) {
  if (!currentGroup) {
    return {
      can_keep: false,
      reason: "request_not_grouped",
      reasons: ["request_not_grouped"],
      required_action: "no_group_change"
    };
  }

  const reasons = [];
  const currentDate = datePart(existing.preferred_time_start || existing.flight_datetime);
  const nextDate = datePart(next.preferred_time_start || next.flight_datetime);
  const groupDate = currentGroup.group_date || currentDate;
  const passengerTotal = (nextPricingMembers || []).reduce((sum, member) => {
    return sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
  }, 0);
  const maxPassengers = Number(currentGroup.max_passengers || 5);

  if (next.service_type !== existing.service_type) reasons.push("service_type_changed");
  if (next.airport_code !== existing.airport_code || next.airport_code !== currentGroup.airport_code) reasons.push("airport_changed");
  if (nextDate !== currentDate || nextDate !== groupDate) reasons.push("service_date_changed");
  if (next.shareable === false) reasons.push("shareable_disabled");
  if (passengerTotal > maxPassengers) reasons.push("capacity_exceeded");
  if (["closed", "cancelled"].includes(String(currentGroup.status || "").trim().toLowerCase())) reasons.push("group_not_joinable");

  return {
    can_keep: reasons.length === 0,
    reason: reasons[0] || "compatible",
    reasons,
    required_action: reasons.length ? "move_out_new_single" : "keep_group"
  };
}

function derivePaidAmount(existing, body, risks) {
  const changes = body.changes && typeof body.changes === "object" ? body.changes : {};
  const directPaid = normalizeMoney(changes.deposit_amount_gbp ?? body.deposit_amount_gbp ?? body.paid_amount_gbp ?? body.received_amount_gbp);
  if (directPaid !== null) {
    return directPaid;
  }

  const paymentStatus = String(existing.payment_collection_status || "").trim();
  if (paymentStatus === "unpaid") {
    return 0;
  }
  if (paymentStatus === "deposit_paid") {
    return normalizeMoney(existing.deposit_amount_gbp) || 0;
  }
  if (paymentStatus === "fully_paid") {
    const confirmedPrice = normalizeMoney(existing.confirmed_price_gbp);
    if (confirmedPrice !== null) {
      return confirmedPrice;
    }
    risks.push({
      code: "fully_paid_amount_unconfirmed",
      message: "Order is marked fully paid, but no confirmed price or explicit paid amount is available. Customer service must confirm the received amount."
    });
    return null;
  }

  return normalizeMoney(existing.deposit_amount_gbp) || 0;
}

function moneyDelta(newPrice, oldPrice) {
  if (newPrice === null || oldPrice === null) return null;
  return roundCurrency(newPrice - oldPrice);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashObject(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function getPreviewTokenTtlMs() {
  const parsed = Number.parseInt(process.env.P5_CHANGE_PREVIEW_TOKEN_TTL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PREVIEW_TOKEN_TTL_MS;
}

function getPreviewTokenSecret() {
  return process.env.P5_CHANGE_PREVIEW_TOKEN_SECRET
    || process.env.ADMIN_SESSION_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || "local-preview-token-secret";
}

function signPreviewTokenPayload(sourceSnapshotHash, expiresAtMs) {
  return crypto
    .createHmac("sha256", getPreviewTokenSecret())
    .update(`v1:${sourceSnapshotHash}:${expiresAtMs}`)
    .digest("hex");
}

function createPreviewToken(sourceSnapshotHash) {
  const expiresAtMs = Date.now() + getPreviewTokenTtlMs();
  const signature = signPreviewTokenPayload(sourceSnapshotHash, expiresAtMs);
  return {
    token: `v1.${sourceSnapshotHash}.${expiresAtMs}.${signature}`,
    expires_at: new Date(expiresAtMs).toISOString()
  };
}

function verifyPreviewToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return { valid: false, reason: "invalid_preview_token" };
  }
  const [, sourceSnapshotHash, expiresAtText, signature] = parts;
  const expiresAtMs = Number.parseInt(expiresAtText, 10);
  if (!sourceSnapshotHash || !Number.isFinite(expiresAtMs) || !signature) {
    return { valid: false, reason: "invalid_preview_token" };
  }
  if (expiresAtMs <= Date.now()) {
    return { valid: false, reason: "expired_preview_token", source_snapshot_hash: sourceSnapshotHash };
  }
  const expected = signPreviewTokenPayload(sourceSnapshotHash, expiresAtMs);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false, reason: "invalid_preview_token" };
  }
  return {
    valid: true,
    source_snapshot_hash: sourceSnapshotHash,
    expires_at: new Date(expiresAtMs).toISOString()
  };
}

function hasServiceDateChange(changedFieldNames, existing, next) {
  if (!changedFieldNames.has("flight_datetime") && !changedFieldNames.has("preferred_time_start")) {
    return false;
  }
  return datePart(existing.preferred_time_start || existing.flight_datetime) !== datePart(next.preferred_time_start || next.flight_datetime);
}

function hasMultiMemberRouteBreakingChange(changedFieldNames, existing, next) {
  return changedFieldNames.has("airport_code")
    || changedFieldNames.has("service_type")
    || hasServiceDateChange(changedFieldNames, existing, next);
}

function targetGroupErrorMessage(error) {
  const message = String(error?.message || "");
  if (/multiple \(or no\) rows|not found|no rows/i.test(message)) return "未找到这个拼车组编号，请检查 Group ID 是否输入正确。";
  if (/current group/i.test(message)) return "目标拼车组就是当前拼车组，不能重复加入。";
  if (/not joinable|closed|cancel/i.test(message)) return "该拼车组已关闭、已取消或状态不可加入。";
  if (/service_type/i.test(message)) return "服务类型不一致，接机订单只能加入接机组，送机订单只能加入送机组。";
  if (/airport_code|airport/i.test(message)) return "机场不一致，不能加入这个拼车组。";
  if (/date/i.test(message)) return "服务日期不一致，不能加入这个拼车组。";
  if (/no active members/i.test(message)) return "该拼车组没有有效成员，不能作为目标组加入。";
  if (/capacity|seat|remaining/i.test(message)) return "该拼车组人数已满或剩余座位不足。";
  if (/time is outside|allowed window/i.test(message)) return "服务时间与该拼车组相差超过 3 小时，不能加入。";
  if (/passenger_count/i.test(message)) return "订单人数无效，不能校验目标拼车组。";
  if (/already in target group/i.test(message)) return "该订单已经在这个目标拼车组中。";
  return message || "该拼车组暂时不能加入，请检查服务类型、机场、日期、时间和剩余座位。";
}

function summarizeTargetGroup(group, stats, warnings = []) {
  return {
    group_id: group.group_id || group.id,
    group_ref: group.group_ref || group.id || group.group_id,
    status: group.status,
    service_type: group.service_type,
    airport_code: group.airport_code,
    airport_name: group.airport_name,
    terminal: group.terminal,
    group_date: group.group_date,
    preferred_time_start: group.preferred_time_start,
    flight_time_reference: group.flight_time_reference,
    current_passenger_count: stats.current_passenger_count,
    remaining_passenger_count: stats.remaining_passenger_count,
    max_passengers: stats.max_passengers,
    member_order_nos: stats.member_order_nos,
    warnings
  };
}

async function searchTargetGroup(supabase, request, searchText, currentGroupId) {
  const targetGroupId = normalizeText(searchText);
  if (!targetGroupId) return null;
  try {
    const validation = await validateRequestCanJoinGroup(supabase, request, targetGroupId, {
      flight_datetime: request.flight_datetime,
      preferred_time_start: request.preferred_time_start || request.flight_datetime
    }, {
      currentGroupIds: currentGroupId ? [currentGroupId] : []
    });
    return {
      query: targetGroupId,
      joinable: true,
      reason: "可以加入该拼车组。",
      group: summarizeTargetGroup(validation.group, validation.stats, validation.warnings || [])
    };
  } catch (error) {
    return {
      query: targetGroupId,
      joinable: false,
      reason: targetGroupErrorMessage(error)
    };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";

  try {
    const body = req.body && typeof req.body === "object" ? req.body : await parseJsonBody(req);
    const existing = await getRequestWithMemberships(supabase, id);
    const next = buildDraftRequest(existing, body);
    const changedFields = buildChangedFields(existing, next);
    const changedFieldNames = new Set(changedFields.map(item => item.field));
    const risks = [];
    const currentMemberships = Array.isArray(existing.transport_group_members) ? existing.transport_group_members : [];
    const currentGroupId = currentMemberships[0]?.group_id || null;
    const { group: currentGroup, members: currentMembers } = await loadGroupWithMembers(supabase, currentGroupId);

    const nextMembersInCurrentGroup = currentGroup
      ? replaceRequestInMembers(currentMembers, next)
      : [buildRequestMember(next)];
    const groupRetention = classifyGroupRetention(existing, next, currentGroup, nextMembersInCurrentGroup);
    const oldPricing = resolveOldPricing(existing, currentGroup, currentMembers);

    let newPricingSnapshot;
    if (groupRetention.can_keep && currentGroup) {
      const pricing = computeTransportGroupPricingSnapshot(currentGroup, nextMembersInCurrentGroup, { activeOnly: true });
      newPricingSnapshot = buildRequestPricingResult(pricing, next);
    } else {
      const pricing = computeTransportGroupPricingSnapshot(
        buildSingleMemberGroupLike(next),
        [buildRequestMember(next)],
        { activeOnly: true }
      );
      newPricingSnapshot = buildRequestPricingResult(pricing, next);
    }

    const manualNewPrice = normalizeMoney(body.new_price_gbp ?? body.manual_price_gbp);
    if (manualNewPrice !== null) {
      newPricingSnapshot = {
        price: manualNewPrice,
        snapshot: {
          ...newPricingSnapshot.snapshot,
          manual_override_price_gbp: manualNewPrice,
          request_total_price_gbp: manualNewPrice
        }
      };
      changedFieldNames.add("manual_price_gbp");
    }

    const priceDelta = moneyDelta(newPricingSnapshot.price, oldPricing.price);
    const paidAmount = derivePaidAmount(existing, body, risks);
    const balanceDue = paidAmount === null ? null : Math.max(roundCurrency(newPricingSnapshot.price - paidAmount), 0);
    const refundDue = paidAmount === null ? null : Math.max(roundCurrency(paidAmount - newPricingSnapshot.price), 0);
    const priceChanged = priceDelta !== null && priceDelta !== 0;
    const repriceFieldsChanged = Array.from(changedFieldNames).some(field => REPRICE_FIELDS.has(field))
      || hasServiceDateChange(changedFieldNames, existing, next);
    const groupCompatibleForOrdinary = currentGroup ? groupRetention.can_keep : true;
    const onlyOrdinaryTimeFields = changedFields.length > 0
      && changedFields.every(item => ["flight_datetime", "preferred_time_start"].includes(item.field))
      && !priceChanged
      && !hasServiceDateChange(changedFieldNames, existing, next)
      && groupCompatibleForOrdinary;
    const classification = onlyOrdinaryTimeFields ? "ordinary_time_adjustment" : "order_change";
    const requiresReprice = classification === "order_change" && (repriceFieldsChanged || priceChanged);

    if (changedFieldNames.has("airport_code")) {
      risks.push({
        code: "airport_change_requires_group_review",
        message: "Airport changes require price recalculation and group reassessment."
      });
    }
    if (changedFieldNames.has("terminal")) {
      risks.push({
        code: "terminal_change_reprices_cross_terminal",
        message: "Terminal changes can trigger cross-terminal pricing and group compatibility checks."
      });
    }
    if (["location_from", "location_to"].some(field => changedFieldNames.has(field))) {
      risks.push({
        code: "route_location_change_requires_price_review",
        message: "Pickup/dropoff address changes can affect price. Customer service must confirm the fee."
      });
    }
    if (changedFieldNames.has("passenger_count")) {
      risks.push({
        code: "passenger_count_changes_group_average",
        message: "Passenger count changes affect capacity and the shared group average price."
      });
    }

    let candidateGroups = [];
    const searchedTargetGroup = await searchTargetGroup(
      supabase,
      next,
      body.target_group_search || body.target_group_id_search || "",
      currentGroupId
    );
    if (next.shareable !== false && !groupRetention.can_keep) {
      try {
        candidateGroups = await findTimeAdjustCandidateGroups(supabase, next, {
          flight_datetime: next.flight_datetime,
          preferred_time_start: next.preferred_time_start || next.flight_datetime
        }, {
          currentGroupIds: currentGroupId ? [currentGroupId] : []
        });
      } catch (error) {
        risks.push({
          code: "candidate_group_lookup_failed",
          message: error?.message || "candidate group lookup failed"
        });
      }
    }

    const isMultiMemberRouteBreakingChange = currentGroup
      && currentMembers.length > 1
      && hasMultiMemberRouteBreakingChange(changedFieldNames, existing, next);

    if (isMultiMemberRouteBreakingChange) {
      risks.push({
        code: "multi_member_group_requires_move_out",
        message: hasServiceDateChange(changedFieldNames, existing, next)
          ? "服务日期已变化，该订单不能继续保留在当前多人拼车组。"
          : "该订单已加入多人拼车组，修改机场或服务类型会影响拼车匹配。"
      });
    }

    let resolvedGroupAction = "no_group_change";
    if (currentGroup) {
      if (isMultiMemberRouteBreakingChange) {
        resolvedGroupAction = "move_out_new_single";
      } else if (groupRetention.can_keep) {
        resolvedGroupAction = "keep_group";
      } else if (next.shareable === false) {
        resolvedGroupAction = "move_out_new_single";
      } else {
        resolvedGroupAction = "move_out_new_single";
      }
    }

    const sourceSnapshot = {
      request_id: existing.id,
      order_no: existing.order_no,
      current_group_id: currentGroup?.group_id || currentGroupId || null,
      current_group_status: currentGroup?.status || null,
      current_members: (currentMembers || []).map(member => ({
        id: member.id || null,
        group_id: member.group_id || null,
        request_id: member.request_id || member.transport_requests?.id || null,
        passenger_count_snapshot: member.passenger_count_snapshot || null,
        luggage_count_snapshot: member.luggage_count_snapshot || null,
        request_status: member.transport_requests?.status || null,
        request_passenger_count: member.transport_requests?.passenger_count || null,
        request_luggage_count: member.transport_requests?.luggage_count || null,
        request_terminal: member.transport_requests?.terminal || null,
        request_flight_datetime: member.transport_requests?.flight_datetime || null,
        request_preferred_time_start: member.transport_requests?.preferred_time_start || null
      })),
      before_values: changedFields.reduce((result, item) => {
        result[item.field] = item.before;
        return result;
      }, {}),
      pricing_before: oldPricing.snapshot,
      requested_changes: body.changes && typeof body.changes === "object" ? body.changes : body,
      paid_amount_gbp: paidAmount,
      new_price_gbp: newPricingSnapshot.price,
      group_action: resolvedGroupAction
    };
    const sourceSnapshotHash = hashObject(sourceSnapshot);
    const previewToken = createPreviewToken(sourceSnapshotHash);

    ok(res, {
      request_id: existing.id,
      order_no: existing.order_no,
      classification,
      preview_token: previewToken.token,
      preview_expires_at: previewToken.expires_at,
      source_snapshot_hash: sourceSnapshotHash,
      reason: normalizeText(body.reason) || null,
      changed_fields: changedFields,
      requires_reprice: requiresReprice,
      price_recheck_required: requiresReprice,
      summary_refreshed: true,
      old_price_gbp: oldPricing.price,
      new_price_gbp: newPricingSnapshot.price,
      price_delta_gbp: priceDelta,
      paid_amount_gbp: paidAmount,
      balance_due_gbp: balanceDue,
      refund_due_gbp: refundDue,
      pricing_before: oldPricing.snapshot,
      pricing_after: newPricingSnapshot.snapshot,
      payment_context: {
        payment_collection_status: existing.payment_collection_status || "unpaid",
        deposit_amount_gbp: normalizeMoney(existing.deposit_amount_gbp),
        deposit_amount_is_reference_only: true,
        requires_paid_amount_confirmation: paidAmount === null
      },
      group_context: {
        current_group_id: currentGroup?.group_id || currentGroupId,
        current_group_display_id: currentGroup ? (currentGroup.group_id || deriveDisplayGroupId(currentGroup.id, currentGroup.group_date)) : null,
        current_member_count: currentMembers.length,
        can_keep_original_group: groupRetention.can_keep,
        keep_original_group_reason: groupRetention.reason,
        keep_original_group_reasons: groupRetention.reasons || [],
        multi_member_route_update_requires_move_out: Boolean(isMultiMemberRouteBreakingChange),
        required_group_action: resolvedGroupAction,
        candidate_groups: candidateGroups,
        searched_target_group: searchedTargetGroup
      },
      preview_is_read_only: true,
      risks
    });
  } catch (error) {
    if (error?.statusCode === 404) {
      badRequest(res, error.message);
      return;
    }
    serverError(res, error);
  }
};

module.exports.verifyPreviewToken = verifyPreviewToken;
