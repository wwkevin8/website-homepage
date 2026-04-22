const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { ok, methodNotAllowed, serverError } = require("../api/_lib/http");
const { PUBLIC_REQUEST_STATUSES, closeExpiredRequests, deriveDisplayGroupId, DEFAULT_GROUP_MAX_PASSENGERS } = require("../api/_lib/transport");
const { backfillMissingPickupGroups } = require("../api/_lib/transport-group-lifecycle");
const { loadGroupStatsMap, parseLuggageDisplay, uniqueNonEmpty, getPricingSeason, roundCurrency, formatArrivalRange, PICKUP_PRICING } = require("../api/_lib/transport-group-stats");

function isMissingColumnError(error, marker) {
  return Boolean(error?.message && error.message.includes(marker));
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function applySort(query, sort) {
  if (sort === "latest") {
    query.order("flight_datetime", { ascending: false }).order("created_at", { ascending: false });
    return;
  }

  query.order("flight_datetime", { ascending: true }).order("created_at", { ascending: false });
}

function mapBoardItem(item, membersByGroup, groupStats) {
  const members = membersByGroup.get(item.group_id) || [];
  const activeMembers = members.filter(member => member.transport_requests?.status !== "closed");
  const currentPassengerCount = activeMembers.reduce((sum, member) => sum + Number(member.transport_requests?.passenger_count || 0), 0);
  const remainingPassengerCount = Math.max(DEFAULT_GROUP_MAX_PASSENGERS - currentPassengerCount, 0);
  const terminalValues = uniqueNonEmpty(activeMembers.map(member => member.transport_requests?.terminal));
  const flightValues = uniqueNonEmpty(activeMembers.map(member => member.transport_requests?.flight_no));
  const arrivalRange = formatArrivalRange(activeMembers.map(member => member.transport_requests?.flight_datetime));
  const pickupTime = item.preferred_time_start || item.flight_time_reference || item.flight_datetime || null;
  const pricingSeason = getPricingSeason(pickupTime || item.created_at);
  const airportCode = String(item.airport_code || "").trim().toUpperCase();
  const airportPricing = PICKUP_PRICING[pricingSeason]?.[airportCode] || null;
  const pricingSeatCount = Math.min(Math.max(currentPassengerCount, 1), 5);
  const basePerPersonGbp = airportPricing?.perPerson?.[pricingSeatCount] || 0;
  const hasCrossTerminal = terminalValues.length > 1;
  const crossTerminalSurchargeGbp = hasCrossTerminal ? currentPassengerCount * 15 : 0;
  const totalPriceGbp = roundCurrency(basePerPersonGbp * currentPassengerCount + crossTerminalSurchargeGbp);
  const averagePriceGbp = currentPassengerCount > 0 ? roundCurrency(totalPriceGbp / currentPassengerCount) : 0;
  const terminalSummary = hasCrossTerminal
    ? `${terminalValues.join(" / ")}（跨航站楼每人 +£15）`
    : (terminalValues[0] || item.terminal || "--");
  const memberDetails = activeMembers.map((member, index) => {
    const request = member.transport_requests || {};
    return {
      label: `${String.fromCharCode(65 + index)}同学`,
      flight_no: request.flight_no || "--",
      flight_datetime: request.flight_datetime || null,
      terminal: request.terminal || "--",
      luggage: parseLuggageDisplay(request)
    };
  });
  const effectiveStats = groupStats || {};
  const resolvedPassengerCount = Number(effectiveStats.current_passenger_count ?? currentPassengerCount);
  const resolvedRemainingPassengerCount = Number(effectiveStats.remaining_passenger_count ?? remainingPassengerCount);
  const joinable = ["published", "matched"].includes(item.status)
    && item.shareable
    && new Date(item.flight_datetime).getTime() > Date.now()
    && resolvedRemainingPassengerCount > 0;
  const joinReason = joinable ? "" : (resolvedRemainingPassengerCount <= 0 ? "已满" : "需联系客服");

  return {
    id: item.id,
    group_id: item.group_id,
    group_status: item.group_status,
    public_id: item.group_id,
    service_type: item.service_type,
    airport_code: item.airport_code,
    airport_name: item.airport_name,
    terminal: item.terminal,
    flight_no: item.flight_no,
    terminal_values: terminalValues,
    flight_no_values: flightValues,
    flight_datetime: item.flight_datetime,
    preferred_time_start: item.preferred_time_start || null,
    flight_time_reference: item.flight_time_reference || null,
    location_from: item.location_from,
    location_to: item.location_to,
    passenger_count: item.passenger_count,
    current_passenger_count: resolvedPassengerCount,
    remaining_passenger_count: resolvedRemainingPassengerCount,
    terminal_summary: effectiveStats.terminal_summary || terminalSummary,
    arrival_range: effectiveStats.arrival_range || arrivalRange,
    has_cross_terminal: effectiveStats.has_cross_terminal ?? hasCrossTerminal,
    current_average_price_gbp: effectiveStats.current_average_price_gbp ?? averagePriceGbp,
    total_price_gbp: effectiveStats.total_price_gbp ?? totalPriceGbp,
    surcharge_gbp: effectiveStats.surcharge_gbp ?? crossTerminalSurchargeGbp,
    surcharge_hint: hasCrossTerminal ? "跨航站楼附加费按当前拼车人数每人 £15，已计入当前均价" : "无附加费",
    member_details: effectiveStats.member_details || memberDetails,
    shareable: item.shareable,
    status: item.status,
    joinable,
    join_reason: joinReason,
    join_surcharge_hint: ""
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    await backfillMissingPickupGroups(supabase);
    await closeExpiredRequests(supabase);

    const queryParams = req.query || {};
    const limit = parsePositiveInteger(queryParams.limit);
    const page = parsePositiveInteger(queryParams.page) || 1;
    const sort = queryParams.sort === "latest" ? "latest" : "upcoming";
    const nowIso = new Date().toISOString();

    let query = supabase
      .from("transport_requests")
      .select("id, order_no, service_type, airport_code, airport_name, terminal, flight_no, flight_datetime, location_from, location_to, passenger_count, shareable, status, created_at, transport_group_members(*)", { count: "exact" })
      .in("status", PUBLIC_REQUEST_STATUSES)
      .gt("flight_datetime", nowIso);

    if (queryParams.service_type) {
      query.eq("service_type", queryParams.service_type);
    }
    if (queryParams.airport_code) {
      query.eq("airport_code", queryParams.airport_code);
    } else if (queryParams.airport_name) {
      query.eq("airport_name", queryParams.airport_name);
    }
    if (queryParams.date_from) {
      query.gte("flight_datetime", `${queryParams.date_from}T00:00:00.000Z`);
    }
    if (queryParams.date_to) {
      query.lte("flight_datetime", `${queryParams.date_to}T23:59:59.999Z`);
    }

    applySort(query, sort);

    const hasGroupSearch = Boolean(String(queryParams.group_id || "").trim());

    if (limit && !hasGroupSearch) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query.range(from, to);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const requestIds = (data || []).map(item => item.id).filter(Boolean);
    const memberMapByRequest = new Map();

    if (requestIds.length) {
      const { data: requestMemberRows, error: requestMemberError } = await supabase
        .from("transport_group_members")
        .select("request_id, group_id, created_at")
        .in("request_id", requestIds)
        .order("created_at", { ascending: true });

      if (requestMemberError) {
        throw requestMemberError;
      }

      (requestMemberRows || []).forEach(item => {
        if (!item?.request_id || memberMapByRequest.has(item.request_id)) {
          return;
        }
        memberMapByRequest.set(item.request_id, item.group_id || null);
      });
    }

    let rows = (data || []).map(item => ({
      ...item,
      group_id: memberMapByRequest.get(item.id) || item.transport_group_members?.[0]?.group_id || null
    }));
    const groupIds = Array.from(new Set(rows.map(item => item.group_id).filter(Boolean)));
    const membersByGroup = new Map();
    const groupStatsById = new Map();

    if (groupIds.length) {
      let groupQuery = await supabase
        .from("transport_groups")
        .select("group_id, id, status, group_date, preferred_time_start, flight_time_reference")
        .in("group_id", groupIds);

      if (groupQuery.error && isMissingColumnError(groupQuery.error, "transport_groups.group_id")) {
        groupQuery = await supabase
          .from("transport_groups")
          .select("id, status, group_date, preferred_time_start, flight_time_reference")
          .in("id", groupIds);
      }

      if (groupQuery.error) {
        throw groupQuery.error;
      }

      const groupStatusMap = new Map((groupQuery.data || []).map(item => [
        item.group_id || item.id,
        {
          status: item.status,
          displayGroupId: item.group_id || deriveDisplayGroupId(item.id, item.group_date),
          preferred_time_start: item.preferred_time_start || null,
          flight_time_reference: item.flight_time_reference || null
        }
      ]));

      rows.forEach(item => {
        const resolved = groupStatusMap.get(item.group_id) || null;
        item.group_status = resolved?.status || null;
        item.group_id = resolved?.displayGroupId || deriveDisplayGroupId(item.group_id, item.flight_datetime);
        item.preferred_time_start = resolved?.preferred_time_start || null;
        item.flight_time_reference = resolved?.flight_time_reference || null;
      });

      const { data: memberRows, error: memberError } = await supabase
        .from("transport_group_members")
        .select("group_id, passenger_count_snapshot, transport_requests(id, status, passenger_count, terminal, flight_no, flight_datetime, airport_code, luggage_count, notes)")
        .in("group_id", groupIds);

      if (memberError) {
        throw memberError;
      }

      (memberRows || []).forEach(item => {
        const current = membersByGroup.get(item.group_id) || [];
        current.push(item);
        membersByGroup.set(item.group_id, current);
      });

      const statsMap = await loadGroupStatsMap(supabase, groupIds, {
        members: memberRows || []
      });
      statsMap.forEach((value, key) => {
        groupStatsById.set(key, value);
      });
    }

    if (hasGroupSearch) {
      const groupKeyword = String(queryParams.group_id || "").trim().toUpperCase();
      rows = rows.filter(item => String(item.group_id || "").toUpperCase().includes(groupKeyword));
    }

    const total = rows.length;
    const pagedRows = limit ? rows.slice((page - 1) * limit, (page - 1) * limit + limit) : rows;
    const items = pagedRows.map(item => mapBoardItem(item, membersByGroup, groupStatsById.get(item.group_id)));

    ok(res, {
      items,
      total,
      page,
      page_size: limit || items.length,
      has_next: limit ? (page * limit) < total : false,
      sort
    });
  } catch (error) {
    serverError(res, error);
  }
};
