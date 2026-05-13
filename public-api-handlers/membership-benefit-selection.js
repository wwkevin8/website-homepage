const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getCurrentMembershipCycle, selectBenefit } = require("../api/_lib/membership");
const { badRequest, created, methodNotAllowed, parseJsonBody, serverError, unauthorized } = require("../api/_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录后选择会员权益");
      return;
    }

    const body = await parseJsonBody(req);
    try {
      const claim = await selectBenefit(
        supabase,
        siteUser.id,
        getCurrentMembershipCycle(),
        body.benefit_type || body.benefitType
      );
      created(res, { claim });
    } catch (error) {
      if (
        error.code === "NO_ACTIVE_MEMBERSHIP"
        || error.code === "MEMBERSHIP_BENEFIT_ALREADY_SELECTED"
        || error.message === "This membership benefit is handled by customer service"
        || error.message === "Invalid membership benefit type"
      ) {
        badRequest(res, error.message, error.claim ? { claim: error.claim } : null);
        return;
      }
      throw error;
    }
  } catch (error) {
    serverError(res, error);
  }
};
