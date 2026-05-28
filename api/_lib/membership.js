const crypto = require("crypto");

const BENEFIT_TYPES = ["storage", "pickup", "moving", "welcome_pack", "cashback"];
const PUBLIC_BENEFIT_TYPES = ["storage", "pickup", "moving", "welcome_pack"];
const LIVE_CLAIM_STATUSES = ["selected", "reserved", "used", "manual"];
const ORDER_LINK_TABLES = ["storage_orders", "transport_requests", "manual"];
const ACTIVATION_CODE_STATUSES = ["active", "redeemed", "revoked", "expired"];
const ACTIVATION_CODE_PUBLIC_SELECT = "id, code_prefix, membership_cycle, status, bound_email, bound_phone, booking_reference, notes, generated_by_admin_id, redeemed_by_user_id, redeemed_at, expires_at, created_at, updated_at";
const ACTIVATION_CODE_PUBLIC_SELECT_WITH_BIRTHDAY = "id, code_prefix, membership_cycle, status, bound_email, bound_phone, booking_reference, notes, member_birthday, generated_by_admin_id, redeemed_by_user_id, redeemed_at, expires_at, created_at, updated_at";

const MEMBERSHIP_CONFIG = {
  defaultCycle: "2026-27",
  storage: {
    freeStandardBoxLimit: 6
  },
  pickup: {
    allowedServiceTypes: ["pickup"],
    freeAirportCodes: ["LHR", "LGW"],
    freeAirportNamePatterns: ["heathrow", "gatwick", "希思罗", "盖特维克"],
    freeMonth: 9,
    fallbackDiscountAmount: 100
  }
};

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isMissingMemberBirthdayColumnError(error) {
  if (!error) {
    return false;
  }
  const message = [
    error.message,
    error.details,
    error.hint
  ].filter(Boolean).join(" ").toLowerCase();
  return error.code === "42703"
    || error.code === "PGRST204"
    || (message.includes("member_birthday") && (message.includes("does not exist") || message.includes("schema cache")));
}

function normalizeMoney(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.round(number * 100) / 100);
}

function sumMoney(values) {
  return normalizeMoney((values || []).reduce((sum, value) => sum + normalizeMoney(value, 0), 0), 0);
}

function firstPositiveMoney(values) {
  for (const value of values || []) {
    const amount = normalizeMoney(value, 0);
    if (amount > 0) {
      return amount;
    }
  }
  return 0;
}

function proportionalUncoveredAmount(totalAmount, coveredCount, totalCount) {
  const total = normalizeMoney(totalAmount, 0);
  const count = Math.max(0, Number(totalCount || 0));
  if (total <= 0 || count <= 0) {
    return 0;
  }
  const covered = Math.min(Math.max(0, Number(coveredCount || 0)), count);
  return normalizeMoney(total * Math.max(0, count - covered) / count, 0);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getCurrentMembershipCycle() {
  const cycle = normalizeText(process.env.CURRENT_MEMBERSHIP_CYCLE) || MEMBERSHIP_CONFIG.defaultCycle;
  if (!/^\d{4}-\d{2}$/.test(cycle)) {
    throw new Error("CURRENT_MEMBERSHIP_CYCLE must use YYYY-YY format, for example 2026-27");
  }
  return cycle;
}

function assertBenefitType(benefitType) {
  const normalized = normalizeText(benefitType).toLowerCase();
  if (!BENEFIT_TYPES.includes(normalized)) {
    throw new Error("Invalid membership benefit type");
  }
  return normalized;
}

function assertPublicBenefitType(benefitType) {
  const normalized = assertBenefitType(benefitType);
  if (!PUBLIC_BENEFIT_TYPES.includes(normalized)) {
    throw new Error("This membership benefit is handled by customer service");
  }
  return normalized;
}

function assertMembershipCycle(cycle) {
  const normalized = normalizeText(cycle) || getCurrentMembershipCycle();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error("Invalid membership cycle");
  }
  return normalized;
}

function normalizeActivationCode(code) {
  return normalizeText(code).toUpperCase().replace(/\s+/g, "");
}

function normalizeMemberBirthday(value) {
  const raw = normalizeText(value);
  if (!raw) {
    const error = new Error("请输入会员生日（月日）");
    error.code = "MEMBERSHIP_BIRTHDAY_REQUIRED";
    throw error;
  }
  const match = raw.match(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) {
    const error = new Error("会员生日请使用 MM-DD 格式，例如 08-21");
    error.code = "MEMBERSHIP_BIRTHDAY_INVALID";
    throw error;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const maxDaysByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > maxDaysByMonth[month - 1]) {
    const error = new Error("会员生日日期无效");
    error.code = "MEMBERSHIP_BIRTHDAY_INVALID";
    throw error;
  }
  return `${match[1]}-${match[2]}`;
}

function birthdayParts(value) {
  const birthday = normalizeText(value);
  const match = birthday.match(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) {
    return { month: null, day: null };
  }
  return {
    month: Number(match[1]),
    day: Number(match[2])
  };
}

function hashActivationCode(code) {
  const normalized = normalizeActivationCode(code);
  const secret = normalizeText(process.env.MEMBERSHIP_CODE_HASH_SECRET);
  return crypto
    .createHash("sha256")
    .update(`${secret}:${normalized}`)
    .digest("hex");
}

function generateActivationCode(cycle = getCurrentMembershipCycle()) {
  const membershipCycle = assertMembershipCycle(cycle);
  const random = crypto
    .randomBytes(6)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const grouped = random.match(/.{1,4}/g).join("-");
  return `NGN-${membershipCycle.slice(0, 4)}-${grouped}`;
}

function activationCodePublicFields(row) {
  if (!row) {
    return null;
  }
  const {
    code_hash: _codeHash,
    ...safeRow
  } = row;
  return safeRow;
}

function adminDisplayFields(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name || "",
    username: row.username || "",
    email: row.email || ""
  };
}

function siteUserDisplayFields(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.nickname || row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    wechat_id: row.wechat_id || "",
    public_user_id: row.public_user_id || ""
  };
}

async function getActiveEntitlement(supabase, userId, cycle = getCurrentMembershipCycle()) {
  const membershipCycle = assertMembershipCycle(cycle);
  const { data, error } = await supabase
    .from("membership_entitlements")
    .select("*")
    .eq("site_user_id", userId)
    .eq("membership_cycle", membershipCycle)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data || null;
}

async function getActiveClaim(supabase, userId, cycle = getCurrentMembershipCycle()) {
  const membershipCycle = assertMembershipCycle(cycle);
  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .select("*")
    .eq("site_user_id", userId)
    .eq("membership_cycle", membershipCycle)
    .in("status", LIVE_CLAIM_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data || null;
}

async function selectBenefit(supabase, userId, cycle, benefitType) {
  const membershipCycle = assertMembershipCycle(cycle);
  const normalizedBenefit = assertPublicBenefitType(benefitType);
  const entitlement = await getActiveEntitlement(supabase, userId, membershipCycle);
  if (!entitlement) {
    const error = new Error("No active membership entitlement for this cycle");
    error.code = "NO_ACTIVE_MEMBERSHIP";
    throw error;
  }

  const existingClaim = await getActiveClaim(supabase, userId, membershipCycle);
  if (existingClaim) {
    const error = new Error("Membership benefit has already been selected for this cycle");
    error.code = "MEMBERSHIP_BENEFIT_ALREADY_SELECTED";
    error.claim = existingClaim;
    throw error;
  }

  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .insert({
      entitlement_id: entitlement.id,
      benefit_type: normalizedBenefit,
      status: "selected",
      selected_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const conflict = new Error("Membership benefit has already been selected for this cycle");
      conflict.code = "MEMBERSHIP_BENEFIT_ALREADY_SELECTED";
      throw conflict;
    }
    throw error;
  }

  return data;
}

function pickNestedNumber(source, paths) {
  for (const path of paths) {
    const parts = String(path).split(".");
    let current = source;
    for (const part of parts) {
      if (!isPlainObject(current) && !Array.isArray(current)) {
        current = undefined;
        break;
      }
      current = current[part];
    }
    const number = Number(current);
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }
  return 0;
}

function calculateStorageDiscount(orderPayload, claim) {
  if (!claim || claim.benefit_type !== "storage") {
    return {
      eligible: false,
      reason: "claim_not_storage",
      membershipDiscountAmount: 0,
      extraChargeAmount: 0,
      finalPrice: normalizeMoney(orderPayload?.estimated_total_price, 0),
      breakdown: { included: [], excluded: [{ type: "ineligible_claim" }] }
    };
  }

  const estimate = isPlainObject(orderPayload?.estimate_summary_json) ? orderPayload.estimate_summary_json : {};
  const serviceDetails = isPlainObject(orderPayload?.customer_form_json?.serviceDetails)
    ? orderPayload.customer_form_json.serviceDetails
    : {};
  const total = normalizeMoney(
    pickNestedNumber({ estimate, orderPayload }, [
      "estimate.estimatedTotalPrice",
      "estimate.estimated_total_price",
      "estimate.finalTotal",
      "estimate.grandTotal",
      "estimate.total",
      "orderPayload.estimated_total_price"
    ]),
    0
  );
  const standardBoxCount = Math.max(0, Number(orderPayload?.estimated_box_count || serviceDetails.storageBoxCount || 0));
  const coveredBoxCount = Math.min(standardBoxCount, MEMBERSHIP_CONFIG.storage.freeStandardBoxLimit);
  const purchasedBoxCount = Math.max(0, Number(
    pickNestedNumber({ estimate, serviceDetails, orderPayload }, [
      "estimate.totalPurchaseBoxes",
      "estimate.total_purchase_boxes",
      "serviceDetails.purchaseQuantity",
      "serviceDetails.purchaseQty",
      "orderPayload.purchaseQuantity",
      "orderPayload.purchaseQty"
    ])
  ));

  const purchaseTotal = firstPositiveMoney([
    orderPayload?.purchaseTotal,
    estimate.purchaseTotal,
    serviceDetails.purchaseTotal,
    Array.isArray(orderPayload?.purchased_boxes)
      ? sumMoney(orderPayload.purchased_boxes.map(item => item?.subtotal || item?.purchase))
      : 0
  ]);
  const purchaseChargeableCount = purchasedBoxCount || standardBoxCount;
  const uncoveredPurchaseTotal = proportionalUncoveredAmount(purchaseTotal, coveredBoxCount, purchaseChargeableCount);
  const overweightFee = normalizeMoney(pickNestedNumber({ estimate, serviceDetails }, [
    "estimate.overweightFee",
    "estimate.overweight_fee",
    "estimate.extraWeightFee",
    "serviceDetails.overweightFee"
  ]));
  const outOfCityReturnFee = normalizeMoney(pickNestedNumber({ estimate, serviceDetails }, [
    "estimate.outOfCityReturnFee",
    "estimate.out_of_city_return_fee",
    "estimate.otherCityReturnFee",
    "serviceDetails.outOfCityReturnFee"
  ]));
  const otherExcludedFee = normalizeMoney(pickNestedNumber({ estimate, serviceDetails }, [
    "estimate.specialServiceFee",
    "estimate.extraFee",
    "serviceDetails.specialServiceFee"
  ]));

  const excluded = [
    { type: "box_purchase_over_limit", amount: uncoveredPurchaseTotal },
    { type: "overweight", amount: overweightFee },
    { type: "out_of_city_return", amount: outOfCityReturnFee },
    { type: "special_or_other", amount: otherExcludedFee }
  ].filter(item => item.amount > 0);
  const extraChargeAmount = sumMoney(excluded.map(item => item.amount));
  const baseServiceAmount = Math.max(0, total - extraChargeAmount);
  const membershipDiscountAmount = normalizeMoney(
    standardBoxCount > 0
      ? baseServiceAmount * (coveredBoxCount / standardBoxCount)
      : baseServiceAmount,
    0
  );
  const finalPrice = total > 0 ? normalizeMoney(Math.max(0, total - membershipDiscountAmount), 0) : null;

  return {
    eligible: membershipDiscountAmount > 0 || total > 0,
    benefitType: "storage",
    baseServiceAmount,
    membershipDiscountAmount,
    extraChargeAmount,
    finalPrice,
    breakdown: {
      source: "server_mapped_storage_payload",
      rules: {
        freeStandardBoxLimit: MEMBERSHIP_CONFIG.storage.freeStandardBoxLimit,
        standardBoxCount,
        coveredBoxCount,
        purchasedBoxCount: purchaseChargeableCount,
        coveredPurchaseBoxCount: Math.min(purchaseChargeableCount, coveredBoxCount)
      },
      included: [
        {
          type: "storage_base_service",
          amount: membershipDiscountAmount,
          coveredBoxCount
        }
      ],
      excluded
    }
  };
}

function calculatePickupDiscount(orderPayload, claim) {
  const serviceType = normalizeText(orderPayload?.service_type).toLowerCase();
  if (!claim || claim.benefit_type !== "pickup") {
    return {
      eligible: false,
      reason: "claim_not_pickup",
      membershipDiscountAmount: 0,
      extraChargeAmount: 0,
      finalPrice: 0,
      breakdown: { included: [], excluded: [{ type: "ineligible_claim" }] }
    };
  }
  if (!MEMBERSHIP_CONFIG.pickup.allowedServiceTypes.includes(serviceType)) {
    return {
      eligible: false,
      reason: "dropoff_not_allowed",
      membershipDiscountAmount: 0,
      extraChargeAmount: 0,
      finalPrice: 0,
      breakdown: { included: [], excluded: [{ type: "service_type", value: serviceType }] }
    };
  }

  const pricing = isPlainObject(orderPayload?.pricing_json) ? orderPayload.pricing_json : {};
  const airportCode = normalizeText(orderPayload?.airport_code).toUpperCase();
  const airportName = normalizeText(orderPayload?.airport_name).toLowerCase();
  const flightDate = new Date(orderPayload?.flight_datetime || orderPayload?.preferred_time_start || "");
  const flightMonth = Number.isNaN(flightDate.getTime()) ? null : flightDate.getUTCMonth() + 1;
  const isFreeAirport = MEMBERSHIP_CONFIG.pickup.freeAirportCodes.includes(airportCode)
    || MEMBERSHIP_CONFIG.pickup.freeAirportNamePatterns.some(pattern => airportName.includes(pattern));
  const isFreeMonth = flightMonth === MEMBERSHIP_CONFIG.pickup.freeMonth;
  const total = normalizeMoney(pickNestedNumber({ pricing, orderPayload }, [
    "pricing.estimatedTotalPrice",
    "pricing.estimated_total_price",
    "pricing.total",
    "pricing.finalTotal",
    "orderPayload.estimated_total_price"
  ]));
  const baseFare = normalizeMoney(pickNestedNumber({ pricing }, [
    "pricing.baseFare",
    "pricing.base_fare",
    "pricing.basePickupFee",
    "pricing.base_pickup_fee"
  ]), 0);
  const extraPassengerFee = normalizeMoney(pickNestedNumber({ pricing }, [
    "pricing.extraPassengerFee",
    "pricing.extra_passenger_fee"
  ]));
  const extraLuggageFee = normalizeMoney(pickNestedNumber({ pricing }, [
    "pricing.extraLuggageFee",
    "pricing.extra_luggage_fee"
  ]));
  const waitingFee = normalizeMoney(pickNestedNumber({ pricing }, [
    "pricing.waitingFee",
    "pricing.waiting_fee"
  ]));
  const specialServiceFee = normalizeMoney(pickNestedNumber({ pricing }, [
    "pricing.specialServiceFee",
    "pricing.special_service_fee",
    "pricing.crossAirportFee",
    "pricing.cross_airport_fee"
  ]));
  const excluded = [
    { type: "extra_passenger", amount: extraPassengerFee },
    { type: "extra_luggage", amount: extraLuggageFee },
    { type: "waiting", amount: waitingFee },
    { type: "special_or_cross_airport", amount: specialServiceFee }
  ].filter(item => item.amount > 0);
  const extraChargeAmount = sumMoney(excluded.map(item => item.amount));
  const inferredBaseFare = baseFare || Math.max(0, total - extraChargeAmount);
  const membershipDiscountAmount = normalizeMoney(
    isFreeAirport && isFreeMonth
      ? inferredBaseFare
      : Math.min(inferredBaseFare || MEMBERSHIP_CONFIG.pickup.fallbackDiscountAmount, MEMBERSHIP_CONFIG.pickup.fallbackDiscountAmount),
    0
  );
  const finalPrice = normalizeMoney(Math.max(0, total - membershipDiscountAmount), 0);

  return {
    eligible: true,
    benefitType: "pickup",
    baseServiceAmount: inferredBaseFare,
    membershipDiscountAmount,
    extraChargeAmount,
    finalPrice,
    breakdown: {
      source: "server_mapped_transport_payload",
      rules: {
        allowedServiceTypes: MEMBERSHIP_CONFIG.pickup.allowedServiceTypes,
        freeAirportCodes: MEMBERSHIP_CONFIG.pickup.freeAirportCodes,
        freeMonth: MEMBERSHIP_CONFIG.pickup.freeMonth,
        matchedFreeAirport: isFreeAirport,
        matchedFreeMonth: isFreeMonth,
        fallbackDiscountAmount: MEMBERSHIP_CONFIG.pickup.fallbackDiscountAmount,
        pricingStatus: total > 0 ? "calculated" : "pending_admin_confirmation"
      },
      included: [{ type: "pickup_base_service", amount: membershipDiscountAmount }],
      excluded
    }
  };
}

function calculateMembershipDiscount(orderPayload, claim) {
  if (!claim) {
    return {
      eligible: false,
      reason: "no_claim",
      membershipDiscountAmount: 0,
      extraChargeAmount: 0,
      finalPrice: 0,
      breakdown: { included: [], excluded: [] }
    };
  }
  if (claim.benefit_type === "storage") {
    return calculateStorageDiscount(orderPayload, claim);
  }
  if (claim.benefit_type === "pickup") {
    return calculatePickupDiscount(orderPayload, claim);
  }
  return {
    eligible: false,
    reason: "benefit_not_order_backed",
    membershipDiscountAmount: 0,
    extraChargeAmount: 0,
    finalPrice: 0,
    breakdown: { included: [], excluded: [{ type: claim.benefit_type }] }
  };
}

async function bindClaimToOrder(supabase, claimId, orderTable, orderId, orderNo, discountResult = {}) {
  const normalizedOrderTable = normalizeText(orderTable);
  if (!ORDER_LINK_TABLES.includes(normalizedOrderTable)) {
    throw new Error("Invalid membership claim order table");
  }

  const patch = {
    status: "reserved",
    reserved_at: new Date().toISOString(),
    linked_order_table: normalizedOrderTable,
    linked_order_id: orderId || null,
    linked_order_no: orderNo || null,
    membership_discount_amount: normalizeMoney(discountResult.membershipDiscountAmount, 0),
    extra_charge_amount: normalizeMoney(discountResult.extraChargeAmount, 0),
    final_price: discountResult.finalPrice === undefined || discountResult.finalPrice === null
      ? null
      : normalizeMoney(discountResult.finalPrice, 0),
    discount_breakdown_json: isPlainObject(discountResult.breakdown) ? discountResult.breakdown : {}
  };

  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .update(patch)
    .eq("id", claimId)
    .in("status", ["selected", "reserved"])
    .is("linked_order_id", null)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    const bindError = new Error("Membership benefit is no longer available for this order");
    bindError.code = "MEMBERSHIP_CLAIM_BIND_CONFLICT";
    throw bindError;
  }
  return data;
}

async function releaseClaimOrderBinding(supabase, options = {}) {
  const claimId = normalizeText(options.claim_id || options.claimId);
  const orderTable = normalizeText(options.order_table || options.orderTable);
  const orderId = normalizeText(options.order_id || options.orderId);
  const orderNo = normalizeText(options.order_no || options.orderNo);
  const adminUserId = options.admin_user_id || options.adminUserId || null;
  const reason = normalizeText(options.reason);

  if (!claimId && !orderId && !orderNo) {
    return null;
  }

  let query = supabase
    .from("membership_benefit_claims")
    .select("*")
    .limit(1);

  if (claimId) {
    query = query.eq("id", claimId);
  } else {
    query = query.eq("linked_order_table", orderTable || "transport_requests");
    if (orderId) {
      query = query.eq("linked_order_id", orderId);
    } else {
      query = query.eq("linked_order_no", orderNo);
    }
  }

  const { data: beforeRows, error: beforeError } = await query;
  if (beforeError) {
    throw beforeError;
  }
  const before = Array.isArray(beforeRows) ? (beforeRows[0] || null) : beforeRows;
  if (!before || before.status !== "reserved") {
    return null;
  }

  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .update({
      status: "selected",
      reserved_at: null,
      linked_order_table: null,
      linked_order_id: null,
      linked_order_no: null,
      membership_discount_amount: 0,
      extra_charge_amount: 0,
      final_price: null,
      discount_breakdown_json: {},
      updated_by_admin_id: adminUserId || null
    })
    .eq("id", before.id)
    .eq("status", "reserved")
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: data.site_user_id,
    entitlement_id: data.entitlement_id,
    claim_id: data.id,
    action: "membership_claim_order_unbound",
    before_data: before,
    after_data: data,
    metadata: {
      reason: reason || null,
      order_table: before.linked_order_table || orderTable || null,
      order_id: before.linked_order_id || orderId || null,
      order_no: before.linked_order_no || orderNo || null
    }
  });
  return data;
}

async function markClaimUsed(supabase, claimId, adminUserId) {
  const { data: before, error: beforeError } = await supabase
    .from("membership_benefit_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (beforeError) {
    throw beforeError;
  }
  if (!before) {
    throw new Error("Membership claim not found");
  }

  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      updated_by_admin_id: adminUserId || null
    })
    .eq("id", claimId)
    .in("status", ["selected", "reserved", "manual"])
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Membership claim cannot be marked used from its current status");
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: data.site_user_id,
    entitlement_id: data.entitlement_id,
    claim_id: data.id,
    action: "membership_claim_marked_used",
    before_data: before,
    after_data: data
  });
  return data;
}

async function cancelOrResetClaim(supabase, claimId, adminUserId, options = {}) {
  const action = options.reset ? "membership_claim_reset" : "membership_claim_cancelled";
  const { data: before, error: beforeError } = await supabase
    .from("membership_benefit_claims")
    .select("*")
    .eq("id", claimId)
    .maybeSingle();
  if (beforeError) {
    throw beforeError;
  }
  if (!before) {
    throw new Error("Membership claim not found");
  }

  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      admin_note: normalizeText(options.reason) || before.admin_note || null,
      updated_by_admin_id: adminUserId || null
    })
    .eq("id", claimId)
    .neq("status", "cancelled")
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Membership claim is already cancelled");
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: data.site_user_id,
    entitlement_id: data.entitlement_id,
    claim_id: data.id,
    action,
    before_data: before,
    after_data: data,
    metadata: {
      reason: normalizeText(options.reason) || null
    }
  });
  return data;
}

async function createManualClaim(supabase, payload = {}, adminUserId) {
  const entitlementId = normalizeText(payload.entitlement_id);
  if (!entitlementId) {
    throw new Error("entitlement_id is required");
  }
  const benefitType = assertBenefitType(payload.benefit_type);
  const status = normalizeText(payload.status) || "manual";
  if (!["used", "manual", "reserved", "selected"].includes(status)) {
    throw new Error("Invalid manual membership claim status");
  }

  const { data: entitlement, error: entitlementError } = await supabase
    .from("membership_entitlements")
    .select("*")
    .eq("id", entitlementId)
    .eq("status", "active")
    .maybeSingle();
  if (entitlementError) {
    throw entitlementError;
  }
  if (!entitlement) {
    throw new Error("Active membership entitlement not found");
  }

  const existingClaim = await getActiveClaim(supabase, entitlement.site_user_id, entitlement.membership_cycle);
  if (existingClaim) {
    const error = new Error("Membership benefit has already been recorded for this cycle");
    error.code = "MEMBERSHIP_BENEFIT_ALREADY_SELECTED";
    error.claim = existingClaim;
    throw error;
  }

  const { data, error } = await supabase
    .from("membership_benefit_claims")
    .insert({
      entitlement_id: entitlement.id,
      benefit_type: benefitType,
      status,
      linked_order_table: "manual",
      admin_note: normalizeText(payload.admin_note || payload.note) || null,
      created_by_admin_id: adminUserId || null,
      updated_by_admin_id: adminUserId || null
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: data.site_user_id,
    entitlement_id: data.entitlement_id,
    claim_id: data.id,
    action: "membership_manual_claim_recorded",
    after_data: data
  });
  return data;
}

async function deleteMembershipEntitlement(supabase, entitlementId, adminUserId) {
  const id = normalizeText(entitlementId);
  if (!id) {
    throw new Error("entitlement_id is required");
  }

  const { data: before, error: beforeError } = await supabase
    .from("membership_entitlements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (beforeError) {
    throw beforeError;
  }
  if (!before) {
    throw new Error("Membership entitlement not found");
  }

  const { data: claims, error: claimsError } = await supabase
    .from("membership_benefit_claims")
    .select("*")
    .eq("entitlement_id", id);
  if (claimsError) {
    throw claimsError;
  }

  const { error } = await supabase
    .from("membership_entitlements")
    .delete()
    .eq("id", id);
  if (error) {
    throw error;
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: before.site_user_id,
    action: "membership_entitlement_deleted",
    before_data: before,
    metadata: {
      entitlement_id: before.id,
      membership_cycle: before.membership_cycle,
      deleted_claims: claims || []
    }
  });

  return { deleted: true, id };
}

async function logMembershipAudit(supabase, payload) {
  const { error } = await supabase
    .from("membership_audit_logs")
    .insert({
      admin_user_id: payload.admin_user_id || null,
      site_user_id: payload.site_user_id || null,
      entitlement_id: payload.entitlement_id || null,
      claim_id: payload.claim_id || null,
      action: payload.action,
      before_data: payload.before_data || null,
      after_data: payload.after_data || null,
      metadata: payload.metadata || {}
    });
  if (error) {
    console.warn("[membership] failed to write audit log", error);
  }
}

async function grantMembershipEntitlement(supabase, payload = {}, adminUserId) {
  const siteUserId = normalizeText(payload.site_user_id);
  if (!siteUserId) {
    throw new Error("site_user_id is required");
  }
  const membershipCycle = assertMembershipCycle(payload.membership_cycle);
  const insertPayload = {
    site_user_id: siteUserId,
    membership_cycle: membershipCycle,
    status: "active",
    grant_source: normalizeText(payload.grant_source) || "admin",
    granted_by_admin_id: adminUserId || null,
    valid_from: payload.valid_from || null,
    valid_until: payload.valid_until || null,
    notes: normalizeText(payload.notes) || null,
    metadata: isPlainObject(payload.metadata) ? payload.metadata : {}
  };

  const { data, error } = await supabase
    .from("membership_entitlements")
    .upsert(insertPayload, { onConflict: "site_user_id,membership_cycle" })
    .select("*")
    .single();
  if (error) {
    throw error;
  }

  const memberBirthday = normalizeText(payload.metadata?.member_birthday || payload.member_birthday);
  const birthday = birthdayParts(memberBirthday);
  const optionalPatch = {
    created_by_admin_id: adminUserId || data.granted_by_admin_id || null,
    advisor_admin_id: payload.advisor_admin_id || payload.created_by_admin_id || adminUserId || data.granted_by_admin_id || null
  };
  if (birthday.month && birthday.day) {
    optionalPatch.birthday_month = birthday.month;
    optionalPatch.birthday_day = birthday.day;
    optionalPatch.birthday_reminder_enabled = payload.birthday_reminder_enabled !== false;
  }
  const { error: optionalPatchError } = await supabase
    .from("membership_entitlements")
    .update(optionalPatch)
    .eq("id", data.id);
  if (optionalPatchError) {
    console.warn("[membership] optional birthday/advisor patch skipped", optionalPatchError);
  } else {
    Object.assign(data, optionalPatch);
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: data.site_user_id,
    entitlement_id: data.id,
    action: "membership_entitlement_granted",
    after_data: data
  });
  return data;
}

async function createMembershipActivationCode(supabase, payload = {}, adminUserId) {
  const membershipCycle = assertMembershipCycle(payload.membership_cycle || getCurrentMembershipCycle());
  const expiresAt = normalizeText(payload.expires_at) || null;
  const boundEmail = normalizeEmail(payload.bound_email) || null;
  const benefitType = normalizeText(payload.benefit_type);
  const rawNotes = normalizeText(payload.notes);
  const notes = [rawNotes, benefitType ? `权益类型: ${benefitType}` : ""].filter(Boolean).join("\n") || null;
  const generatedByAdminId = adminUserId || null;
  let lastError = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = normalizeActivationCode(generateActivationCode(membershipCycle));
    const row = {
      code_hash: hashActivationCode(code),
      code_prefix: code.slice(0, 12),
      membership_cycle: membershipCycle,
      status: "active",
      bound_email: boundEmail,
      bound_phone: normalizeText(payload.bound_phone) || null,
      booking_reference: normalizeText(payload.booking_reference) || null,
      notes,
      generated_by_admin_id: generatedByAdminId,
      expires_at: expiresAt
    };

    const { data, error } = await supabase
      .from("membership_activation_codes")
      .insert(row)
      .select(ACTIVATION_CODE_PUBLIC_SELECT)
      .single();

    if (!error) {
      await logMembershipAudit(supabase, {
        admin_user_id: generatedByAdminId,
        action: "membership_activation_code_created",
        after_data: data,
        metadata: {
          code_prefix: data.code_prefix,
          membership_cycle: data.membership_cycle,
          bound_email: data.bound_email || null,
          booking_reference: data.booking_reference || null,
          benefit_type: benefitType || null
        }
      });
      return { code, activationCode: data };
    }

    lastError = error;
    if (error.code !== "23505") {
      throw error;
    }
  }

  throw lastError || new Error("Failed to generate membership activation code");
}

async function createMembershipActivationCodes(supabase, payload = {}, adminUserId) {
  const rawCount = Number(payload.count || payload.quantity || 1);
  const count = Number.isFinite(rawCount) ? Math.min(Math.max(1, Math.floor(rawCount)), 200) : 1;
  const items = [];
  for (let index = 0; index < count; index += 1) {
    const result = await createMembershipActivationCode(supabase, payload, adminUserId);
    items.push(result);
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    action: "membership_activation_codes_batch_created",
    metadata: {
      count,
      membership_cycle: assertMembershipCycle(payload.membership_cycle || getCurrentMembershipCycle()),
      benefit_type: normalizeText(payload.benefit_type) || null,
      notes: normalizeText(payload.notes) || null,
      code_prefixes: items.map(item => item.activationCode?.code_prefix).filter(Boolean)
    }
  });

  return {
    count: items.length,
    items
  };
}

async function listMembershipActivationCodes(supabase, filters = {}) {
  const page = Math.max(1, Number(filters.page || 1));
  const pageSize = Math.min(Math.max(1, Number(filters.page_size || 50)), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const cycle = normalizeText(filters.membership_cycle || filters.cycle);
  const status = normalizeText(filters.status);
  const search = normalizeText(filters.search).replace(/,/g, " ");
  const codePrefixSearch = search ? search.slice(0, 12) : "";

  let query = supabase
    .from("membership_activation_codes")
    .select(ACTIVATION_CODE_PUBLIC_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  if (cycle) {
    query = query.eq("membership_cycle", cycle);
  }
  if (status) {
    query = query.eq("status", status);
  }
  if (search) {
    query = query.or([
      `code_prefix.ilike.%${codePrefixSearch}%`,
      `bound_email.ilike.%${search}%`,
      `bound_phone.ilike.%${search}%`,
      `booking_reference.ilike.%${search}%`
    ].join(","));
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw error;
  }
  const adminIds = Array.from(new Set((data || [])
    .map(row => row.generated_by_admin_id)
    .filter(Boolean)
    .map(String)));
  const redeemedUserIds = Array.from(new Set((data || [])
    .map(row => row.redeemed_by_user_id)
    .filter(Boolean)
    .map(String)));
  let adminById = new Map();
  if (adminIds.length) {
    const { data: admins, error: adminError } = await supabase
      .from("admin_users")
      .select("id, name, username, email")
      .in("id", adminIds);
    if (adminError) {
      throw adminError;
    }
    adminById = new Map((admins || []).map(admin => [String(admin.id), adminDisplayFields(admin)]));
  }
  let redeemedUserById = new Map();
  if (redeemedUserIds.length) {
    const { data: redeemedUsers, error: redeemedUserError } = await supabase
      .from("site_users")
      .select("id, public_user_id, email, phone, nickname, wechat_id")
      .in("id", redeemedUserIds);
    if (redeemedUserError) {
      throw redeemedUserError;
    }
    redeemedUserById = new Map((redeemedUsers || []).map(user => [String(user.id), siteUserDisplayFields(user)]));
  }

  return {
    items: (data || []).map(row => ({
      ...activationCodePublicFields(row),
      generated_by_admin: adminById.get(String(row.generated_by_admin_id || "")) || null,
      redeemed_by_user: redeemedUserById.get(String(row.redeemed_by_user_id || "")) || null
    })),
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  };
}

async function revokeMembershipActivationCode(supabase, codeId, adminUserId, reason = "") {
  const id = normalizeText(codeId);
  if (!id) {
    throw new Error("activation code id is required");
  }

  const { data: before, error: beforeError } = await supabase
    .from("membership_activation_codes")
    .select(ACTIVATION_CODE_PUBLIC_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (beforeError) {
    throw beforeError;
  }
  if (!before) {
    throw new Error("Membership activation code not found");
  }

  const { data, error } = await supabase
    .from("membership_activation_codes")
    .update({ status: "revoked", notes: normalizeText(reason) || before.notes || null })
    .eq("id", id)
    .eq("status", "active")
    .select(ACTIVATION_CODE_PUBLIC_SELECT)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    const revokeError = new Error("Membership activation code cannot be revoked from its current status");
    revokeError.code = "MEMBERSHIP_CODE_NOT_ACTIVE";
    throw revokeError;
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    action: "membership_activation_code_revoked",
    before_data: before,
    after_data: data,
    metadata: {
      reason: normalizeText(reason) || null,
      code_prefix: data.code_prefix
    }
  });
  return activationCodePublicFields(data);
}

async function deleteMembershipActivationCode(supabase, codeId, adminUserId) {
  const id = normalizeText(codeId);
  if (!id) {
    throw new Error("activation code id is required");
  }

  const { data: before, error: beforeError } = await supabase
    .from("membership_activation_codes")
    .select(ACTIVATION_CODE_PUBLIC_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (beforeError) {
    throw beforeError;
  }
  if (!before) {
    throw new Error("Membership activation code not found");
  }
  if (before.status === "redeemed" || before.redeemed_by_user_id) {
    const deleteError = new Error("Membership activation code has already been redeemed and cannot be deleted");
    deleteError.code = "MEMBERSHIP_CODE_REDEEMED";
    throw deleteError;
  }

  const { error } = await supabase
    .from("membership_activation_codes")
    .delete()
    .eq("id", id);
  if (error) {
    throw error;
  }

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    action: "membership_activation_code_deleted",
    before_data: before,
    metadata: {
      code_prefix: before.code_prefix,
      membership_cycle: before.membership_cycle
    }
  });

  return { deleted: true, id, code_prefix: before.code_prefix };
}

async function redeemMembershipActivationCode(supabase, rawCode, siteUser, options = {}) {
  const code = normalizeActivationCode(rawCode);
  if (!code) {
    const error = new Error("请输入会员激活码");
    error.code = "MEMBERSHIP_CODE_REQUIRED";
    throw error;
  }

  const codeHash = hashActivationCode(code);
  const { data: activationCode, error } = await supabase
    .from("membership_activation_codes")
    .select("*")
    .eq("code_hash", codeHash)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!activationCode) {
    const invalid = new Error("无效会员激活码");
    invalid.code = "MEMBERSHIP_CODE_INVALID";
    throw invalid;
  }

  if (!ACTIVATION_CODE_STATUSES.includes(activationCode.status)) {
    const invalidStatus = new Error("会员激活码状态无效");
    invalidStatus.code = "MEMBERSHIP_CODE_INVALID_STATUS";
    throw invalidStatus;
  }
  if (activationCode.status === "redeemed") {
    const redeemed = new Error("会员激活码已使用");
    redeemed.code = "MEMBERSHIP_CODE_REDEEMED";
    throw redeemed;
  }
  if (activationCode.status === "revoked") {
    const revoked = new Error("会员激活码已作废");
    revoked.code = "MEMBERSHIP_CODE_REVOKED";
    throw revoked;
  }
  const expiresAt = activationCode.expires_at ? new Date(activationCode.expires_at) : null;
  if (activationCode.status === "expired" || (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now())) {
    if (activationCode.status === "active") {
      await supabase
        .from("membership_activation_codes")
        .update({ status: "expired" })
        .eq("id", activationCode.id)
        .eq("status", "active");
    }
    const expired = new Error("会员激活码已过期");
    expired.code = "MEMBERSHIP_CODE_EXPIRED";
    throw expired;
  }

  const userEmail = normalizeEmail(siteUser?.email);
  if (activationCode.bound_email && normalizeEmail(activationCode.bound_email) !== userEmail) {
    const mismatch = new Error("当前登录邮箱与会员激活码绑定邮箱不匹配");
    mismatch.code = "MEMBERSHIP_CODE_EMAIL_MISMATCH";
    throw mismatch;
  }

  const membershipCycle = assertMembershipCycle(activationCode.membership_cycle);
  const existingEntitlement = await getActiveEntitlement(supabase, siteUser.id, membershipCycle);
  if (existingEntitlement) {
    return {
      status: "already_member",
      activationCode: activationCodePublicFields(activationCode),
      entitlement: existingEntitlement
    };
  }

  const redeemedAt = new Date().toISOString();
  const memberBirthday = normalizeMemberBirthday(options.member_birthday);
  let claimedCodeResult = await supabase
    .from("membership_activation_codes")
    .update({
      status: "redeemed",
      redeemed_by_user_id: siteUser.id,
      redeemed_at: redeemedAt,
      member_birthday: memberBirthday
    })
    .eq("id", activationCode.id)
    .eq("status", "active")
    .is("redeemed_by_user_id", null)
    .select(ACTIVATION_CODE_PUBLIC_SELECT_WITH_BIRTHDAY)
    .maybeSingle();

  if (claimedCodeResult.error && isMissingMemberBirthdayColumnError(claimedCodeResult.error)) {
    claimedCodeResult = await supabase
      .from("membership_activation_codes")
      .update({
        status: "redeemed",
        redeemed_by_user_id: siteUser.id,
        redeemed_at: redeemedAt
      })
      .eq("id", activationCode.id)
      .eq("status", "active")
      .is("redeemed_by_user_id", null)
      .select(ACTIVATION_CODE_PUBLIC_SELECT)
      .maybeSingle();
  }

  const { data: claimedCode, error: claimError } = claimedCodeResult;
  if (claimError) {
    throw claimError;
  }
  if (!claimedCode) {
    const conflict = new Error("会员激活码已使用");
    conflict.code = "MEMBERSHIP_CODE_REDEEMED";
    throw conflict;
  }

  let entitlement;
  try {
    entitlement = await grantMembershipEntitlement(supabase, {
      site_user_id: siteUser.id,
      membership_cycle: membershipCycle,
      grant_source: "activation_code",
      notes: activationCode.notes || null,
      metadata: {
        activation_code_id: activationCode.id,
        code_prefix: activationCode.code_prefix,
        member_birthday: memberBirthday,
        booking_reference: activationCode.booking_reference || null
      }
    }, null);
  } catch (grantError) {
    const rollbackResult = await supabase
      .from("membership_activation_codes")
      .update({
        status: "active",
        redeemed_by_user_id: null,
        redeemed_at: null,
        member_birthday: null
      })
      .eq("id", activationCode.id)
      .eq("status", "redeemed")
      .eq("redeemed_by_user_id", siteUser.id);
    if (rollbackResult.error && isMissingMemberBirthdayColumnError(rollbackResult.error)) {
      await supabase
        .from("membership_activation_codes")
        .update({
          status: "active",
          redeemed_by_user_id: null,
          redeemed_at: null
        })
        .eq("id", activationCode.id)
        .eq("status", "redeemed")
        .eq("redeemed_by_user_id", siteUser.id);
    }
    throw grantError;
  }

  await logMembershipAudit(supabase, {
    site_user_id: siteUser.id,
    entitlement_id: entitlement.id,
    action: "membership_activation_code_redeemed",
    after_data: claimedCode,
    metadata: {
      activation_code_id: activationCode.id,
      code_prefix: activationCode.code_prefix,
      member_birthday: memberBirthday,
      membership_cycle: membershipCycle
    }
  });

  return {
    status: "redeemed",
    activationCode: activationCodePublicFields(claimedCode),
    entitlement
  };
}

module.exports = {
  BENEFIT_TYPES,
  PUBLIC_BENEFIT_TYPES,
  LIVE_CLAIM_STATUSES,
  MEMBERSHIP_CONFIG,
  getCurrentMembershipCycle,
  getActiveEntitlement,
  getActiveClaim,
  selectBenefit,
  calculateMembershipDiscount,
  bindClaimToOrder,
  releaseClaimOrderBinding,
  markClaimUsed,
  cancelOrResetClaim,
  createManualClaim,
  deleteMembershipEntitlement,
  grantMembershipEntitlement,
  createMembershipActivationCode,
  createMembershipActivationCodes,
  deleteMembershipActivationCode,
  listMembershipActivationCodes,
  revokeMembershipActivationCode,
  redeemMembershipActivationCode,
  logMembershipAudit,
  normalizeMoney,
  assertMembershipCycle
};
