const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, forbidden, serverError } = require("../_lib/http");
const { runStorageSyncAudit } = require("../_lib/storage-sync-audit");
const { sendStorageSyncDailyDigestEmail } = require("../_lib/storage-sync-audit-email");

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
    const report = await runStorageSyncAudit(supabase, {
      sampleSize: req.query?.sample_size
    });

    const notification = await sendStorageSyncDailyDigestEmail(report);
    report.notification = notification;
    if (report.storage?.log_id) {
      const { error } = await supabase
        .from("storage_sync_audit_logs")
        .update({ notification })
        .eq("id", report.storage.log_id);
      if (error) {
        report.notification_log_update = {
          ok: false,
          error: error.message || "Failed to update audit notification status"
        };
      } else {
        report.notification_log_update = { ok: true };
      }
    }

    ok(res, report);
  } catch (error) {
    serverError(res, error);
  }
};
