const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyEffectiveGroupCounts, mapGroupPayload, getGroupPassengerCount, deriveDisplayGroupId } = require("../_lib/transport");
const { createGroupForRequest } = require("../_lib/transport-group-lifecycle");

const GROUP_DETAIL_MEMBER_SELECT = "id,group_id,request_id,passenger_count_snapshot,luggage_count_snapshot,created_at,transport_requests(id,order_no,student_name,site_user_id,phone,wechat,email,service_type,status,passenger_count,luggage_count,terminal,flight_datetime,airport_code,flight_no,location_from,location_to,admin_note,notes)";

const GROUP_DELETE_MEMBER_SELECT = "request_id,transport_requests(id,site_user_id,student_name,email,phone,wechat,service_type,passenger_count,luggage_count,airport_code,airport_name,terminal,flight_no,flight_datetime,location_from,location_to,preferred_time_start,preferred_time_end,shareable,status,notes,admin_note,closed_at,closed_reason,created_at)";

function isMissingColumnError(error, marker) {
  return Boolean(error?.message && error.message.includes(marker));
}

function isNoRowsError(error) {
  return Boolean(
    error?.message && (
      error.message.includes("JSON object requested") ||
      error.message.includes("Cannot coerce the result to a single JSON object")
    )
  );
}

function normalizeMembers(members) {
  return (members || []).map(member => {
    const request = member.transport_requests || {};
    return {
      ...member,
      transport_requests: request,
      member_surcharge_gbp: 0,
      joined_at: member.created_at || null
    };
  });
}

function uniqueNonEmpty(values) {
  return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean)));
}

function formatArrivalRange(members) {
  const timestamps = members
    .map(member => member.transport_requests?.flight_datetime)
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b);

  if (!timestamps.length) {
    return {
      earliest: null,
      latest: null
    };
  }

  return {
    earliest: new Date(timestamps[0]).toISOString(),
    latest: new Date(timestamps[timestamps.length - 1]).toISOString()
  };
}

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

function getPricingSeason(referenceDate) {
  const date = new Date(referenceDate || Date.now());
  if (Number.isNaN(date.getTime())) return "normal";
  return date.getUTCMonth() === 8 ? "peak" : "normal";
}

function parsePaymentStatus(adminNote) {
  const text = String(adminNote || "");
  const match = text.match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function computeGroupViewModel(group, members) {
  const normalizedGroup = applyEffectiveGroupCounts(group);
  const normalizedMembers = normalizeMembers(members);
  const displayMembers = normalizedMembers.filter(member => member.transport_requests);
  const activeMembers = normalizedMembers.filter(member => ["published", "matched"].includes(member.transport_requests?.status || ""));
  const displayRequests = displayMembers.map(member => member.transport_requests || {});
  const activeRequests = activeMembers.map(member => member.transport_requests || {});
  const maxPassengers = Number(normalizedGroup.max_passengers || 0);
  const currentPassengerCount = displayMembers.reduce((sum, member) => {
    return sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
  }, 0);
  const activeMemberCount = displayMembers.length;
  const terminals = uniqueNonEmpty(displayRequests.map(request => request.terminal));
  const airports = uniqueNonEmpty(displayRequests.map(request => request.airport_code));
  const destinations = uniqueNonEmpty(displayRequests.map(request => request.location_to));
  const arrivalRange = formatArrivalRange(displayMembers);
  const timeSpanMinutes = arrivalRange.earliest && arrivalRange.latest
    ? Math.round((new Date(arrivalRange.latest).getTime() - new Date(arrivalRange.earliest).getTime()) / 60000)
    : 0;
  const hasCrossTerminal = terminals.length > 1;
  const primaryTerminal = normalizedGroup.terminal || terminals[0] || null;
  const pricingSeason = getPricingSeason(normalizedGroup.group_date || arrivalRange.earliest || normalizedGroup.created_at);
  const airportPricing = PICKUP_PRICING[pricingSeason]?.[normalizedGroup.airport_code || airports[0] || ""] || null;
  const pricingSeatCount = Math.min(Math.max(currentPassengerCount, 1), 5);
  const basePerPersonGbp = airportPricing?.perPerson?.[pricingSeatCount] || 0;
  const crossTerminalSurchargeTotalGbp = hasCrossTerminal ? currentPassengerCount * 15 : 0;
  const totalPriceGbp = roundCurrency(basePerPersonGbp * currentPassengerCount + crossTerminalSurchargeTotalGbp);
  const averagePriceGbp = currentPassengerCount > 0 ? roundCurrency(totalPriceGbp / currentPassengerCount) : 0;

  const membersWithSurcharge = normalizedMembers.map(member => {
    const request = member.transport_requests || {};
    const terminal = request.terminal || "";
    const surcharge = hasCrossTerminal && request.status !== "closed" ? 15 : 0;
    const paymentStatus = parsePaymentStatus(request.admin_note);
    return {
      ...member,
      member_surcharge_gbp: surcharge,
      payment_status: paymentStatus,
      payment_label: paymentStatus === "paid" ? "已付款" : "未付款"
    };
  });

  const overCapacity = maxPassengers > 0 && currentPassengerCount > maxPassengers;
  const isClosed = ["closed", "cancelled"].includes(normalizedGroup.status);
  const invalidStatuses = activeRequests.some(request => !["published", "matched"].includes(request.status || ""));
  const airportMismatch = airports.length > 1;
  const timeDiffExceeded = timeSpanMinutes > 180;

  const blockingReasons = [];
  if (isClosed) blockingReasons.push(normalizedGroup.status === "cancelled" ? "已取消" : "已关闭");
  if (overCapacity || (maxPassengers > 0 && currentPassengerCount >= maxPassengers)) blockingReasons.push("已满");
  if (airportMismatch) blockingReasons.push("机场不一致");
  if (timeDiffExceeded) blockingReasons.push("时间差超限");
  if (invalidStatuses) blockingReasons.push("订单状态不允许继续拼车");

  const summary = {
    group_id: normalizedGroup.group_id || deriveDisplayGroupId(normalizedGroup.id, normalizedGroup.group_date),
    status: normalizedGroup.status,
    current_passenger_count: currentPassengerCount,
    max_passengers: maxPassengers,
    active_member_count: activeMemberCount,
    airport_code: normalizedGroup.airport_code,
    airport_name: normalizedGroup.airport_name,
    terminal_summary: terminals.length <= 1 ? (terminals[0] || normalizedGroup.terminal || "--") : terminals.join(" / "),
    has_cross_terminal: hasCrossTerminal,
    arrival_time_range: arrivalRange,
    destination_city_summary: destinations.length <= 1 ? (destinations[0] || normalizedGroup.location_to || "--") : `多个目的地（${destinations.length}）`,
    joinable: blockingReasons.length === 0 && !isClosed && currentPassengerCount < maxPassengers,
    join_reason: blockingReasons[0] || "可继续加入",
    surcharge_hint: hasCrossTerminal ? "跨航站楼附加费按当前拼车人数每人 £15" : "无附加费",
    created_at: normalizedGroup.created_at,
    updated_at: normalizedGroup.updated_at
  };

  const system_judgement = {
    is_matchable: !airportMismatch && !timeDiffExceeded && !overCapacity && !invalidStatuses && !isClosed,
    is_over_capacity: overCapacity,
    has_cross_terminal: hasCrossTerminal,
    cross_terminal_surcharge_gbp: hasCrossTerminal ? currentPassengerCount * 15 : 0,
    can_accept_more_members: summary.joinable,
    blocking_reasons: blockingReasons
  };

  const payment_summary = {
    pricing_season: pricingSeason,
    base_price_per_person_gbp: roundCurrency(basePerPersonGbp),
    cross_terminal_surcharge_total_gbp: roundCurrency(crossTerminalSurchargeTotalGbp),
    total_price_gbp: totalPriceGbp,
    average_price_gbp: averagePriceGbp,
    member_payments: membersWithSurcharge.map(member => ({
      member_id: member.id,
      request_id: member.transport_requests?.id || member.request_id,
      order_no: member.transport_requests?.order_no || "--",
      student_name: member.transport_requests?.student_name || "--",
      payment_status: member.payment_status,
      payment_label: member.payment_label
    }))
  };

  return {
    group: {
      ...normalizedGroup,
      current_passenger_count: currentPassengerCount,
      remaining_passenger_count: Math.max(maxPassengers - currentPassengerCount, 0)
    },
    summary,
    members: membersWithSurcharge,
    system_judgement,
    payment_summary
  };
}

async function fetchSingleGroupRow(supabase, table, id) {
  async function fetchFirstBy(column, value) {
    const result = await supabase
      .from(table)
      .select("*")
      .eq(column, value)
      .limit(1);

    if (result.error && isNoRowsError(result.error)) {
      return null;
    }

    if (result.error) {
      throw result.error;
    }

    return Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  try {
    const byGroupId = await fetchFirstBy("group_id", id);
    if (byGroupId) return byGroupId;
  } catch (error) {
    if (!isMissingColumnError(error, "transport_groups.group_id")) {
      throw error;
    }
  }

  return fetchFirstBy("id", id);
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
  const { id } = req.query;

  try {
    if (req.method === "GET") {
      const group = await fetchSingleGroupRow(supabase, "transport_groups_public_view", id);
      if (!group) {
        badRequest(res, "group not found");
        return;
      }

      const { data: members, error: membersError } = await supabase
        .from("transport_group_members")
        .select(GROUP_DETAIL_MEMBER_SELECT)
        .eq("group_id", group.group_id || group.id)
        .order("created_at", { ascending: true });

      if (membersError) {
        throw membersError;
      }

      const viewModel = computeGroupViewModel(group, members || []);

      ok(res, {
        ...viewModel.group,
        id: group.id,
        group_id: viewModel.summary.group_id,
        summary: viewModel.summary,
        members: viewModel.members,
        system_judgement: viewModel.system_judgement,
        payment_summary: viewModel.payment_summary
      });
      return;
    }

    if (req.method === "PATCH") {
      const existing = await fetchSingleGroupRow(supabase, "transport_groups", id);
      if (!existing) {
        badRequest(res, "group not found");
        return;
      }

      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapGroupPayload(body, existing);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const currentPassengerCount = await getGroupPassengerCount(supabase, existing.group_id || existing.id);
      if (payload.max_passengers < currentPassengerCount) {
        badRequest(res, "max_passengers cannot be smaller than current passenger count");
        return;
      }

      let result = await supabase
        .from("transport_groups")
        .update(payload)
        .eq("id", existing.id)
        .select("*");

      if (result.error && isMissingColumnError(result.error, "transport_groups.group_id")) {
        result = await supabase
          .from("transport_groups")
          .update({
            ...payload,
            status: payload.status === "single_member" || payload.status === "active" ? "open" : payload.status
          })
          .eq("id", existing.id)
          .select("*");
      }

      if (result.error) {
        throw result.error;
      }

      const updated = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!updated) {
        badRequest(res, "group update failed");
        return;
      }

      const nextStatus = String(payload.status || "").trim().toLowerCase();
      if (nextStatus === "closed" || nextStatus === "cancelled") {
        const { data: groupMembers, error: groupMembersError } = await supabase
          .from("transport_group_members")
          .select("request_id")
          .eq("group_id", existing.group_id || existing.id);

        if (groupMembersError) {
          throw groupMembersError;
        }

        const requestIds = Array.from(new Set((groupMembers || []).map(item => item.request_id).filter(Boolean)));
        if (requestIds.length) {
          const { error: requestUpdateError } = await supabase
            .from("transport_requests")
            .update({
              status: "closed",
              closed_at: new Date().toISOString(),
              closed_reason: nextStatus === "cancelled" ? "group_cancelled" : "group_closed"
            })
            .in("id", requestIds)
            .neq("status", "closed");

          if (requestUpdateError) {
            throw requestUpdateError;
          }
        }
      }

      ok(res, {
        ...applyEffectiveGroupCounts(updated),
        id: updated.id,
        group_id: updated.group_id || deriveDisplayGroupId(updated.id, updated.group_date)
      });
      return;
    }

    if (req.method === "DELETE") {
      const { data: existingMembers, error: existingMembersError } = await supabase
        .from("transport_group_members")
        .select(GROUP_DELETE_MEMBER_SELECT)
        .eq("group_id", id);

      if (existingMembersError) {
        throw existingMembersError;
      }

      const activeRequests = (existingMembers || [])
        .map(item => item.transport_requests)
        .filter(item => item && item.status !== "closed");

      const requestIds = activeRequests.map(item => item.id).filter(Boolean);
      if (requestIds.length) {
        const { error: requestError } = await supabase
          .from("transport_requests")
          .update({ status: "published" })
          .in("id", requestIds)
          .in("status", ["matched", "published"]);

        if (requestError) {
          throw requestError;
        }
      }

      const existingGroup = await fetchSingleGroupRow(supabase, "transport_groups", id);
      if (!existingGroup) {
        badRequest(res, "group not found");
        return;
      }

      const { error } = await supabase
        .from("transport_groups")
        .delete()
        .eq("id", existingGroup.id);

      if (error) {
        throw error;
      }

      for (const request of activeRequests) {
        await createGroupForRequest(supabase, {
          ...request,
          status: "published"
        }, {
          isInitiator: true
        });
      }

      ok(res, {
        id: existingGroup.id,
        group_id: existingGroup.group_id || deriveDisplayGroupId(existingGroup.id, existingGroup.group_date)
      });
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    serverError(res, error);
  }
};
