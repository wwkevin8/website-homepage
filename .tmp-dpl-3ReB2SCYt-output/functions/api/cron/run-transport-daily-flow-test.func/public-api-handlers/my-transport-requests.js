const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { ok, methodNotAllowed, serverError, unauthorized } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { closeExpiredRequests, deriveRequestDisplayFlags } = require("../api/_lib/transport");
const { backfillMissingPickupGroups } = require("../api/_lib/transport-group-lifecycle");
const { loadGroupStatsMap } = require("../api/_lib/transport-group-stats");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录后再查看个人预约。");
      return;
    }

    await backfillMissingPickupGroups(supabase);
    await closeExpiredRequests(supabase);

    const { data, error } = await supabase
      .from("transport_requests")
      .select("*, transport_group_members(*)")
      .eq("site_user_id", siteUser.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      throw error;
    }

    const requests = (data || []).map(item => deriveRequestDisplayFlags(item));
    const groupIds = Array.from(new Set(
      requests
        .map(item => item.transport_group_members?.[0]?.group_id || item.group_ref || null)
        .filter(Boolean)
    ));

    const groupStatsById = await loadGroupStatsMap(supabase, groupIds);

    ok(res, requests.map(item => {
      const groupId = item.transport_group_members?.[0]?.group_id || item.group_ref || null;
      const groupStats = groupId ? groupStatsById.get(groupId) : null;
      return {
        ...item,
        current_passenger_count: groupStats?.current_passenger_count ?? item.passenger_count ?? 0,
        current_average_price_gbp: groupStats?.current_average_price_gbp ?? null,
        group_total_price_gbp: groupStats?.total_price_gbp ?? null,
        group_terminal_summary: groupStats?.terminal_summary ?? item.terminal ?? null,
        group_has_cross_terminal: groupStats?.has_cross_terminal ?? false
      };
    }));
  } catch (error) {
    serverError(res, error);
  }
};
