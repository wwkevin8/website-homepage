const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { applyEffectiveGroupCounts } = require("../api/_lib/transport");
const { ok, methodNotAllowed, serverError } = require("../api/_lib/http");
const { loadGroupStatsMap } = require("../api/_lib/transport-group-stats");
const { cleanupEmptyTransportGroups } = require("../api/_lib/transport-group-lifecycle");

const PUBLIC_JOINABLE_GROUP_STATUSES = ["single_member", "active"];
const PUBLIC_GROUP_LIST_COLUMNS = [
  "id",
  "group_id",
  "service_type",
  "group_date",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_time_reference",
  "preferred_time_start",
  "preferred_time_end",
  "vehicle_type",
  "max_passengers",
  "visible_on_frontend",
  "status",
  "created_at",
  "current_passenger_count",
  "remaining_passenger_count",
  "member_request_count"
].join(",");

function getPublicGroupStatuses(queryParams = {}) {
  const status = String(queryParams.status || "").trim().toLowerCase();
  if (status === "single_member") return ["single_member"];
  if (status === "active" || status === "open") return PUBLIC_JOINABLE_GROUP_STATUSES;
  return PUBLIC_JOINABLE_GROUP_STATUSES;
}

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

function normalizePublicSort(value) {
  const sort = String(value || "").trim().toLowerCase();
  if (["service_time_desc", "service_desc", "time_desc", "farthest", "desc"].includes(sort)) {
    return "farthest";
  }
  return "upcoming";
}

function applySort(query, sort) {
  if (sort === "farthest") {
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

function getPublicGroupTimeMs(group) {
  const value = group?.preferred_time_start
    || group?.flight_time_reference
    || group?.flight_datetime
    || group?.group_date
    || "";
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function filterFuturePublicGroups(groups, includePast) {
  if (includePast) {
    return groups || [];
  }
  const now = Date.now();
  return (groups || []).filter(group => {
    const timeMs = getPublicGroupTimeMs(group);
    return timeMs !== null && timeMs >= now;
  });
}

function sortPublicGroupsByTime(groups, sort) {
  const direction = sort === "farthest" ? -1 : 1;
  return [...(groups || [])].sort((left, right) => {
    const leftTime = getPublicGroupTimeMs(left) ?? 0;
    const rightTime = getPublicGroupTimeMs(right) ?? 0;
    if (leftTime !== rightTime) {
      return (leftTime - rightTime) * direction;
    }
    return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime();
  });
}

function buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort) {
  const query = supabase
    .from("transport_groups_public_view")
    .select(PUBLIC_GROUP_LIST_COLUMNS)
    .eq("visible_on_frontend", true)
    .in("status", getPublicGroupStatuses(queryParams))
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
    const publicGroup = { ...(group || {}) };
    delete publicGroup.dispatch_status;
    delete publicGroup.location_from;
    delete publicGroup.location_to;
    delete publicGroup.source_order_no;
    delete publicGroup.source_order_nos;
    delete publicGroup.source_order_no_preview;
    const groupKey = group.group_id || group.id;
    const groupStats = groupStatsById.get(groupKey) || {};
    const listStats = { ...groupStats };
    delete listStats.member_details;
    delete listStats.location_from;
    delete listStats.location_to;
    delete listStats.source_order_no;
    delete listStats.source_order_nos;
    delete listStats.source_order_no_preview;
    const sourceFlightNos = groupStats.flight_no_values || [];
    return {
      ...publicGroup,
      ...listStats,
      id: groupKey,
      group_id: groupKey,
      source_flight_nos: sourceFlightNos,
      source_flight_no_preview: sourceFlightNos.length > 1 ? `${sourceFlightNos[0]} +${sourceFlightNos.length - 1}` : (sourceFlightNos[0] || null)
    };
  });
}

function filterRenderablePublicGroups(groups) {
  return (groups || []).filter(group => (
    Number(group.current_passenger_count || 0) > 0
    && Number(group.remaining_passenger_count ?? 1) > 0
    && String(group.status || "").toLowerCase() !== "full"
  ));
}

function filterPublicGroupsByGroupId(groups, groupIdKeyword) {
  const keyword = String(groupIdKeyword || "").trim().toUpperCase();
  if (!keyword) {
    return groups || [];
  }
  return (groups || []).filter(group => String(group.group_id || group.id || "").toUpperCase().includes(keyword));
}

function applyPublicGroupIdFilter(query, groupIdKeyword) {
  const keyword = String(groupIdKeyword || "").trim().toUpperCase();
  if (keyword) {
    query.ilike("group_id", `%${keyword}%`);
  }
}

async function listPublicGroupsPaginated(supabase, queryParams, limit, page, dateFrom, sort) {
  const query = buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort);
  applyPublicGroupIdFilter(query, queryParams.group_id);
  const from = (page - 1) * limit;
  const to = from + limit;
  const { data, error } = await query.range(from, to);
  if (error) {
    throw error;
  }

  const rawBatch = (data || []).map(applyEffectiveGroupCounts);
  const enrichedGroups = sortPublicGroupsByTime(
    filterPublicGroupsByGroupId(
      filterFuturePublicGroups(
        filterRenderablePublicGroups(await enrichPublicGroupsBatch(supabase, rawBatch)),
        queryParams.include_past === "true"
      ),
      queryParams.group_id
    ),
    sort
  );
  const hasNext = enrichedGroups.length > limit;
  const items = enrichedGroups.slice(0, limit);
  const total = from + items.length + (hasNext ? 1 : 0);

  return {
    items,
    total,
    page,
    page_size: limit,
    has_next: hasNext,
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
    await cleanupEmptyTransportGroups(supabase);
    const queryParams = req.query || {};
    const limit = parsePositiveInteger(queryParams.limit);
    const page = parsePositiveInteger(queryParams.page) || 1;
    const effectiveFilter = String(queryParams.effective || "").trim().toLowerCase();
    const includePast = queryParams.include_past === "true" || effectiveFilter === "all";
    const dateFrom = includePast ? (queryParams.date_from || "") : (queryParams.date_from || getLondonTodayIsoDate());
    const sort = normalizePublicSort(queryParams.sort);

    if (limit) {
      ok(res, await listPublicGroupsPaginated(supabase, queryParams, limit, page, dateFrom, sort));
      return;
    }

    const query = buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort);
    applyPublicGroupIdFilter(query, queryParams.group_id);
    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const items = sortPublicGroupsByTime(
      filterPublicGroupsByGroupId(
        filterFuturePublicGroups(
          filterRenderablePublicGroups(
            await enrichPublicGroupsBatch(supabase, (data || []).map(applyEffectiveGroupCounts))
          ),
          includePast
        ),
        queryParams.group_id
      ),
      sort
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
