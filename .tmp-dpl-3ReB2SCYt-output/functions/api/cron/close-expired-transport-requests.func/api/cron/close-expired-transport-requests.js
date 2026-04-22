const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, forbidden, serverError, getCronSuppliedSecret } = require("../_lib/http");
const { closeExpiredRequests } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  const suppliedSecret = getCronSuppliedSecret(req);
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    forbidden(res, "Invalid cron secret");
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const closedRequests = await closeExpiredRequests(supabase);
    ok(res, {
      closedCount: closedRequests.length
    });
  } catch (error) {
    serverError(res, error);
  }
};
