const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getCurrentMembershipCycle, getActiveEntitlement, getActiveClaim, PUBLIC_BENEFIT_TYPES } = require("../api/_lib/membership");
const { methodNotAllowed, ok, serverError, unauthorized } = require("../api/_lib/http");

function hasMoneyValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

async function enrichClaimWithLinkedStorageOrder(supabase, claim, siteUserId) {
  if (!claim || claim.benefit_type !== "storage" || claim.linked_order_table !== "storage_orders") {
    return claim;
  }

  try {
    let query = supabase
      .from("storage_orders")
      .select("id, order_no, membership_discount_amount, extra_charge_amount, final_price")
      .eq("site_user_id", siteUserId)
      .limit(1);

    if (claim.linked_order_id) {
      query = query.eq("id", claim.linked_order_id);
    } else if (claim.linked_order_no) {
      query = query.eq("order_no", claim.linked_order_no);
    } else {
      return claim;
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      if (error) {
        console.warn("[membership-me] failed to load linked storage order", error);
      }
      return claim;
    }

    return {
      ...claim,
      membership_discount_amount: hasMoneyValue(data.membership_discount_amount)
        ? data.membership_discount_amount
        : claim.membership_discount_amount,
      extra_charge_amount: hasMoneyValue(data.extra_charge_amount)
        ? data.extra_charge_amount
        : claim.extra_charge_amount,
      final_price: hasMoneyValue(data.final_price)
        ? data.final_price
        : claim.final_price
    };
  } catch (error) {
    console.warn("[membership-me] failed to enrich membership claim", error);
    return claim;
  }
}

async function enrichClaimWithLinkedTransportRequest(supabase, claim, siteUserId) {
  if (!claim || claim.benefit_type !== "pickup") {
    return claim;
  }
  if (claim.linked_order_table && claim.linked_order_table !== "transport_requests") {
    return claim;
  }

  try {
    let query = supabase
      .from("transport_requests")
      .select("id, order_no, membership_benefit_claim_id, membership_discount_amount, extra_charge_amount, final_price, service_type, status, flight_datetime, preferred_time_start, created_at")
      .eq("site_user_id", siteUserId)
      .eq("service_type", "pickup")
      .in("status", ["published", "matched"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (claim.linked_order_id) {
      query = query.eq("id", claim.linked_order_id);
    } else if (claim.linked_order_no) {
      query = query.eq("order_no", claim.linked_order_no);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) {
      if (error) {
        console.warn("[membership-me] failed to load linked transport request", error);
      }
      return claim;
    }

    const hasStoredBinding = Boolean(claim.linked_order_id || claim.linked_order_no || data.membership_benefit_claim_id);
    return {
      ...claim,
      status: claim.status === "selected" && !hasStoredBinding ? "reserved" : claim.status,
      original_status: claim.status,
      linked_order_table: "transport_requests",
      linked_order_id: claim.linked_order_id || data.id,
      linked_order_no: claim.linked_order_no || data.order_no,
      membership_discount_amount: hasMoneyValue(data.membership_discount_amount)
        ? data.membership_discount_amount
        : claim.membership_discount_amount,
      extra_charge_amount: hasMoneyValue(data.extra_charge_amount)
        ? data.extra_charge_amount
        : claim.extra_charge_amount,
      final_price: hasMoneyValue(data.final_price)
        ? data.final_price
        : claim.final_price,
      display_binding_source: hasStoredBinding ? "stored_transport_request" : "matched_transport_request"
    };
  } catch (error) {
    console.warn("[membership-me] failed to enrich pickup membership claim", error);
    return claim;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录后查看会员状态");
      return;
    }

    const cycle = getCurrentMembershipCycle();
    const [entitlement, claim] = await Promise.all([
      getActiveEntitlement(supabase, siteUser.id, cycle),
      getActiveClaim(supabase, siteUser.id, cycle)
    ]);

    const storageEnrichedClaim = await enrichClaimWithLinkedStorageOrder(supabase, claim, siteUser.id);
    const publicClaim = await enrichClaimWithLinkedTransportRequest(supabase, storageEnrichedClaim, siteUser.id);

    ok(res, {
      cycle,
      isMember: Boolean(entitlement),
      entitlement,
      claim: publicClaim,
      availableBenefits: publicClaim ? [] : PUBLIC_BENEFIT_TYPES,
      serviceHandledBenefits: ["cashback"]
    });
  } catch (error) {
    serverError(res, error);
  }
};
