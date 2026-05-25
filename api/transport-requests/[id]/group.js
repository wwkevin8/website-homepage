const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../../_lib/http");
const { deriveDisplayGroupId } = require("../../_lib/transport");
const {
  createGroupForRequest,
  getGroupByBusinessId,
  getGroupMembersWithRequests,
  syncGroupState,
  addRequestToGroup,
  removeRequestFromGroup
} = require("../../_lib/transport-group-lifecycle");
const { logAdminOperation } = require("../../_lib/orders");

const INCOMPATIBLE_GROUP_MESSAGE = "该拼车组与当前订单的服务类型、机场或日期不一致，不能加入。请先编辑行程信息或选择其他拼车组。";
const BLOCKED_GROUP_STATUSES = new Set(["closed", "cancelled", "canceled"]);

function isInvalidUuidError(error) {
  return Boolean(error?.message && error.message.includes("invalid input syntax for type uuid"));
}

function resolveAdminDisplayName(adminUser = {}) {
  return String(adminUser.name || adminUser.username || adminUser.email || "admin").trim() || "admin";
}

function datePart(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function requestServiceDate(request) {
  return datePart(request.preferred_time_start || request.flight_datetime || request.preferred_time_end || request.created_at);
}

function groupDisplayCode(group) {
  return group?.group_id || deriveDisplayGroupId(group?.id || group?.group_ref, group?.group_date);
}

async function fetchRequest(supabase, id) {
  let result = await supabase
    .from("transport_requests")
    .select("*, transport_group_members(id,group_id,request_id,is_initiator)")
    .eq("id", id)
    .limit(1);

  if (result.error && !isInvalidUuidError(result.error)) {
    throw result.error;
  }

  let request = result.error ? null : (Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null));
  if (!request) {
    result = await supabase
      .from("transport_requests")
      .select("*, transport_group_members(id,group_id,request_id,is_initiator)")
      .eq("order_no", id)
      .limit(1);
    if (result.error) throw result.error;
    request = Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  return request;
}

function currentMembership(request) {
  const memberships = Array.isArray(request?.transport_group_members) ? request.transport_group_members : [];
  return memberships[0] || null;
}

async function groupStats(supabase, group) {
  const groupRef = group.group_id || group.id;
  const members = await getGroupMembersWithRequests(supabase, groupRef);
  const activeMembers = members.filter(member => member.transport_requests && member.transport_requests.status !== "closed");
  const currentPassengerCount = activeMembers.reduce((sum, member) => {
    return sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
  }, 0);
  const terminalValues = Array.from(new Set(
    activeMembers
      .map(member => String(member.transport_requests?.terminal || "").trim())
      .filter(Boolean)
  ));
  const maxPassengers = Number(group.max_passengers || 5);
  return {
    members,
    active_members: activeMembers,
    current_passenger_count: currentPassengerCount,
    max_passengers: maxPassengers,
    remaining_passenger_count: Math.max(maxPassengers - currentPassengerCount, 0),
    terminal_summary: terminalValues.length ? terminalValues.join(" / ") : (group.terminal || "--")
  };
}

function assertGroupCompatible(request, group, stats, options = {}) {
  const status = String(group.status || "").trim().toLowerCase();
  const requestDate = requestServiceDate(request);
  const passengerCount = Number(request.passenger_count || 0);
  const groupDate = String(group.group_date || "").slice(0, 10);

  if (group.service_type !== request.service_type || group.airport_code !== request.airport_code || groupDate !== requestDate) {
    const error = new Error(INCOMPATIBLE_GROUP_MESSAGE);
    error.statusCode = 400;
    throw error;
  }
  if (BLOCKED_GROUP_STATUSES.has(status)) {
    const error = new Error("该拼车组已关闭或已取消，不能加入。");
    error.statusCode = 400;
    throw error;
  }
  if (stats.remaining_passenger_count < passengerCount) {
    const error = new Error("该拼车组人数已满或剩余座位不足，不能加入。");
    error.statusCode = 400;
    throw error;
  }
  const code = groupDisplayCode(group);
  const ref = group.group_id || group.id;
  if ((options.excludeGroupIds || []).some(value => String(value || "") === String(code) || String(value || "") === String(ref))) {
    const error = new Error("目标拼车组不能是当前拼车组。");
    error.statusCode = 400;
    throw error;
  }
}

async function listCandidateGroups(supabase, request, options = {}) {
  const serviceDate = requestServiceDate(request);
  const { data, error } = await supabase
    .from("transport_groups")
    .select("*")
    .eq("service_type", request.service_type)
    .eq("airport_code", request.airport_code)
    .eq("group_date", serviceDate)
    .order("preferred_time_start", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) throw error;

  const candidates = [];
  for (const group of data || []) {
    const stats = await groupStats(supabase, group);
    try {
      assertGroupCompatible(request, group, stats, {
        excludeGroupIds: options.excludeGroupIds || []
      });
    } catch (candidateError) {
      continue;
    }
    candidates.push({
      group_id: group.id,
      group_code: groupDisplayCode(group),
      group_ref: group.group_id || group.id,
      service_type: group.service_type,
      group_date: group.group_date,
      airport_code: group.airport_code,
      airport_name: group.airport_name,
      terminal_summary: stats.terminal_summary,
      current_passenger_count: stats.current_passenger_count,
      max_passengers: stats.max_passengers,
      status: group.status,
      dispatch_status: group.dispatch_status || "pending_dispatch",
      preferred_time_start: group.preferred_time_start || group.flight_time_reference
    });
  }

  return candidates;
}

async function validateTargetGroup(supabase, request, targetGroupId, options = {}) {
  const group = await getGroupByBusinessId(supabase, targetGroupId);
  const stats = await groupStats(supabase, group);
  assertGroupCompatible(request, group, stats, options);
  return { group, stats };
}

async function updateRequestOperationStamp(supabase, requestId, adminUser) {
  const { error } = await supabase
    .from("transport_requests")
    .update({
      last_operated_by: resolveAdminDisplayName(adminUser),
      last_operated_at: new Date().toISOString()
    })
    .eq("id", requestId);
  if (error) throw error;
}

async function logRequestGroupOperation(supabase, adminUser, request, action, payload = {}) {
  await logAdminOperation(supabase, {
    admin_user_id: adminUser.id || null,
    target_type: "transport_request",
    target_id: request.id,
    action,
    before_data: payload.before_data || null,
    after_data: payload.after_data || null,
    metadata: {
      request_id: request.id,
      reason: payload.reason || null,
      changed_by: resolveAdminDisplayName(adminUser),
      changed_at: payload.changed_at || new Date().toISOString(),
      ...payload.metadata
    }
  });
}

async function handleJoin(supabase, adminUser, request, body) {
  const targetGroupId = String(body.target_group_id || "").trim();
  if (!targetGroupId) {
    const error = new Error("请选择要加入的拼车组。");
    error.statusCode = 400;
    throw error;
  }
  if (currentMembership(request)) {
    const error = new Error("该订单已加入拼车组，请使用更换拼车组。");
    error.statusCode = 400;
    throw error;
  }
  const { group } = await validateTargetGroup(supabase, request, targetGroupId);
  const before = { group_id: null, group_code: null };
  const result = await addRequestToGroup(supabase, group.group_id || group.id, request);
  await updateRequestOperationStamp(supabase, request.id, adminUser);
  await logRequestGroupOperation(supabase, adminUser, request, "transport_request_group_changed", {
    reason: body.reason,
    before_data: before,
    after_data: { group_id: group.id, group_code: groupDisplayCode(group) },
    metadata: {
      old_group_id: null,
      old_group_code: null,
      new_group_id: group.id,
      new_group_code: groupDisplayCode(group)
    }
  });
  return { action: "join", group: result };
}

async function handleChange(supabase, adminUser, request, body) {
  const membership = currentMembership(request);
  if (!membership) {
    return handleJoin(supabase, adminUser, request, body);
  }
  const targetGroupId = String(body.target_group_id || "").trim();
  if (!targetGroupId) {
    const error = new Error("请选择目标拼车组。");
    error.statusCode = 400;
    throw error;
  }
  const oldGroup = await getGroupByBusinessId(supabase, membership.group_id);
  const { group: targetGroup } = await validateTargetGroup(supabase, request, targetGroupId, {
    excludeGroupIds: [membership.group_id]
  });
  let lifecycle;
  try {
    const removed = await removeRequestFromGroup(supabase, request.id, {
      regroup: false,
      emptyReason: "zero_members_after_group_change"
    });
    const added = await addRequestToGroup(supabase, targetGroup.group_id || targetGroup.id, request);
    lifecycle = {
      old_group_id: oldGroup.group_id || oldGroup.id,
      new_group_id: targetGroup.group_id || targetGroup.id,
      affected_groups: removed?.affected_groups || [],
      new_group: added
    };
  } catch (error) {
    try {
      const latestRequest = await fetchRequest(supabase, request.id);
      if (!currentMembership(latestRequest)) {
        await addRequestToGroup(supabase, oldGroup.group_id || oldGroup.id, request);
      }
    } catch (restoreError) {
      error.restore_error = restoreError?.message || String(restoreError);
    }
    throw error;
  }
  await updateRequestOperationStamp(supabase, request.id, adminUser);
  await logRequestGroupOperation(supabase, adminUser, request, "transport_request_group_changed", {
    reason: body.reason,
    before_data: { group_id: oldGroup.id, group_code: groupDisplayCode(oldGroup) },
    after_data: { group_id: targetGroup.id, group_code: groupDisplayCode(targetGroup) },
    metadata: {
      old_group_id: oldGroup.id,
      old_group_code: groupDisplayCode(oldGroup),
      new_group_id: targetGroup.id,
      new_group_code: groupDisplayCode(targetGroup)
    }
  });
  return { action: "change", lifecycle };
}

async function handleRemove(supabase, adminUser, request, body) {
  const disabledError = new Error("remove_group is disabled because transport requests must remain in exactly one carpool group. Use create_group or change_group instead.");
  disabledError.statusCode = 400;
  throw disabledError;

  const membership = currentMembership(request);
  if (!membership) {
    const error = new Error("该订单当前没有拼车组。");
    error.statusCode = 400;
    throw error;
  }
  const oldGroup = await getGroupByBusinessId(supabase, membership.group_id);
  const lifecycle = await removeRequestFromGroup(supabase, request.id, {
    regroup: false,
    emptyReason: "zero_members_after_group_change"
  });
  await updateRequestOperationStamp(supabase, request.id, adminUser);
  await logRequestGroupOperation(supabase, adminUser, request, "transport_request_removed_from_group", {
    reason: body.reason,
    before_data: { group_id: oldGroup.id, group_code: groupDisplayCode(oldGroup) },
    after_data: { group_id: null, group_code: null },
    metadata: {
      old_group_id: oldGroup.id,
      old_group_code: groupDisplayCode(oldGroup),
      request_id: request.id,
      new_group_state: "disabled_remove_group",
      payment_preserved: true
    }
  });
  return { action: "remove", lifecycle };
}

async function handleCreate(supabase, adminUser, request) {
  if (currentMembership(request)) {
    const error = new Error("该订单已加入拼车组，不能重复创建新拼车组。");
    error.statusCode = 400;
    throw error;
  }
  const group = await createGroupForRequest(supabase, request, { isInitiator: true });
  const syncedGroup = await syncGroupState(supabase, group.group_id || group.group_ref || group.id);
  await updateRequestOperationStamp(supabase, request.id, adminUser);
  await logRequestGroupOperation(supabase, adminUser, request, "transport_group_created_from_request", {
    after_data: { group_id: group.group_ref || group.id, group_code: groupDisplayCode(group) },
    metadata: {
      new_group_id: group.group_ref || group.id,
      new_group_code: groupDisplayCode(group)
    }
  });
  return { action: "create", group: syncedGroup || group };
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) return;

  const id = String(req.query?.id || "").trim();
  try {
    const request = await fetchRequest(supabase, id);
    if (!request) {
      badRequest(res, "未找到接送机订单。");
      return;
    }

    if (req.method === "GET") {
      const membership = currentMembership(request);
      const candidates = await listCandidateGroups(supabase, request, {
        excludeGroupIds: membership ? [membership.group_id] : []
      });
      ok(res, {
        request_id: request.id,
        current_group_id: membership?.group_id || null,
        candidate_groups: candidates
      });
      return;
    }

    if (req.method !== "POST") {
      methodNotAllowed(res, ["GET", "POST"]);
      return;
    }

    const body = await parseJsonBody(req);
    const action = String(body.action || "").trim();
    let result;
    if (action === "join_group") {
      result = await handleJoin(supabase, adminUser, request, body);
    } else if (action === "change_group") {
      result = await handleChange(supabase, adminUser, request, body);
    } else if (action === "remove_group") {
      result = await handleRemove(supabase, adminUser, request, body);
    } else if (action === "create_group") {
      result = await handleCreate(supabase, adminUser, request);
    } else {
      badRequest(res, "不支持的拼车组操作。");
      return;
    }

    ok(res, result);
  } catch (error) {
    if (error?.statusCode && error.statusCode < 500) {
      badRequest(res, error.message);
      return;
    }
    serverError(res, error);
  }
};
