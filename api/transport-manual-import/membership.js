const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, forbidden, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { buildMembershipManualCommand } = require("../_lib/transport-membership-manual");

function sendRpcError(res, error) {
  const message = String(error?.message || "membership pickup order could not be created");
  if (error?.code === "42501") return forbidden(res, message);
  const detailsText = String(error?.details || "");
  if (/contact mismatch confirmation/i.test(message)) {
    let fields = [];
    try { fields = JSON.parse(detailsText); } catch (_) {}
    return badRequest(res, "订单联系方式与所选会员资料不一致，请核对并确认后重试。", { code: "contact_mismatch", fields });
  }
  if (/possible duplicate/i.test(message)) {
    let duplicate = {};
    try { duplicate = JSON.parse(detailsText); } catch (_) {}
    return badRequest(res, "检测到可能重复的会员接机订单，请核查后确认是否继续。", { code: "possible_duplicate", duplicate });
  }
  if (/exact duplicate/i.test(message)) return badRequest(res, "已存在相同会员、航班和时间的有效订单，不能重复补录。", { code: "exact_duplicate", order_no: detailsText || null });
  if (/group.*full/i.test(message)) return badRequest(res, "目标拼车组已满，请重新选择。", { code: "group_full" });
  if (/group.*not open|group.*closed/i.test(message)) return badRequest(res, "目标拼车组已关闭或状态已变化，请重新选择。", { code: "group_unavailable" });
  if (/group.*incompatible/i.test(message)) return badRequest(res, "目标拼车组与当前接机行程不兼容，请重新选择。", { code: "group_incompatible" });
  if (/claim.*unavailable|claim.*occupied|live claim/i.test(message)) return badRequest(res, "该会员当前没有可用接机权益，请刷新会员信息后重试。", { code: "claim_unavailable" });
  if (/entitlement/i.test(message)) return badRequest(res, "所选会员权益当前不可用，请重新选择。", { code: "entitlement_unavailable" });
  if (/idempotency key payload conflict/i.test(message)) return badRequest(res, "本次提交内容与原请求不一致，请核查后重新开始一笔补录。", { code: "idempotency_conflict" });
  if (["22023", "23503", "23505", "23514", "P0001"].includes(error?.code)) {
    return badRequest(res, "会员权益补录未完成，请核对会员、权益和行程信息。", { code: "membership_manual_rejected" });
  }
  return serverError(res, error);
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase, {
    roles: ["operations_admin", "super_admin"]
  });
  if (!adminUser) return;
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const command = buildMembershipManualCommand(adminUser, body);
    const { data, error } = await supabase.rpc("admin_create_membership_transport_request_atomic", {
      p_admin_user_id: adminUser.id,
      p_idempotency_key: command.idempotency_key,
      p_payload_hash: command.payload_hash,
      p_site_user_id: command.site_user_id,
      p_entitlement_id: command.entitlement_id,
      p_claim_id: command.claim_id,
      p_request: command.request,
      p_pricing: command.pricing,
      p_group_action: command.group_action,
      p_target_group_id: command.target_group_id,
      p_reason: command.reason,
      p_confirm_contact_mismatch: command.confirm_contact_mismatch,
      p_confirm_duplicate: command.confirm_duplicate
    });
    if (error) return sendRpcError(res, error);
    ok(res, data);
  } catch (error) {
    if (error?.statusCode && error.statusCode < 500) {
      badRequest(res, error.message, error.details || null);
      return;
    }
    serverError(res, error);
  }
};
