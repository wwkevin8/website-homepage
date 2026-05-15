const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const {
  getActiveClaim,
  getActiveEntitlement,
  getCurrentMembershipCycle,
  PUBLIC_BENEFIT_TYPES,
  redeemMembershipActivationCode
} = require("../api/_lib/membership");
const { badRequest, methodNotAllowed, ok, parseJsonBody, serverError, unauthorized } = require("../api/_lib/http");

function mapRedeemError(error) {
  const messages = {
    MEMBERSHIP_CODE_REQUIRED: "请输入会员激活码",
    MEMBERSHIP_CODE_INVALID: "无效会员激活码",
    MEMBERSHIP_CODE_REDEEMED: "会员激活码已使用",
    MEMBERSHIP_CODE_REVOKED: "会员激活码已作废",
    MEMBERSHIP_CODE_EXPIRED: "会员激活码已过期",
    MEMBERSHIP_CODE_EMAIL_MISMATCH: "当前登录邮箱与会员激活码绑定邮箱不匹配",
    MEMBERSHIP_BIRTHDAY_REQUIRED: "请输入会员生日（月日）",
    MEMBERSHIP_BIRTHDAY_INVALID: "会员生日请使用 MM-DD 格式，例如 08-21"
  };
  return messages[error?.code] || null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录后兑换会员激活码");
      return;
    }

    const body = await parseJsonBody(req);
    let redeemResult;
    try {
      redeemResult = await redeemMembershipActivationCode(supabase, body.code, siteUser, {
        member_birthday: body.member_birthday
      });
    } catch (error) {
      const message = mapRedeemError(error);
      if (message) {
        badRequest(res, message, { code: error.code });
        return;
      }
      throw error;
    }

    const cycle = redeemResult.entitlement?.membership_cycle || getCurrentMembershipCycle();
    const [entitlement, claim] = await Promise.all([
      getActiveEntitlement(supabase, siteUser.id, cycle),
      getActiveClaim(supabase, siteUser.id, cycle)
    ]);

    ok(res, {
      redeemStatus: redeemResult.status,
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
