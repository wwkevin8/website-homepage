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
      confirmWarnings: body.confirm_warnings === true || body.confirmWarnings === true
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
    serverError(res, error);
  }
};
