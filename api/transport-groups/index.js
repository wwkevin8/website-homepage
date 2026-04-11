const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyGroupFilters, applyEffectiveGroupCounts, mapGroupPayload } = require("../_lib/transport");

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
        .from("transport_groups_public_view")
        .select("*", paginate ? { count: "exact" } : undefined)
        .order("group_date", { ascending: true })
        .order("preferred_time_start", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      applyGroupFilters(query, queryParams);

      if (paginate) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query.range(from, to);
      }

      const { data, error, count } = await query;
      if (error) {
        throw error;
      }

      const groups = (data || []).map(applyEffectiveGroupCounts);
      const groupIds = groups.map(item => item.id).filter(Boolean);

      if (!groupIds.length) {
        ok(res, groups);
        return;
      }

      const { data: memberRows, error: memberRowsError } = await supabase
        .from("transport_group_members")
        .select("group_id, created_at, transport_requests(order_no)")
        .in("group_id", groupIds)
        .order("created_at", { ascending: true });

      if (memberRowsError) {
        throw memberRowsError;
      }

      const memberOrderMap = new Map();
      (memberRows || []).forEach(item => {
        const current = memberOrderMap.get(item.group_id) || [];
        const orderNo = item.transport_requests?.order_no || null;
        if (orderNo) {
          current.push(orderNo);
        }
        memberOrderMap.set(item.group_id, current);
      });

      const items = groups.map(group => {
        const orderNos = memberOrderMap.get(group.id) || [];
        return {
          ...group,
          source_order_nos: orderNos,
          source_order_no_preview: orderNos.length > 1 ? `${orderNos[0]} +${orderNos.length - 1}` : (orderNos[0] || null)
        };
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
      let payload;
      try {
        payload = mapGroupPayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { data, error } = await supabase
        .from("transport_groups")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      created(res, applyEffectiveGroupCounts(data));
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    serverError(res, error);
  }
};
