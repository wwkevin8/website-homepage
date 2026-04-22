const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { applyEffectiveGroupCounts } = require("../api/_lib/transport");
const { ok, methodNotAllowed, serverError } = require("../api/_lib/http");
const { loadGroupStatsMap } = require("../api/_lib/transport-group-stats");

function getLondonTodayIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function applySort(query, sort) {
  if (sort === "latest") {
    query
      .order("group_date", { ascending: false })
      .order("preferred_time_start", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    return;
  }

  query
    .order("group_date", { ascending: true })
    .order("preferred_time_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
}

function buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort) {
  const query = supabase
    .from("transport_groups_public_view")
    .select("*", { count: "exact" })
    .eq("visible_on_frontend", true)
    .in("status", ["single_member", "active", "full", "open"])
    .gt("current_passenger_count", 0);

  if (queryParams.service_type) {
    query.eq("service_type", queryParams.service_type);
  }
  if (queryParams.airport_code) {
    query.eq("airport_code", queryParams.airport_code);
  } else if (queryParams.airport_name) {
    query.eq("airport_name", queryParams.airport_name);
  }
  if (dateFrom) {
    query.gte("group_date", dateFrom);
  }
  if (queryParams.date_to) {
    query.lte("group_date", queryParams.date_to);
  }

  applySort(query, sort);
  return query;
}

async function enrichPublicGroupsBatch(supabase, groups) {
  const groupIds = groups.map(item => item.group_id || item.id).filter(Boolean);
  if (!groupIds.length) {
    return [];
  }

  const groupStatsById = await loadGroupStatsMap(supabase, groupIds, { groups });

  return groups.map(group => {
    const groupKey = group.group_id || group.id;
    const groupStats = groupStatsById.get(groupKey) || {};
    const sourceOrderNos = Array.isArray(group.source_order_nos) ? group.source_order_nos : [];
    const sourceFlightNos = groupStats.flight_no_values || [];
    return {
      ...group,
      ...groupStats,
      id: groupKey,
      group_id: groupKey,
      source_order_nos: sourceOrderNos,
      source_order_no_preview: sourceOrderNos.length > 1 ? `${sourceOrderNos[0]} +${sourceOrderNos.length - 1}` : (sourceOrderNos[0] || null),
      source_flight_nos: sourceFlightNos,
      source_flight_no_preview: sourceFlightNos.length > 1 ? `${sourceFlightNos[0]} +${sourceFlightNos.length - 1}` : (sourceFlightNos[0] || null)
    };
  });
}

function filterRenderablePublicGroups(groups) {
  return (groups || []).filter(group => Number(group.current_passenger_count || 0) > 0);
}

function filterPublicGroupsByGroupId(groups, groupIdKeyword) {
  const keyword = String(groupIdKeyword || "").trim().toUpperCase();
  if (!keyword) {
    return groups || [];
  }
  return (groups || []).filter(group => String(group.group_id || group.id || "").toUpperCase().includes(keyword));
}

async function listPublicGroupsPaginated(supabase, queryParams, limit, page, dateFrom, sort) {
  const query = buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort);
  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rawBatch = (data || []).map(applyEffectiveGroupCounts);
  const enrichedGroups = filterPublicGroupsByGroupId(
    filterRenderablePublicGroups(await enrichPublicGroupsBatch(supabase, rawBatch)),
    queryParams.group_id
  );
  const total = enrichedGroups.length;
  const from = (page - 1) * limit;
  const items = enrichedGroups.slice(from, from + limit);

  return {
    items,
    total,
    page,
    page_size: limit,
    has_next: (page * limit) < total,
    date_from: dateFrom || null,
    include_past: queryParams.include_past === "true",
    sort
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    const queryParams = req.query || {};
    const limit = parsePositiveInteger(queryParams.limit);
    const page = parsePositiveInteger(queryParams.page) || 1;
    const includePast = queryParams.include_past === "true";
    const dateFrom = includePast ? (queryParams.date_from || "") : (queryParams.date_from || getLondonTodayIsoDate());
    const sort = queryParams.sort === "latest" ? "latest" : "upcoming";

    if (limit) {
      ok(res, await listPublicGroupsPaginated(supabase, queryParams, limit, page, dateFrom, sort));
      return;
    }

    const query = buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort);
    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const items = filterPublicGroupsByGroupId(
      filterRenderablePublicGroups(
        await enrichPublicGroupsBatch(supabase, (data || []).map(applyEffectiveGroupCounts))
      ),
      queryParams.group_id
    );

    ok(res, {
      items,
      total: items.length,
      page,
      page_size: items.length,
      has_next: false,
      date_from: dateFrom || null,
      include_past: includePast,
      sort
    });
  } catch (error) {
    serverError(res, error);
  }
};
