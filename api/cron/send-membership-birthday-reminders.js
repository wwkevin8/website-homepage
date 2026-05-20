const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, forbidden, serverError } = require("../_lib/http");
const { runMembershipBirthdayReminders } = require("../_lib/membership-birthday-reminders");

function getAuthorizationBearerSecret(req) {
  const value = String(req?.headers?.authorization || "").trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  const suppliedSecret = getAuthorizationBearerSecret(req);
  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    forbidden(res, expectedSecret ? "Invalid cron secret" : "Missing cron secret");
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const report = await runMembershipBirthdayReminders(supabase);
    ok(res, report);
  } catch (error) {
    serverError(res, error);
  }
};
