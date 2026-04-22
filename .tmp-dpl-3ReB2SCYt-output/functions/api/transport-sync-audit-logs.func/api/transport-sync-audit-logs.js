const { getSupabaseAdmin } = require("./_lib/supabase");
const { requireAdminUser } = require("./_lib/admin-auth");
const { ok, methodNotAllowed, serverError } = require("./_lib/http");

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`relation "${relationName}" does not exist`)
    || message.includes(`Could not find the table 'public.${relationName}' in the schema cache`);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
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

    let query = supabase
      .from("transport_sync_audit_logs")
      .select(selectColumns, { count: "exact" })
      .order("checked_at", { ascending: false })
      .range(from, to);

    if (mismatchOnly) {
      query = query.gt("mismatch_count", 0);
    }

    const { data, error, count } = await query;
    if (error) {
      if (isMissingRelationError(error, "transport_sync_audit_logs")) {
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
