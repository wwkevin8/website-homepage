const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyRequestFilters, mapRequestPayload, deriveRequestDisplayFlags } = require("../_lib/transport");
const { createPickupRequestWithGroup } = require("../_lib/transport-group-lifecycle");
const { logAdminOperation } = require("../_lib/orders");

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
  console.info(`[perf][transport-requests] ${label}`, details);
}

const REQUEST_LIST_SELECT = [
  "id",
  "order_no",
  "student_name",
  "student_pinyin",
  "email",
  "phone",
  "wechat",
  "site_user_id",
  "service_type",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "preferred_time_start",
  "passenger_count",
  "location_from",
  "location_to",
  "luggage_count",
  "shareable",
  "status",
  "admin_note",
  "contact_status",
  "payment_collection_status",
  "deposit_amount_gbp",
  "offline_recorded",
  "last_operated_by",
  "last_operated_at",
  "source",
  "created_by_admin_name",
  "import_batch_id",
  "manual_price_gbp",
  "manual_payment_status",
  "membership_benefit_claim_id",
  "membership_discount_amount",
  "created_at",
  "transport_group_members(group_id,is_initiator,request_id)",
  "site_users(email)"
].join(", ");

const REQUEST_COMPACT_SELECT = [
  "id",
  "order_no",
  "student_name",
  "student_pinyin",
  "service_type",
  "airport_code",
  "terminal",
  "flight_datetime",
  "preferred_time_start",
  "location_from",
  "location_to",
  "passenger_count",
  "luggage_count",
  "shareable",
  "status",
  "admin_note",
  "contact_status",
  "payment_collection_status",
  "deposit_amount_gbp",
  "offline_recorded",
  "last_operated_by",
  "last_operated_at",
  "source",
  "import_batch_id",
  "manual_payment_status",
  "membership_benefit_claim_id",
  "membership_discount_amount",
  "created_at",
  "transport_group_members(group_id,is_initiator,request_id)"
].join(", ");

const MANUAL_IMPORT_COLUMNS = new Set([
  "source",
  "created_by_admin_name",
  "import_batch_id",
  "manual_price_gbp",
  "manual_payment_status"
]);

const WORKBENCH_COLUMNS = new Set([
  "student_pinyin",
  "preferred_time_start",
  "passenger_count",
  "shareable",
  "admin_note",
  "contact_status",
  "payment_collection_status",
  "deposit_amount_gbp"
]);

const MEMBERSHIP_COLUMNS = new Set([
  "membership_benefit_claim_id",
  "membership_discount_amount"
]);

const REQUEST_LIST_SELECT_LEGACY = REQUEST_LIST_SELECT
  .split(", ")
  .filter(column => !MANUAL_IMPORT_COLUMNS.has(column) && !WORKBENCH_COLUMNS.has(column) && !MEMBERSHIP_COLUMNS.has(column))
  .join(", ");

const REQUEST_COMPACT_SELECT_LEGACY = REQUEST_COMPACT_SELECT
  .split(", ")
  .filter(column => !MANUAL_IMPORT_COLUMNS.has(column) && !WORKBENCH_COLUMNS.has(column) && !MEMBERSHIP_COLUMNS.has(column))
  .join(", ");

function isMissingManualImportColumnError(error) {
  const message = String(error?.message || "");
  return [
    "transport_requests.source",
    "transport_requests.created_by_admin_name",
    "transport_requests.import_batch_id",
    "transport_requests.manual_price_gbp",
    "transport_requests.manual_payment_status",
    "transport_requests.student_pinyin",
    "transport_requests.contact_status",
    "transport_requests.payment_collection_status",
    "transport_requests.deposit_amount_gbp",
    "transport_requests.preferred_time_start",
    "transport_requests.passenger_count",
    "transport_requests.shareable",
    "transport_requests.admin_note",
    "transport_requests.membership_benefit_claim_id",
    "transport_requests.membership_discount_amount"
  ].some(marker => message.includes(marker));
}

function resolveAdminDisplayName(adminUser = {}) {
  return String(adminUser.name || adminUser.username || adminUser.email || "admin").trim() || "admin";
}

function parseIdList(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(",");
  return source
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 500);
}

function applyRequestSort(query, value) {
  const sort = String(value || "submitted_latest").trim();

  if (sort === "submitted_oldest") {
    query.order("created_at", { ascending: true }).order("flight_datetime", { ascending: true });
    return;
  }

  if (sort === "flight_nearest") {
    query.order("flight_datetime", { ascending: true }).order("created_at", { ascending: false });
    return;
  }

  if (sort === "flight_latest") {
    query.order("flight_datetime", { ascending: false }).order("created_at", { ascending: false });
    return;
  }

  query.order("created_at", { ascending: false }).order("flight_datetime", { ascending: false });
}

async function listOperatorOptions(supabase) {
  const { data, error } = await supabase
    .from("transport_requests")
    .select("last_operated_by, last_operated_at")
    .not("last_operated_by", "is", null)
    .order("last_operated_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) {
    throw error;
  }

  const seen = new Set();
  return (data || [])
    .map(item => String(item.last_operated_by || "").trim())
    .filter(name => {
      if (!name || seen.has(name)) {
        return false;
      }
      seen.add(name);
      return true;
    });
}

async function logOfflineRecordedChanges(supabase, adminUser, rows, nextOfflineRecorded) {
  const adminName = resolveAdminDisplayName(adminUser);
  for (const row of rows || []) {
    try {
      await logAdminOperation(supabase, {
        admin_user_id: adminUser.id || null,
        target_type: "transport_request",
        target_id: row.id,
        action: "set_transport_request_offline_recorded",
        before_data: null,
        after_data: { offline_recorded: nextOfflineRecorded },
        metadata: {
          order_no: row.order_no,
          admin_name: adminName,
          changed_fields: [
            {
              field: "offline_recorded",
              label: "线下记录",
              before: null,
              after: nextOfflineRecorded
            }
          ]
        }
      });
    } catch (error) {
      console.warn("transport_request_offline_operation_log_failed", {
        request_id: row.id,
        message: error?.message || String(error)
      });
    }
  }
}

async function attachDuplicateFutureFlags(supabase, items) {
  const siteUserIds = Array.from(
    new Set(
      (items || [])
        .map(item => item.site_user_id)
        .filter(Boolean)
    )
  );

  if (!siteUserIds.length) {
    return items || [];
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("transport_requests")
    .select("id, site_user_id, order_no, service_type, flight_datetime")
    .in("site_user_id", siteUserIds)
    .in("status", ["published", "matched"])
    .gt("flight_datetime", nowIso)
    .order("flight_datetime", { ascending: true });

  if (error) {
    throw error;
  }

  const groupedByUser = new Map();
  (data || []).forEach(row => {
    const key = row.site_user_id;
    if (!key) return;
    if (!groupedByUser.has(key)) {
      groupedByUser.set(key, []);
    }
    groupedByUser.get(key).push(row);
  });

  return (items || []).map(item => {
    const duplicates = groupedByUser.get(item.site_user_id) || [];
    const duplicateItems = duplicates.filter(row => row.id !== item.id);
    const sameServiceItems = duplicateItems.filter(row => row.service_type === item.service_type);
    const crossServiceItems = duplicateItems.filter(row => row.service_type && row.service_type !== item.service_type);
    return {
      ...item,
      has_future_duplicate_request: sameServiceItems.length > 0,
      has_future_related_request: duplicateItems.length > 0,
      future_duplicate_count: duplicates.length,
      future_duplicate_order_nos: sameServiceItems.map(row => row.order_no).filter(Boolean),
      future_related_order_nos: duplicateItems.map(row => row.order_no).filter(Boolean),
      same_service_future_order_nos: sameServiceItems.map(row => row.order_no).filter(Boolean),
      cross_service_future_order_nos: crossServiceItems.map(row => row.order_no).filter(Boolean)
    };
  });
}

function applyRequestFiltersCompat(query, queryParams, includeManualImportColumns) {
  const nextQueryParams = includeManualImportColumns
    ? queryParams
    : {
        ...queryParams,
        source: "",
        import_batch_id: ""
      };
  applyRequestFilters(query, nextQueryParams);
}

async function runListQuery(supabase, queryParams, options = {}) {
  const includeManualImportColumns = options.includeManualImportColumns !== false;
  const compact = options.compact === true;
  const paginate = options.paginate === true;
  const page = options.page || 1;
  const pageSize = options.pageSize || 10;
  const selectColumns = compact
    ? (includeManualImportColumns ? REQUEST_COMPACT_SELECT : REQUEST_COMPACT_SELECT_LEGACY)
    : (includeManualImportColumns ? REQUEST_LIST_SELECT : REQUEST_LIST_SELECT_LEGACY);

  let query = supabase
    .from("transport_requests")
    .select(selectColumns, paginate ? { count: "exact" } : undefined);

  applyRequestFiltersCompat(query, queryParams, includeManualImportColumns);
  applyRequestSort(query, queryParams.sort);

  if (queryParams.grouped === "true") {
    query.not("transport_group_members", "is", null);
  }
  if (queryParams.grouped === "false") {
    query.is("transport_group_members", null);
  }

  if (paginate) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query.range(from, to);
  }

  return query;
}

module.exports = async function handler(req, res) {
  const startedAt = nowMs();
  const supabase = getSupabaseAdmin();
  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  try {
    if (req.method === "GET") {
      const queryParams = req.query || {};
      const paginate = String(queryParams.paginate || "").toLowerCase() === "true";
      const compact = String(queryParams.compact || "").toLowerCase() === "true";
      const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(Number.parseInt(queryParams.page_size, 10) || 10, 1), 100);
      const shouldLoadOperatorOptions = !compact && (!paginate || page === 1);

      const queryStartedAt = nowMs();
      let [listResult, operatorOptions] = await Promise.all([
        runListQuery(supabase, queryParams, { compact, paginate, page, pageSize, includeManualImportColumns: true }),
        shouldLoadOperatorOptions ? listOperatorOptions(supabase) : Promise.resolve(null)
      ]);
      let manualImportColumnsAvailable = true;
      if (listResult.error && isMissingManualImportColumnError(listResult.error)) {
        manualImportColumnsAvailable = false;
        listResult = await runListQuery(supabase, queryParams, {
          compact,
          paginate,
          page,
          pageSize,
          includeManualImportColumns: false
        });
      }
      const { data, error, count } = listResult;
      const baseQueryMs = nowMs() - queryStartedAt;
      if (error) {
        throw error;
      }

      const baseItems = (data || []).map(item => deriveRequestDisplayFlags(item));
      const duplicateFutureStartedAt = nowMs();
      const items = compact ? baseItems : await attachDuplicateFutureFlags(supabase, baseItems);
      const duplicateFutureMs = compact ? 0 : nowMs() - duplicateFutureStartedAt;
      const rows = Array.isArray(items) ? items.length : 0;

      logPerf("list", {
        authMs,
        baseQueryMs,
        queryMs: baseQueryMs,
        countMs: paginate ? baseQueryMs : 0,
        duplicateFutureMs,
        enrichmentMs: duplicateFutureMs,
        totalMs: nowMs() - startedAt,
        rows,
        page: paginate ? page : null,
        pageSize: paginate ? pageSize : null,
        compact,
        manualImportColumnsAvailable,
        countMode: paginate ? "exact" : "none",
        cacheHit: null
      });

      if (!paginate) {
        ok(res, items);
        return;
      }

      ok(res, {
        items,
        ...(Array.isArray(operatorOptions) ? { operator_options: operatorOptions } : {}),
        pagination: {
          page,
          page_size: pageSize,
          total: count || 0,
          total_pages: count ? Math.ceil(count / pageSize) : 0
        }
      });
      return;
    }

    if (req.method === "PATCH") {
      const body = await parseJsonBody(req);
      if (body.action === "set_offline_recorded") {
        const ids = parseIdList(body.ids || body.request_ids);
        if (!ids.length) {
          badRequest(res, "transport request ids are required");
          return;
        }

        const nextOfflineRecorded = body.offline_recorded === true || body.offline_recorded === "true";
        const { data, error } = await supabase
          .from("transport_requests")
          .update({
            offline_recorded: nextOfflineRecorded,
            last_operated_by: resolveAdminDisplayName(adminUser),
            last_operated_at: new Date().toISOString()
          })
          .in("id", ids)
          .select("id, order_no, offline_recorded, last_operated_by, last_operated_at");

        if (error) {
          throw error;
        }

        await logOfflineRecordedChanges(supabase, adminUser, data || [], nextOfflineRecorded);

        ok(res, {
          updated_count: Array.isArray(data) ? data.length : 0,
          offline_recorded: nextOfflineRecorded,
          items: data || []
        });
        return;
      }

      if (body.action !== "mark_offline_recorded") {
        badRequest(res, "Unsupported bulk action");
        return;
      }

      const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
      let query = supabase
        .from("transport_requests")
        .update({
          offline_recorded: true,
          last_operated_by: resolveAdminDisplayName(adminUser),
          last_operated_at: new Date().toISOString()
        })
        .select("id, order_no");

      applyRequestFilters(query, filters);

      if (filters.grouped === "true") {
        query.not("transport_group_members", "is", null);
      }
      if (filters.grouped === "false") {
        query.is("transport_group_members", null);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      await logOfflineRecordedChanges(supabase, adminUser, data || [], true);

      ok(res, {
        updated_count: Array.isArray(data) ? data.length : 0,
        items: data || []
      });
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapRequestPayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { request, group } = await createPickupRequestWithGroup(supabase, payload);
      created(res, {
        ...request,
        group_id: group.group_id
      });
      return;
    }

    methodNotAllowed(res, ["GET", "POST", "PATCH"]);
  } catch (error) {
    serverError(res, error);
  }
};
