const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyRequestFilters, mapRequestPayload, deriveRequestDisplayFlags } = require("../_lib/transport");
const { allocateOrderNumber } = require("../_lib/order-numbers");

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
      const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(Number.parseInt(queryParams.page_size, 10) || 10, 1), 100);
      let query = supabase
        .from("transport_requests")
        .select("*, transport_group_members(id, group_id)", paginate ? { count: "exact" } : undefined)
        .order("created_at", { ascending: false });

      applyRequestFilters(query, queryParams);

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

      const groupedItems = (data || []).filter(item => Array.isArray(item.transport_group_members) && item.transport_group_members.length > 0);
      const groupIds = [...new Set(groupedItems.map(item => item.transport_group_members[0]?.group_id).filter(Boolean))];
      const groupMap = new Map();
      const firstRequestByGroup = new Map();

      if (groupIds.length) {
        const [{ data: groups, error: groupsError }, { data: members, error: membersError }] = await Promise.all([
          supabase
            .from("transport_groups")
            .select("id, status, group_date, preferred_time_start, flight_time_reference")
            .in("id", groupIds),
          supabase
            .from("transport_group_members")
            .select("group_id, request_id, created_at")
            .in("group_id", groupIds)
            .order("created_at", { ascending: true })
        ]);

        if (groupsError) {
          throw groupsError;
        }
        if (membersError) {
          throw membersError;
        }

        (groups || []).forEach(group => {
          groupMap.set(group.id, group);
        });
        (members || []).forEach(member => {
          if (!firstRequestByGroup.has(member.group_id)) {
            firstRequestByGroup.set(member.group_id, member.request_id);
          }
        });
      }

      const items = (data || []).map(item => {
        const groupId = item.transport_group_members?.[0]?.group_id || null;
        return deriveRequestDisplayFlags(item, {
          group: groupId ? groupMap.get(groupId) || null : null,
          isSourceOrder: groupId ? firstRequestByGroup.get(groupId) === item.id : false
        });
      });
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
      const orderIdentity = await allocateOrderNumber(supabase, "pickup");
      let payload;
      try {
        payload = mapRequestPayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { data, error } = await supabase
        .from("transport_requests")
        .insert({
          ...payload,
          order_no: orderIdentity.orderNo,
          order_type: orderIdentity.orderType,
          business_date: orderIdentity.businessDate
        })
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      created(res, data);
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    serverError(res, error);
  }
};
