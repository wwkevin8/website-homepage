const { getSupabaseAdmin } = require("./_lib/supabase");
const { requireAdminUser } = require("./_lib/admin-auth");
const { ok, methodNotAllowed, serverError } = require("./_lib/http");

function isPerfLogEnabled() {
  return process.env.NODE_ENV !== "production";
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function logPerf(label, details) {
  if (!isPerfLogEnabled()) {
    return;
  }
  console.info(`[perf][transport-sync-audit-logs] ${label}`, details);
}

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`relation "${relationName}" does not exist`)
    || message.includes(`Could not find the table 'public.${relationName}' in the schema cache`);
}

module.exports = async function handler(req, res) {
  const startedAt = nowMs();
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  try {
    const page = Math.max(Number.parseInt(req.query?.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query?.page_size, 10) || 20, 1), 100);
    const mismatchOnly = String(req.query?.mismatch_only || "").toLowerCase() === "true";
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const selectColumns = [
      "checked_at",
      "sampled_group_count",
      "sampled_group_ids",
      "checked_request_count",
      "checked_order_nos",
      "skipped_check_count",
      "skipped_checks",
      "mismatch_count",
      "mismatches"
    ].join(", ");
    const largeJsonFields = ["sampled_group_ids", "checked_order_nos", "skipped_checks", "mismatches"];

    let query = supabase
      .from("transport_sync_audit_logs")
      .select(selectColumns, { count: "exact" })
      .order("checked_at", { ascending: false })
      .range(from, to);

    if (mismatchOnly) {
      query = query.gt("mismatch_count", 0);
    }

    const queryStartedAt = nowMs();
    const { data, error, count } = await query;
    const queryMs = nowMs() - queryStartedAt;
    if (error) {
      if (isMissingRelationError(error, "transport_sync_audit_logs")) {
        logPerf("list", {
          authMs,
          queryMs,
          countMs: queryMs,
          totalMs: nowMs() - startedAt,
          rows: 0,
          page,
          pageSize,
          countMode: "exact",
          hasLargeJsonFields: true,
          largeJsonFields,
          storageReady: false,
          cacheHit: null
        });
        ok(res, {
          items: [],
          pagination: {
            page,
            page_size: pageSize,
            total: 0,
            total_pages: 0
          },
          storage: {
            ready: false,
            reason: "missing_table"
          }
        });
        return;
      }
      throw error;
    }
    const rows = Array.isArray(data) ? data.length : 0;

    logPerf("list", {
      authMs,
      queryMs,
      countMs: queryMs,
      totalMs: nowMs() - startedAt,
      rows,
      page,
      pageSize,
      countMode: "exact",
      hasLargeJsonFields: true,
      largeJsonFields,
      storageReady: true,
      cacheHit: null
    });

    ok(res, {
      items: data || [],
      pagination: {
        page,
        page_size: pageSize,
        total: Number(count || 0),
        total_pages: count ? Math.ceil(count / pageSize) : 0
      },
      storage: {
        ready: true
      }
    });
  } catch (error) {
    serverError(res, error);
  }
};
