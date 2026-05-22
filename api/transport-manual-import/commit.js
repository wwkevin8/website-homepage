const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { commitRows } = require("../_lib/transport-manual-import");

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
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      badRequest(res, "rows are required");
      return;
    }

    ok(res, await commitRows(supabase, adminUser, rows, {
      confirmedWarnings: body.confirmed_warnings || body.confirmedWarnings || {}
    }));
  } catch (error) {
    serverError(res, error);
  }
};
