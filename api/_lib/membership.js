const BENEFIT_TYPES = ["storage", "pickup", "moving", "welcome_pack", "cashback"];
const PUBLIC_BENEFIT_TYPES = ["storage", "pickup"];
const LIVE_CLAIM_STATUSES = ["selected", "reserved", "used", "manual"];
const ORDER_LINK_TABLES = ["storage_orders", "transport_requests", "manual"];

const MEMBERSHIP_CONFIG = {
  defaultCycle: "2026-27",
  storage: {
    freeStandardBoxLimit: 5
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

  const purchaseTotal = sumMoney([
    orderPayload?.purchaseTotal,
    estimate.purchaseTotal,
    serviceDetails.purchaseTotal,
    ...(Array.isArray(orderPayload?.purchased_boxes) ? orderPayload.purchased_boxes.map(item => item?.subtotal || item?.purchase) : [])
  ]);
  const overweightFee = normalizeMoney(pickNestedNumber({ estimate, serviceDetails }, [
    "estimate.overweightFee",
    "estimate.overweight_fee",
    "estimate.extraWeightFee",
    "serviceDetails.overweightFee"
  ]));
  const stairsFee = normalizeMoney(pickNestedNumber({ estimate, serviceDetails }, [
    "estimate.stairsFee",
    "estimate.stairs_fee",
    "estimate.upstairsFee",
    "estimate.upstairs_fee",
    "serviceDetails.stairsFee",
    "serviceDetails.upstairsFee"
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
    { type: "box_purchase", amount: purchaseTotal },
    { type: "overweight", amount: overweightFee },
    { type: "stairs", amount: stairsFee },
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
        coveredBoxCount
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
    .in("status", ["selected", "reserved"])
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
    grant_source: "admin",
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

  await logMembershipAudit(supabase, {
    admin_user_id: adminUserId || null,
    site_user_id: data.site_user_id,
    entitlement_id: data.id,
    action: "membership_entitlement_granted",
    after_data: data
  });
  return data;
}

module.exports = {
  BENEFIT_TYPES,
  LIVE_CLAIM_STATUSES,
  MEMBERSHIP_CONFIG,
  getCurrentMembershipCycle,
  getActiveEntitlement,
  getActiveClaim,
  selectBenefit,
  calculateMembershipDiscount,
  bindClaimToOrder,
  markClaimUsed,
  cancelOrResetClaim,
  createManualClaim,
  grantMembershipEntitlement,
  logMembershipAudit,
  normalizeMoney,
  assertMembershipCycle
};
