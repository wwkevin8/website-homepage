const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyEffectiveGroupCounts, mapGroupPayload, getGroupPassengerCount, deriveDisplayGroupId } = require("../_lib/transport");
const { createGroupForRequest } = require("../_lib/transport-group-lifecycle");
const { computeTransportGroupPricingSnapshot } = require("../_lib/transport-group-stats");
const { logAdminOperation } = require("../_lib/orders");

const GROUP_DETAIL_MEMBER_SELECT = "id,group_id,request_id,passenger_count_snapshot,luggage_count_snapshot,created_at,transport_requests(id,order_no,student_name,site_user_id,phone,wechat,email,service_type,status,passenger_count,luggage_count,terminal,flight_datetime,preferred_time_start,airport_code,airport_name,flight_no,location_from,location_to,admin_note,manual_payment_status,payment_collection_status,deposit_amount_gbp,manual_price_gbp,offline_recorded,contact_status,notes)";

const GROUP_DELETE_MEMBER_SELECT = "request_id,transport_requests(id,site_user_id,student_name,email,phone,wechat,service_type,passenger_count,luggage_count,airport_code,airport_name,terminal,flight_no,flight_datetime,location_from,location_to,preferred_time_start,preferred_time_end,shareable,status,notes,admin_note,manual_payment_status,closed_at,closed_reason,created_at)";

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function logPerf(label, details) {
  console.info(`[perf][transport-group-detail] ${label}`, details);
}

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

function normalizeLegacyGroupStatusInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  if (String(input.status || "").trim().toLowerCase() !== "open") return input;
  return {
    ...input,
    status: "active"
  };
}

function resolveAdminDisplayName(adminUser = {}) {
  return String(adminUser.name || adminUser.username || adminUser.email || "admin").trim() || "admin";
}

function dispatchStatusLabel(status) {
  const labels = {
    pending_dispatch: "待调度",
    driver_assigned: "已派车",
    driver_notified: "已通知司机",
    in_progress: "服务中",
    completed: "已完成",
    cancelled: "已取消"
  };
  return labels[status] || String(status || "");
}

function normalizeAuditValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  const parsed = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value || "")) && !Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return String(value);
}

function buildChangedFields(existing = {}, payload = {}) {
  return Object.entries(payload || {})
    .filter(([field, value]) => normalizeAuditValue(existing[field]) !== normalizeAuditValue(value))
    .map(([field, value]) => ({
      field,
      before: normalizeAuditValue(existing[field]),
      after: normalizeAuditValue(value)
    }));
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function fetchGroupOperationLogs(supabase, group, members = []) {
  const requestIds = Array.from(new Set(
    (members || [])
      .map(member => member.transport_requests?.id || member.request_id)
      .filter(Boolean)
  ));
  const logSelect = "id, action, before_data, after_data, metadata, created_at, target_type, target_id, admin_user_id, admin_user:admin_users(id, name, username, email)";
  const groupTargetId = [group.id, group.group_ref].find(isUuid);
  let groupLogs = [];

  if (groupTargetId) {
    const groupLogsResult = await supabase
      .from("admin_operation_logs")
      .select(logSelect)
      .eq("target_type", "transport_group")
      .eq("target_id", groupTargetId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (groupLogsResult.error) {
      throw groupLogsResult.error;
    }
    groupLogs = groupLogsResult.data || [];
  }

  let requestLogs = [];
  if (requestIds.length) {
    const requestLogsResult = await supabase
      .from("admin_operation_logs")
      .select(logSelect)
      .eq("target_type", "transport_request")
      .in("target_id", requestIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (requestLogsResult.error) {
      throw requestLogsResult.error;
    }
    requestLogs = requestLogsResult.data || [];
  }

  return [
    ...groupLogs,
    ...requestLogs
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
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

function buildTimeRange(values) {
  const timestamps = (values || [])
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b);

  if (!timestamps.length) {
    return { earliest: null, latest: null, span_minutes: 0 };
  }

  return {
    earliest: new Date(timestamps[0]).toISOString(),
    latest: new Date(timestamps[timestamps.length - 1]).toISOString(),
    span_minutes: timestamps.length > 1 ? Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60000) : 0
  };
}

function buildDispatchRisks(group, members) {
  const requests = (members || []).map(member => member.transport_requests || {});
  const maxPassengers = Number(group.max_passengers || 0);
  const currentPassengers = Number(group.current_passenger_count || 0);
  const terminals = uniqueNonEmpty(requests.map(request => request.terminal));
  const timeRange = buildTimeRange(requests.map(request => request.flight_datetime || request.preferred_time_start));
  const visibleOnFrontend = group.visible_on_frontend === true;
  const risks = [];

  if (!members.length) risks.push({ code: "empty_group", label: "0 members" });
  if (terminals.length > 1) risks.push({ code: "cross_terminal", label: "Different terminals" });
  if (timeRange.span_minutes > 180) risks.push({ code: "time_gap_large", label: "Time gap over 3h" });
  if (requests.some(request => !request.flight_no)) risks.push({ code: "missing_flight_no", label: "Missing flight no" });
  if (requests.some(request => !request.terminal)) risks.push({ code: "missing_terminal", label: "Missing terminal" });
  if (requests.some(request => !request.phone && !request.wechat)) risks.push({ code: "missing_contact", label: "Missing phone/WeChat" });
  if (requests.some(request => Number(request.passenger_count || 0) <= 0 || Number(request.luggage_count || 0) < 0)) {
    risks.push({ code: "abnormal_count", label: "Passenger/luggage count abnormal" });
  }
  if (maxPassengers > 0 && currentPassengers > maxPassengers) risks.push({ code: "over_capacity", label: "Over capacity" });
  if (String(group.status || "").toLowerCase() === "full" && visibleOnFrontend) {
    risks.push({ code: "full_visible", label: "Full but public visible" });
  }
  if (visibleOnFrontend && (["closed", "cancelled"].includes(String(group.status || "").toLowerCase()) || !members.length)) {
    risks.push({ code: "public_visibility_invalid", label: "Public visible but not display-ready" });
  }

  return risks;
}

function parsePaymentStatus(adminNote, structuredStatus) {
  const normalized = String(structuredStatus || "").trim().toLowerCase();
  if (["paid", "unpaid", "pending", "waived"].includes(normalized)) {
    return normalized === "paid" || normalized === "waived" ? "paid" : "unpaid";
  }
  const text = String(adminNote || "");
  const match = text.match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function computeGroupViewModel(group, members) {
  const normalizedGroup = applyEffectiveGroupCounts(group);
  const normalizedMembers = normalizeMembers(members);
  const displayMembers = normalizedMembers.filter(member => member.transport_requests);
  const activeMembers = normalizedMembers.filter(member => ["published", "matched"].includes(member.transport_requests?.status || ""));
  const displayRequests = displayMembers.map(member => member.transport_requests || {});
  const activeRequests = activeMembers.map(member => member.transport_requests || {});
  const maxPassengers = Number(normalizedGroup.max_passengers || 0);
  const pricing = computeTransportGroupPricingSnapshot(normalizedGroup, normalizedMembers, { activeOnly: false });
  const currentPassengerCount = pricing.current_passenger_count;
  const activeMemberCount = displayMembers.length;
  const terminals = pricing.terminal_values;
  const airports = uniqueNonEmpty(displayRequests.map(request => request.airport_code));
  const destinations = uniqueNonEmpty(displayRequests.map(request => request.location_to));
  const arrivalRange = pricing.arrival_range;
  const timeSpanMinutes = arrivalRange.earliest && arrivalRange.latest
    ? Math.round((new Date(arrivalRange.latest).getTime() - new Date(arrivalRange.earliest).getTime()) / 60000)
    : 0;
  const hasCrossTerminal = pricing.has_cross_terminal;

  const membersWithSurcharge = normalizedMembers.map(member => {
    const request = member.transport_requests || {};
    const terminal = request.terminal || "";
    const surcharge = hasCrossTerminal && request.status !== "closed" ? 15 : 0;
    const paymentStatus = parsePaymentStatus(request.admin_note, request.manual_payment_status);
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
    cross_terminal_surcharge_gbp: pricing.cross_terminal_surcharge_total_gbp,
    can_accept_more_members: summary.joinable,
    blocking_reasons: blockingReasons
  };

  const payment_summary = {
    pricing_season: pricing.pricing_season,
    base_price_per_person_gbp: pricing.base_price_per_person_gbp,
    cross_terminal_surcharge_total_gbp: pricing.cross_terminal_surcharge_total_gbp,
    total_price_gbp: pricing.total_price_gbp,
    average_price_gbp: pricing.average_price_gbp,
    member_payments: membersWithSurcharge.map(member => ({
      member_id: member.id,
      request_id: member.transport_requests?.id || member.request_id,
      order_no: member.transport_requests?.order_no || "--",
      student_name: member.transport_requests?.student_name || "--",
      payment_status: member.payment_status,
      payment_label: member.payment_label
    }))
  };
  const luggageSummary = normalizedMembers.reduce((summary, member) => {
    const request = member.transport_requests || {};
    summary.total_luggage_count += Number(request.luggage_count || member.luggage_count_snapshot || 0);
    return summary;
  }, { total_luggage_count: 0 });

  return {
    group: {
      ...normalizedGroup,
      current_passenger_count: currentPassengerCount,
      remaining_passenger_count: Math.max(maxPassengers - currentPassengerCount, 0)
    },
    summary,
    members: membersWithSurcharge,
    system_judgement,
    payment_summary,
    luggage_summary: luggageSummary,
    dispatch_risks: buildDispatchRisks({ ...normalizedGroup, current_passenger_count: currentPassengerCount }, normalizedMembers)
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
      const startedAt = nowMs();
      const groupStartedAt = nowMs();
      const group = await fetchSingleGroupRow(supabase, "transport_groups_public_view", id);
      const groupMs = nowMs() - groupStartedAt;
      if (!group) {
        badRequest(res, "group not found");
        return;
      }
      const rawGroupStartedAt = nowMs();
      const rawGroup = await fetchSingleGroupRow(supabase, "transport_groups", group.group_id || id);
      const rawGroupMs = nowMs() - rawGroupStartedAt;
      const groupWithDispatchStatus = {
        ...group,
        dispatch_status: rawGroup?.dispatch_status || "pending_dispatch",
        driver_name: rawGroup?.driver_name || "",
        driver_phone: rawGroup?.driver_phone || "",
        driver_note: rawGroup?.driver_note || ""
      };

      const membersStartedAt = nowMs();
      const { data: members, error: membersError } = await supabase
        .from("transport_group_members")
        .select(GROUP_DETAIL_MEMBER_SELECT)
        .eq("group_id", groupWithDispatchStatus.group_id || groupWithDispatchStatus.id)
        .order("created_at", { ascending: true });
      const membersMs = nowMs() - membersStartedAt;

      if (membersError) {
        throw membersError;
      }

      const modelStartedAt = nowMs();
      const viewModel = computeGroupViewModel(groupWithDispatchStatus, members || []);
      const modelMs = nowMs() - modelStartedAt;
      const logsStartedAt = nowMs();
      const operationLogs = await fetchGroupOperationLogs(supabase, groupWithDispatchStatus, members || []);
      const logsMs = nowMs() - logsStartedAt;
      logPerf("get", {
        groupMs,
        rawGroupMs,
        membersMs,
        modelMs,
        logsMs,
        memberRows: Array.isArray(members) ? members.length : 0,
        operationLogRows: Array.isArray(operationLogs) ? operationLogs.length : 0,
        totalMs: nowMs() - startedAt
      });

      ok(res, {
        ...viewModel.group,
        id: groupWithDispatchStatus.id,
        group_id: viewModel.summary.group_id,
        summary: viewModel.summary,
        members: viewModel.members,
        system_judgement: viewModel.system_judgement,
        payment_summary: viewModel.payment_summary,
        luggage_summary: viewModel.luggage_summary,
        dispatch_risks: viewModel.dispatch_risks,
        operation_logs: operationLogs
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
        payload = mapGroupPayload(normalizeLegacyGroupStatusInput(body), existing);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const currentPassengerCount = await getGroupPassengerCount(supabase, existing.group_id || existing.id);
      if (payload.max_passengers < currentPassengerCount) {
        badRequest(res, "max_passengers cannot be smaller than current passenger count");
        return;
      }

      let updatePayload = payload;
      let result = await supabase
        .from("transport_groups")
        .update(updatePayload)
        .eq("id", existing.id)
        .select("*");

      if (result.error && isMissingColumnError(result.error, "dispatch_status")) {
        updatePayload = { ...payload };
        delete updatePayload.dispatch_status;
        result = await supabase
          .from("transport_groups")
          .update(updatePayload)
          .eq("id", existing.id)
          .select("*");
      }

      if (result.error && (
        isMissingColumnError(result.error, "driver_name") ||
        isMissingColumnError(result.error, "driver_phone") ||
        isMissingColumnError(result.error, "driver_note")
      )) {
        updatePayload = { ...updatePayload };
        delete updatePayload.driver_name;
        delete updatePayload.driver_phone;
        delete updatePayload.driver_note;
        result = await supabase
          .from("transport_groups")
          .update(updatePayload)
          .eq("id", existing.id)
          .select("*");
      }

      if (result.error && isMissingColumnError(result.error, "transport_groups.group_id")) {
        result = await supabase
          .from("transport_groups")
          .update({
            ...updatePayload
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

      const changedFields = buildChangedFields(existing, updatePayload);
      const dispatchStatusChange = changedFields.find(item => item.field === "dispatch_status");
      const regularChangedFields = changedFields.filter(item => item.field !== "dispatch_status");
      if (regularChangedFields.length) {
        try {
          await logAdminOperation(supabase, {
            admin_user_id: adminUser.id || null,
            target_type: "transport_group",
            target_id: existing.id,
            action: "update_transport_group",
            before_data: regularChangedFields.reduce((result, item) => {
              result[item.field] = item.before;
              return result;
            }, {}),
            after_data: regularChangedFields.reduce((result, item) => {
              result[item.field] = item.after;
              return result;
            }, {}),
            metadata: {
              group_id: existing.group_id || deriveDisplayGroupId(existing.id, existing.group_date),
              admin_name: resolveAdminDisplayName(adminUser),
              changed_fields: regularChangedFields
            }
          });
        } catch (logError) {
          console.warn("transport_group_operation_log_failed", {
            group_id: existing.group_id || existing.id,
            message: logError?.message || String(logError)
          });
        }
      }

      if (dispatchStatusChange) {
        try {
          await logAdminOperation(supabase, {
            admin_user_id: adminUser.id || null,
            target_type: "transport_group",
            target_id: existing.id,
            action: "dispatch_status_update",
            before_data: {
              dispatch_status: dispatchStatusChange.before
            },
            after_data: {
              dispatch_status: dispatchStatusChange.after
            },
            metadata: {
              group_id: existing.group_id || deriveDisplayGroupId(existing.id, existing.group_date),
              admin_name: resolveAdminDisplayName(adminUser),
              field: "dispatch_status",
              old_value: dispatchStatusChange.before,
              new_value: dispatchStatusChange.after,
              old_label: dispatchStatusLabel(dispatchStatusChange.before),
              new_label: dispatchStatusLabel(dispatchStatusChange.after),
              changed_fields: [dispatchStatusChange]
            }
          });
        } catch (logError) {
          console.warn("transport_group_dispatch_status_log_failed", {
            group_id: existing.group_id || existing.id,
            message: logError?.message || String(logError)
          });
        }
      }

      const nextStatus = String(updatePayload.status || "").trim().toLowerCase();
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
      const existingGroup = await fetchSingleGroupRow(supabase, "transport_groups", id);
      if (!existingGroup) {
        badRequest(res, "group not found");
        return;
      }
      const groupRef = existingGroup.group_id || existingGroup.id;

      const { data: existingMembers, error: existingMembersError } = await supabase
        .from("transport_group_members")
        .select(GROUP_DELETE_MEMBER_SELECT)
        .eq("group_id", groupRef);

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
