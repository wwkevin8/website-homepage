const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getCurrentMembershipCycle, getActiveEntitlement, getActiveClaim, PUBLIC_BENEFIT_TYPES } = require("../api/_lib/membership");
const { methodNotAllowed, ok, serverError, unauthorized } = require("../api/_lib/http");

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

    ok(res, {
      cycle,
      isMember: Boolean(entitlement),
      entitlement,
      claim,
      availableBenefits: claim ? [] : PUBLIC_BENEFIT_TYPES,
      serviceHandledBenefits: ["cashback"]
    });
  } catch (error) {
    serverError(res, error);
  }
};
