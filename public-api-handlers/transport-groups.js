const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { applyEffectiveGroupCounts } = require("../api/_lib/transport");
const { ok, methodNotAllowed, serverError } = require("../api/_lib/http");
const { buildGroupStats } = require("../api/_lib/transport-group-stats");

const PUBLIC_GROUP_SELECT = [
  "id",
  "group_id",
  "service_type",
  "group_date",
  "airport_code",
  "airport_name",
  "terminal",
  "location_from",
  "location_to",
  "flight_time_reference",
  "preferred_time_start",
  "preferred_time_end",
  "max_passengers",
  "visible_on_frontend",
  "status",
  "created_at",
  "member_request_count",
  "current_passenger_count",
  "remaining_passenger_count"
].join(", ");

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PREVIEW_LIMIT = 10;
const MAX_PAGE_SIZE = 50;
const PUBLIC_JOINABLE_GROUP_STATUSES = ["single_member", "active"];

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

function parsePositiveInteger(value, fallback = null, maxValue = MAX_PAGE_SIZE) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, maxValue);
}

function cleanText(value) {
  return String(value || "").trim();
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
    .select(PUBLIC_GROUP_SELECT)
    .eq("visible_on_frontend", true)
    .in("status", getPublicGroupStatuses(queryParams))
    .gt("current_passenger_count", 0)
    .gt("remaining_passenger_count", 0);

  const serviceType = cleanText(queryParams.service_type);
  if (serviceType) {
    query.eq("service_type", serviceType);
  }

  const airportCode = cleanText(queryParams.airport_code).toUpperCase();
  const airportName = cleanText(queryParams.airport_name);
  if (airportCode) {
    query.eq("airport_code", airportCode);
  } else if (airportName) {
    query.eq("airport_name", airportName);
  }

  const groupIdKeyword = cleanText(queryParams.group_id).toUpperCase();
  if (groupIdKeyword) {
    query.ilike("group_id", `%${groupIdKeyword}%`);
  }

  if (dateFrom) {
    query.gte("group_date", dateFrom);
  }

  const dateTo = cleanText(queryParams.date_to);
  if (dateTo) {
    query.lte("group_date", dateTo);
  }

  applySort(query, sort);
  return query;
}

async function enrichPublicGroupsBatch(supabase, groups) {
  const groupIds = groups.map(item => item.group_id || item.id).filter(Boolean);
  if (!groupIds.length) {
    return [];
  }

  const memberSummariesByGroup = await loadPublicMemberSummaries(supabase, groupIds);

  return groups.map(group => {
    const { dispatch_status, ...publicGroup } = group || {};
    const groupKey = group.group_id || group.id;
    const memberSummary = memberSummariesByGroup.get(groupKey) || {};
    const groupStats = memberSummary.groupStats || {};
    const sourceOrderNos = Array.isArray(group.source_order_nos) ? group.source_order_nos : [];
    const sourceFlightNos = groupStats.flight_no_values || [];
    return {
      ...publicGroup,
      ...groupStats,
      id: groupKey,
      group_id: groupKey,
      target_request_id: memberSummary.targetRequestId || null,
      source_order_nos: sourceOrderNos,
      source_order_no_preview: sourceOrderNos.length > 1 ? `${sourceOrderNos[0]} +${sourceOrderNos.length - 1}` : (sourceOrderNos[0] || null),
      source_flight_nos: sourceFlightNos,
      source_flight_no_preview: sourceFlightNos.length > 1 ? `${sourceFlightNos[0]} +${sourceFlightNos.length - 1}` : (sourceFlightNos[0] || null)
    };
  });
}

async function loadPublicMemberSummaries(supabase, groupIds) {
  const normalizedGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  if (!normalizedGroupIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("transport_group_members")
    .select("group_id, request_id, passenger_count_snapshot, transport_requests(passenger_count, status, terminal, flight_datetime, airport_code, flight_no, notes, luggage_count)")
    .in("group_id", normalizedGroupIds);

  if (error) {
    throw error;
  }

  const membersByGroup = new Map();
  for (const member of data || []) {
    if (!member?.group_id) {
      continue;
    }
    const current = membersByGroup.get(member.group_id) || [];
    current.push(member);
    membersByGroup.set(member.group_id, current);
  }

  const summaries = new Map();
  for (const groupId of normalizedGroupIds) {
    const members = membersByGroup.get(groupId) || [];
    const firstActiveMember = members.find(member => member?.request_id && member.transport_requests?.status !== "closed");
    summaries.set(groupId, {
      targetRequestId: firstActiveMember?.request_id || null,
      groupStats: buildGroupStats({ group_id: groupId }, members)
    });
  }

  return summaries;
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

async function listPublicGroupsPaginated(supabase, queryParams, limit, page, dateFrom, sort) {
  const offset = (page - 1) * limit;
  const query = buildPublicGroupsBaseQuery(supabase, queryParams, dateFrom, sort)
    .range(offset, offset + limit);
  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = data || [];
  const pageRows = rows.slice(0, limit);
  const items = filterRenderablePublicGroups(await enrichPublicGroupsBatch(
    supabase,
    pageRows.map(applyEffectiveGroupCounts)
  ));

  return {
    items,
    total: null,
    page,
    page_size: limit,
    has_next: rows.length > limit,
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
    const mode = cleanText(queryParams.mode).toLowerCase();
    const limit = parsePositiveInteger(
      queryParams.pageSize || queryParams.page_size || queryParams.limit,
      mode === "preview" ? DEFAULT_PREVIEW_LIMIT : DEFAULT_PAGE_SIZE,
      mode === "preview" ? DEFAULT_PREVIEW_LIMIT : MAX_PAGE_SIZE
    );
    const page = parsePositiveInteger(queryParams.page, 1, 100000);
    const includePast = queryParams.include_past === "true";
    const dateFrom = includePast ? cleanText(queryParams.date_from) : (cleanText(queryParams.date_from) || getLondonTodayIsoDate());
    const sort = queryParams.sort === "latest" ? "latest" : "upcoming";

    ok(res, await listPublicGroupsPaginated(supabase, queryParams, limit, page, dateFrom, sort));
  } catch (error) {
    serverError(res, error);
  }
};
