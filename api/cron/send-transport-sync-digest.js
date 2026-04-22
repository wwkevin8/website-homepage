const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, forbidden, serverError, getCronSuppliedSecret } = require("../_lib/http");
const { sendTransportSyncDailyDigestEmail } = require("../_lib/transport-sync-audit-email");

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`relation "${relationName}" does not exist`)
    || message.includes(`Could not find the table 'public.${relationName}' in the schema cache`);
}

function getHoursWindow(req) {
  const raw = Number.parseInt(String(req.query?.hours || "").trim(), 10);
  if (Number.isInteger(raw) && raw > 0) {
    return Math.min(raw, 168);
  }
  return 24;
}

function summarizeLogs(items, hoursWindow) {
  const logs = Array.isArray(items) ? items : [];
  const periodEnd = new Date().toISOString();
  const periodStart = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();
  const topMismatches = [];
  const topSkipped = [];

  logs.forEach(item => {
    (item.mismatches || []).forEach(entry => {
      if (topMismatches.length < 20) {
        topMismatches.push(entry);
      }
    });
    (item.skipped_checks || []).forEach(entry => {
      if (topSkipped.length < 20) {
        topSkipped.push(entry);
      }
    });
  });

  return {
    periodStart,
    periodEnd,
    runCount: logs.length,
    sampledGroupTotal: logs.reduce((sum, item) => sum + Number(item.sampled_group_count || 0), 0),
    checkedRequestTotal: logs.reduce((sum, item) => sum + Number(item.checked_request_count || 0), 0),
    mismatchTotal: logs.reduce((sum, item) => sum + Number(item.mismatch_count || 0), 0),
    runsWithMismatches: logs.filter(item => Number(item.mismatch_count || 0) > 0).length,
    skippedTotal: logs.reduce((sum, item) => sum + Number(item.skipped_check_count || 0), 0),
    topMismatches,
    topSkipped
  };
}

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
    const hoursWindow = getHoursWindow(req);
    const sinceIso = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("transport_sync_audit_logs")
      .select("*")
      .gte("checked_at", sinceIso)
      .order("checked_at", { ascending: false });

    if (error) {
      if (isMissingRelationError(error, "transport_sync_audit_logs")) {
        ok(res, {
          storage: {
            ready: false,
            reason: "missing_table"
          },
          notification: {
            ok: false,
            skipped: true,
            reason: "missing_table"
          }
        });
        return;
      }
      throw error;
    }

    const summary = summarizeLogs(data || [], hoursWindow);
    const notification = await sendTransportSyncDailyDigestEmail(summary);

    ok(res, {
      summary,
      storage: {
        ready: true,
        record_count: Array.isArray(data) ? data.length : 0
      },
      notification
    });
  } catch (error) {
    serverError(res, error);
  }
};
