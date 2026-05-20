const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, forbidden, serverError } = require("../_lib/http");
const { runStorageSyncAudit } = require("../_lib/storage-sync-audit");
const { sendStorageSyncDailyDigestEmail } = require("../_lib/storage-sync-audit-email");

function getAuthorizationBearerSecret(req) {
  const value = String(req?.headers?.authorization || "").trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1] || "").trim() : "";
}

function getLondonDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

async function hasSentStorageDigestToday(supabase, currentLogId) {
  const todayKey = getLondonDateKey(new Date());
  const sinceIso = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("storage_sync_audit_logs")
    .select("id,checked_at,notification")
    .gte("checked_at", sinceIso)
    .order("checked_at", { ascending: false })
    .limit(30);

  if (error) {
    return {
      ok: false,
      skipped: true,
      reason: "digest_dedupe_check_failed",
      error: error.message || "Failed to check prior storage digest notifications"
    };
  }

  const alreadySent = (Array.isArray(data) ? data : []).some((item) => {
    if (currentLogId && String(item.id) === String(currentLogId)) {
      return false;
    }
    const notification = item.notification || {};
    return getLondonDateKey(item.checked_at) === todayKey
      && notification.ok === true
      && notification.skipped === false;
  });

  return alreadySent
    ? { ok: true, skipped: true, reason: "daily_digest_already_sent", date: todayKey }
    : null;
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

    const existingDigest = await hasSentStorageDigestToday(supabase, report.storage?.log_id);
    const notification = existingDigest || await sendStorageSyncDailyDigestEmail(report);
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
