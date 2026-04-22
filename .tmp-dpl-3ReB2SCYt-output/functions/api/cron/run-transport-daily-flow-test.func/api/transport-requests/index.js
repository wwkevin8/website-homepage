const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyRequestFilters, mapRequestPayload, deriveRequestDisplayFlags } = require("../_lib/transport");
const { createPickupRequestWithGroup } = require("../_lib/transport-group-lifecycle");

const REQUEST_LIST_SELECT = [
  "id",
  "order_no",
  "student_name",
  "email",
  "phone",
  "site_user_id",
  "service_type",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "location_to",
  "luggage_count",
  "status",
  "created_at",
  "transport_group_members(group_id,is_initiator,request_id)",
  "site_users(email)"
].join(", ");

const REQUEST_COMPACT_SELECT = [
  "id",
  "order_no",
  "student_name",
  "service_type",
  "airport_code",
  "terminal",
  "flight_datetime",
  "location_to",
  "passenger_count",
  "luggage_count",
  "status",
  "created_at",
  "transport_group_members(group_id,is_initiator,request_id)"
].join(", ");

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

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
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

      let query = supabase
        .from("transport_requests")
        .select(compact ? REQUEST_COMPACT_SELECT : REQUEST_LIST_SELECT, paginate ? { count: "exact" } : undefined);

      applyRequestFilters(query, queryParams);
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

      const { data, error, count } = await query;
      if (error) {
        throw error;
      }

      const baseItems = (data || []).map(item => deriveRequestDisplayFlags(item));
      const items = compact ? baseItems : await attachDuplicateFutureFlags(supabase, baseItems);
      if (!paginate) {
        ok(res, items);
        return;
      }

      ok(res, {
        items,
        pagination: {
          page,
          page_size: pageSize,
          total: count || 0,
          total_pages: count ? Math.ceil(count / pageSize) : 0
        }
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

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    serverError(res, error);
  }
};
