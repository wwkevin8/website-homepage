const { DEFAULT_GROUP_MAX_PASSENGERS } = require("./transport");

const PICKUP_PRICING = {
  normal: {
    LHR: { perPerson: { 1: 185, 2: 100, 3: 75, 4: 60, 5: 55 } },
    LGW: { perPerson: { 1: 235, 2: 125, 3: 95, 4: 80, 5: 70 } },
    MAN: { perPerson: { 1: 165, 2: 90, 3: 65, 4: 55, 5: 50 } },
    LTN: { perPerson: { 1: 180, 2: 95, 3: 70, 4: 55, 5: 50 } },
    LCY: { perPerson: { 1: 190, 2: 105, 3: 80, 4: 75, 5: 60 } },
    BHX: { perPerson: { 1: 100, 2: 60, 3: 50, 4: 45, 5: 40 } },
    STN: { perPerson: { 1: 185, 2: 100, 3: 75, 4: 60, 5: 55 } }
  },
  peak: {
    LHR: { perPerson: { 1: 190, 2: 105, 3: 80, 4: 65, 5: 60 } },
    LGW: { perPerson: { 1: 240, 2: 130, 3: 100, 4: 85, 5: 75 } },
    MAN: { perPerson: { 1: 170, 2: 95, 3: 70, 4: 60, 5: 55 } },
    LTN: { perPerson: { 1: 185, 2: 100, 3: 75, 4: 60, 5: 55 } },
    LCY: { perPerson: { 1: 195, 2: 110, 3: 85, 4: 80, 5: 65 } },
    BHX: { perPerson: { 1: 105, 2: 65, 3: 55, 4: 50, 5: 45 } },
    STN: { perPerson: { 1: 190, 2: 105, 3: 80, 4: 65, 5: 60 } }
  }
};

function uniqueNonEmpty(values) {
  return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean)));
}

function getPricingSeason(referenceDate) {
  const date = new Date(referenceDate || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "normal";
  }
  return date.getUTCMonth() === 8 ? "peak" : "normal";
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function formatArrivalRange(values) {
  const timestamps = (values || [])
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b);

  if (!timestamps.length) {
    return { earliest: null, latest: null };
  }

  return {
    earliest: new Date(timestamps[0]).toISOString(),
    latest: new Date(timestamps[timestamps.length - 1]).toISOString()
  };
}

function parseLuggageDisplay(request) {
  const notes = String(request?.notes || "");
  const match = notes.match(/行李[:：]?\s*([^|;\n\r]+)/);
  if (match?.[1]) {
    return match[1].trim();
  }

  const luggageCount = Number(request?.luggage_count || 0);
  return luggageCount > 0 ? `${luggageCount}件` : "--";
}

function buildMemberDetails(activeMembers) {
  return activeMembers.map((member, index) => {
    const request = member.transport_requests || {};
    return {
      label: `${String.fromCharCode(65 + index)}同学`,
      flight_no: request.flight_no || "--",
      flight_datetime: request.flight_datetime || null,
      terminal: request.terminal || "--",
      luggage: parseLuggageDisplay(request)
    };
  });
}

function buildGroupStats(group, members, options = {}) {
  const activeOnly = options.activeOnly !== false;
  const displayMembers = (members || []).filter(member => {
    if (!member?.transport_requests) {
      return false;
    }
    if (!activeOnly) {
      return true;
    }
    return member.transport_requests.status !== "closed";
  });
  const displayRequests = displayMembers.map(member => member.transport_requests || {});
  const currentPassengerCount = displayMembers.reduce((sum, member) => {
    return sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
  }, 0);
  const maxPassengers = Number(group?.max_passengers || DEFAULT_GROUP_MAX_PASSENGERS);
  const terminals = uniqueNonEmpty(displayRequests.map(request => request.terminal));
  const flightNos = uniqueNonEmpty(displayRequests.map(request => request.flight_no));
  const pricingSeason = getPricingSeason(group?.group_date || displayRequests[0]?.flight_datetime || group?.created_at);
  const airportCode = String(group?.airport_code || displayRequests[0]?.airport_code || "").trim().toUpperCase();
  const airportPricing = PICKUP_PRICING[pricingSeason]?.[airportCode] || null;
  const pricingSeatCount = Math.min(Math.max(currentPassengerCount, 1), 5);
  const basePerPersonGbp = airportPricing?.perPerson?.[pricingSeatCount] || 0;
  const hasCrossTerminal = terminals.length > 1;
  const crossTerminalSurchargeTotalGbp = hasCrossTerminal ? currentPassengerCount * 15 : 0;
  const totalPriceGbp = roundCurrency(basePerPersonGbp * currentPassengerCount + crossTerminalSurchargeTotalGbp);
  const averagePriceGbp = currentPassengerCount > 0 ? roundCurrency(totalPriceGbp / currentPassengerCount) : 0;

  return {
    current_passenger_count: currentPassengerCount,
    remaining_passenger_count: Math.max(maxPassengers - currentPassengerCount, 0),
    current_average_price_gbp: averagePriceGbp,
    total_price_gbp: totalPriceGbp,
    has_cross_terminal: hasCrossTerminal,
    terminal_summary: hasCrossTerminal ? terminals.join(" / ") : (terminals[0] || group?.terminal || "--"),
    terminal_values: terminals,
    flight_no_values: flightNos,
    arrival_range: formatArrivalRange(displayRequests.map(request => request.flight_datetime)),
    surcharge_gbp: crossTerminalSurchargeTotalGbp,
    surcharge_hint: hasCrossTerminal ? "跨航站楼附加费按当前拼车人数每人 £15，已计入当前均价" : "无附加费",
    member_details: buildMemberDetails(displayMembers)
  };
}

async function loadGroupStatsMap(supabase, groupIds, options = {}) {
  const normalizedGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  if (!normalizedGroupIds.length) {
    return new Map();
  }

  let groups = Array.isArray(options.groups) ? options.groups : null;
  if (!groups) {
    const { data, error: groupsError } = await supabase
      .from("transport_groups_public_view")
      .select("*")
      .in("group_id", normalizedGroupIds);

    if (groupsError) {
      throw groupsError;
    }

    groups = data || [];
  }

  let members = Array.isArray(options.members) ? options.members : null;
  if (!members) {
    const { data, error: membersError } = await supabase
      .from("transport_group_members")
      .select("group_id, passenger_count_snapshot, transport_requests(passenger_count, status, terminal, flight_datetime, airport_code, flight_no, notes, luggage_count)")
      .in("group_id", normalizedGroupIds);

    if (membersError) {
      throw membersError;
    }

    members = data || [];
  }

  const membersByGroup = new Map();
  (members || []).forEach(item => {
    const current = membersByGroup.get(item.group_id) || [];
    current.push(item);
    membersByGroup.set(item.group_id, current);
  });

  const groupStatsById = new Map();
  (groups || []).forEach(group => {
    const groupId = group.group_id || group.id;
    if (!groupId) {
      return;
    }

    groupStatsById.set(groupId, buildGroupStats(group, membersByGroup.get(groupId) || [], options));
  });

  return groupStatsById;
}

module.exports = {
  PICKUP_PRICING,
  uniqueNonEmpty,
  getPricingSeason,
  roundCurrency,
  formatArrivalRange,
  parseLuggageDisplay,
  buildGroupStats,
  loadGroupStatsMap
};
