const { getSupabaseAdmin } = require("./_lib/supabase");
const { requireAdminUser } = require("./_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("./_lib/http");
const { closeExpiredRequests } = require("./_lib/transport");
const { backfillMissingPickupGroups, cleanupEmptyTransportGroups } = require("./_lib/transport-group-lifecycle");

function normalizeAction(value) {
  const action = String(value || "").trim().toLowerCase();
  if (["run_all", "backfill_missing_pickup_groups", "close_expired_requests", "cleanup_empty_groups"].includes(action)) {
    return action;
  }
  return "";
}

function normalizeExcludeSources(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return source
    .map(item => String(item || "").trim())
    .filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const action = normalizeAction(body.action);
    if (!action) {
      badRequest(res, "action is required");
      return;
    }

    const result = {
      action,
      backfill_missing_pickup_groups: null,
      close_expired_requests: null,
      cleanup_empty_groups: null
    };

    if (action === "run_all" || action === "backfill_missing_pickup_groups") {
      const backfillResult = await backfillMissingPickupGroups(supabase, {
        excludeSources: normalizeExcludeSources(body.exclude_sources)
      });
      const createdGroups = Array.isArray(backfillResult) ? backfillResult : [];
      result.backfill_missing_pickup_groups = {
        created: createdGroups.length,
        groups: createdGroups
      };
    }

    if (action === "run_all" || action === "close_expired_requests") {
      const closedRequests = await closeExpiredRequests(supabase);
      result.close_expired_requests = {
        closed: Array.isArray(closedRequests) ? closedRequests.length : 0
      };
    }

    if (action === "run_all" || action === "cleanup_empty_groups") {
      const cleanupResult = await cleanupEmptyTransportGroups(supabase);
      result.cleanup_empty_groups = {
        deleted: Array.isArray(cleanupResult?.deleted) ? cleanupResult.deleted.length : 0,
        skipped: Array.isArray(cleanupResult?.skipped_items) ? cleanupResult.skipped_items.length : 0
      };
    }

    ok(res, result);
  } catch (error) {
    serverError(res, error);
  }
};
