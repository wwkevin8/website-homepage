const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { applyEffectiveGroupCounts } = require("../api/_lib/transport");
const { ok, methodNotAllowed, serverError } = require("../api/_lib/http");

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

const PUBLIC_MEMBER_SELECT = [
  "group_id",
  "transport_requests(status, terminal, flight_no, flight_datetime)"
].join(", ");

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PREVIEW_LIMIT = 10;
const MAX_PAGE_SIZE = 50;
const PUBLIC_JOINABLE_GROUP_STATUSES = ["single_member", "active"];
const NON_RENDERABLE_GROUP_STATUSES = new Set(["closed", "cancelled", "full"]);

function getPublicGroupStatuses(queryParams = {}) {
  const status = String(queryParams.status || "").trim().toLowerCase();
  if (!status || status === "open" || status === "active") {
    return PUBLIC_JOINABLE_GROUP_STATUSES;
  }
  if (PUBLIC_JOINABLE_GROUP_STATUSES.includes(status)) {
    return [status];
  }
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

function parsePositiveInteger(value, fallback, maxValue = MAX_PAGE_SIZE) {
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
  const latest = sort === "latest";
  query
    .order("group_date", { ascending: !latest })
    .order("preferred_time_start", { ascending: !latest, nullsFirst: false })
    .order("created_at", { ascending: false });
}

function buildPublicGroupsQuery(supabase, queryParams, dateFrom, sort) {
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

function summarizeGroupMembers(members) {
  const terminalValues = [];
  const flightNoValues = [];
  const flightDatetimes = [];

  for (const member of members || []) {
    const request = member?.transport_requests || {};
    if (request.status === "closed") {
      continue;
    }
    if (request.terminal) {
      terminalValues.push(String(request.terminal).trim());
    }
    if (request.flight_no) {
      flightNoValues.push(String(request.flight_no).trim());
    }
    if (request.flight_datetime) {
      flightDatetimes.push(request.flight_datetime);
    }
  }

  const uniqueTerminals = Array.from(new Set(terminalValues.filter(Boolean)));
  const uniqueFlightNos = Array.from(new Set(flightNoValues.filter(Boolean)));
  const timestamps = flightDatetimes
    .map(value => new Date(value).getTime())
    .filter(value => !Number.isNaN(value))
    .sort((left, right) => left - right);

  return {
    terminal_values: uniqueTerminals,
    terminal_summary: uniqueTerminals.length > 1 ? uniqueTerminals.join(" / ") : (uniqueTerminals[0] || null),
    flight_no_values: uniqueFlightNos,
    source_flight_nos: uniqueFlightNos,
    source_flight_no_preview: uniqueFlightNos.length > 1 ? `${uniqueFlightNos[0]} +${uniqueFlightNos.length - 1}` : (uniqueFlightNos[0] || null),
    arrival_range: timestamps.length ? {
      earliest: new Date(timestamps[0]).toISOString(),
      latest: new Date(timestamps[timestamps.length - 1]).toISOString()
    } : { earliest: null, latest: null }
  };
}

async function loadPublicMemberSummaries(supabase, groupIds) {
  const uniqueGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  if (!uniqueGroupIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("transport_group_members")
    .select(PUBLIC_MEMBER_SELECT)
    .in("group_id", uniqueGroupIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const membersByGroup = new Map();
  for (const member of data || []) {
    const groupId = member.group_id;
    const current = membersByGroup.get(groupId) || [];
    current.push(member);
    membersByGroup.set(groupId, current);
  }

  const summaries = new Map();
  for (const groupId of uniqueGroupIds) {
    summaries.set(groupId, summarizeGroupMembers(membersByGroup.get(groupId) || []));
  }
  return summaries;
}

function mapPublicGroup(group, memberSummary, mode) {
  const normalized = applyEffectiveGroupCounts(group);
  const groupKey = normalized.group_id || normalized.id;
  const maxPassengers = Number(normalized.max_passengers || 0);
  const currentPassengers = Number(normalized.current_passenger_count || 0);
  const seatsLeft = Number(normalized.remaining_passenger_count || Math.max(maxPassengers - currentPassengers, 0));
  const flightDatetime = normalized.flight_time_reference || normalized.preferred_time_start || null;
  const terminalSummary = memberSummary?.terminal_summary || normalized.terminal || null;
  const flightNoPreview = memberSummary?.source_flight_no_preview || null;

  const publicItem = {
    id: groupKey,
    group_id: groupKey,
    public_group_code: groupKey,
    service_type: normalized.service_type || null,
    group_date: normalized.group_date || null,
    airport_code: normalized.airport_code || null,
    airport_name: normalized.airport_name || null,
    terminal: terminalSummary,
    terminal_summary: terminalSummary,
    terminal_values: memberSummary?.terminal_values || (terminalSummary ? [terminalSummary] : []),
    flight_no: flightNoPreview,
    flight_no_values: memberSummary?.flight_no_values || (flightNoPreview ? [flightNoPreview] : []),
    source_flight_nos: memberSummary?.source_flight_nos || [],
    source_flight_no_preview: flightNoPreview,
    flight_datetime: flightDatetime,
    service_time: normalized.preferred_time_start || flightDatetime,
    flight_time_reference: normalized.flight_time_reference || null,
    preferred_time_start: normalized.preferred_time_start || null,
    preferred_time_end: normalized.preferred_time_end || null,
    current_passengers: currentPassengers,
    current_passenger_count: currentPassengers,
    max_passengers: maxPassengers,
    seats_left: seatsLeft,
    remaining_passenger_count: seatsLeft,
    visible_on_frontend: Boolean(normalized.visible_on_frontend),
    status: normalized.status || null,
    joinable: currentPassengers > 0 && seatsLeft > 0 && !NON_RENDERABLE_GROUP_STATUSES.has(String(normalized.status || "").toLowerCase()),
    arrival_range: memberSummary?.arrival_range || { earliest: null, latest: null }
  };

  if (mode !== "preview") {
    publicItem.location_from = normalized.location_from || null;
    publicItem.location_to = normalized.location_to || null;
    publicItem.member_request_count = Number(normalized.member_request_count || 0);
    publicItem.created_at = normalized.created_at || null;
  }

  return publicItem;
}

function filterRenderableGroups(groups) {
  return (groups || []).filter(group => {
    const status = String(group.status || "").toLowerCase();
    return Number(group.current_passenger_count || 0) > 0
      && Number(group.remaining_passenger_count || 0) > 0
      && !NON_RENDERABLE_GROUP_STATUSES.has(status);
  });
}

async function listPublicGroups(supabase, queryParams) {
  const mode = cleanText(queryParams.mode).toLowerCase() === "preview" ? "preview" : "list";
  const pageSizeFallback = mode === "preview" ? DEFAULT_PREVIEW_LIMIT : DEFAULT_PAGE_SIZE;
  const pageSize = parsePositiveInteger(queryParams.pageSize || queryParams.page_size || queryParams.limit, pageSizeFallback, mode === "preview" ? DEFAULT_PREVIEW_LIMIT : MAX_PAGE_SIZE);
  const page = mode === "preview" ? 1 : parsePositiveInteger(queryParams.page, 1, 100000);
  const includePast = queryParams.include_past === "true";
  const dateFrom = includePast ? cleanText(queryParams.date_from) : (cleanText(queryParams.date_from) || getLondonTodayIsoDate());
  const sort = queryParams.sort === "latest" ? "latest" : "upcoming";
  const offset = (page - 1) * pageSize;

  const query = buildPublicGroupsQuery(supabase, queryParams, dateFrom, sort)
    .range(offset, offset + pageSize);

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const rows = data || [];
  const hasNext = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const summaries = await loadPublicMemberSummaries(supabase, pageRows.map(item => item.group_id || item.id));
  const items = filterRenderableGroups(pageRows.map(group => mapPublicGroup(group, summaries.get(group.group_id || group.id), mode)));

  return {
    items,
    total: null,
    page,
    pageSize,
    page_size: pageSize,
    has_next: hasNext,
    date_from: dateFrom || null,
    include_past: includePast,
    sort,
    mode
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    ok(res, await listPublicGroups(supabase, req.query || {}));
  } catch (error) {
    serverError(res, error);
  }
};
