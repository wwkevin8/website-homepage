const { getSupabaseAdmin } = require("../../../_lib/supabase");
const { sendJson } = require("../../../_lib/http");
const { handleStorageMembershipUnbind } = require("../../../_lib/storage-membership-unbind");

function createStorageMembershipUnbindRoute(dependencies = {}) {
  const loadSupabase = dependencies.getSupabaseAdmin || getSupabaseAdmin;
  const handleUnbind = dependencies.handleStorageMembershipUnbind || handleStorageMembershipUnbind;
  return async function storageMembershipUnbindRoute(req, res) {
    try {
      await handleUnbind(req, res, {
        supabase: loadSupabase(),
        claimId: req.query?.claimId
      });
    } catch (error) {
      console.error("[storage-membership-unbind-route] request failed", {
        code: error?.code || null,
        message: error?.message || "unknown error"
      });
      sendJson(res, 500, {
        data: null,
        error: { message: "解除寄存会员权益关联失败，请稍后重试", details: null }
      });
    }
  };
}

module.exports = createStorageMembershipUnbindRoute();
module.exports.createStorageMembershipUnbindRoute = createStorageMembershipUnbindRoute;
