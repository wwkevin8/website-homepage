const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { createManualRequest } = require("../_lib/transport-manual-import");

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) return;

  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const row = body.row && typeof body.row === "object" ? body.row : body;
    const result = await createManualRequest(supabase, adminUser, row, {
      confirmWarnings: body.confirm_warnings === true || body.confirmWarnings === true,
      groupAction: body.group_action || body.groupAction || body.group_handling,
      targetGroupId: body.target_group_id || body.targetGroupId || body.group_id || body.group_code
    });

    if (!result.ok) {
      badRequest(
        res,
        result.requires_confirmation ? "warnings require confirmation" : "manual import validation failed",
        result.preview
      );
      return;
    }

    ok(res, result);
  } catch (error) {
    if (error?.statusCode && error.statusCode < 500) {
      badRequest(res, error.message, error.details || null);
      return;
    }
    serverError(res, error);
  }
};
