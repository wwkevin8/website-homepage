const { allocateOrderNumber, allocateGroupId } = require("./order-numbers");
const { DEFAULT_GROUP_MAX_PASSENGERS } = require("./transport");

const GROUP_STATUS = {
  SINGLE_MEMBER: "single_member",
  ACTIVE: "active",
  FULL: "full",
  CLOSED: "closed",
  CANCELLED: "cancelled"
};

const JOINABLE_GROUP_STATUSES = new Set([
  GROUP_STATUS.SINGLE_MEMBER,
  GROUP_STATUS.ACTIVE,
  "open"
]);

const BLOCKED_JOIN_GROUP_STATUSES = new Set([
  GROUP_STATUS.FULL,
  GROUP_STATUS.CLOSED,
  GROUP_STATUS.CANCELLED
]);

const MAX_TIME_ADJUST_CANDIDATE_HOURS = 3;
const DEFAULT_EMPTY_GROUP_GRACE_MINUTES = 10;

function isMissingColumnError(error, marker) {
  return Boolean(error?.message && error.message.includes(marker));
}

function deriveDisplayGroupId(sourceId, dateValue) {
  const date = new Date(dateValue || Date.now());
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const suffix = String(sourceId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-4)
    .toUpperCase()
    .padStart(4, "0");
  return `GRP-${yy}${mm}${dd}-${suffix}`;
}

function normalizeGroupStatus(status) {
  if (status === "open") return GROUP_STATUS.ACTIVE;
  return status;
}

function normalizeGroupRecord(group, requestLike) {
  if (!group) {
    return group;
  }
  const ref = group.group_id || group.id;
  return {
    ...group,
    group_ref: group.id || group.group_id,
    group_id: group.group_id || deriveDisplayGroupId(ref, group.group_date || requestLike?.flight_datetime || requestLike?.created_at),
    status: normalizeGroupStatus(group.status)
  };
}

function getIsoDatePart(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function buildTransportLifecycleError(message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sameNormalizedText(left, right) {
  return normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();
}

function hoursApart(left, right) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return null;
  }
  return Math.abs(leftDate.getTime() - rightDate.getTime()) / (60 * 60 * 1000);
}

function deriveServiceDateFromTimes(times = {}) {
  const source = times.preferred_time_start || times.flight_datetime;
  if (!source) {
    throw buildTransportLifecycleError("preferred_time_start or flight_datetime is required", 400);
  }
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    throw buildTransportLifecycleError("time adjustment datetime is invalid", 400);
  }
  return parsed.toISOString().slice(0, 10);
}

function getGroupJoinRef(group, fallback) {
  return group?.group_id || group?.group_ref || fallback || group?.id || null;
}

function getGroupDisplayId(group, fallback) {
  return group?.group_id || deriveDisplayGroupId(group?.group_ref || group?.id || fallback, group?.group_date || group?.preferred_time_start);
}

function buildCandidateWarning(code, message) {
  return { code, message };
}

async function logEmptyGroupDeletion(supabase, group, deletedAt, reason) {
  return;
}

function summarizeCandidateGroup(group, stats, warnings = []) {
  return {
    group_id: getGroupDisplayId(group),
    group_ref: group.group_ref || group.id || group.group_id,
    status: normalizeGroupStatus(group.status),
    service_type: group.service_type,
    airport_code: group.airport_code,
    airport_name: group.airport_name,
    terminal: group.terminal,
    group_date: group.group_date,
    preferred_time_start: group.preferred_time_start,
    flight_time_reference: group.flight_time_reference,
    current_passenger_count: stats.current_passenger_count,
    remaining_passenger_count: stats.remaining_passenger_count,
    max_passengers: stats.max_passengers,
    member_order_nos: stats.member_order_nos,
    warnings
  };
}

function getGroupDateFromRequest(request) {
  return getIsoDatePart(request.preferred_time_start || request.flight_datetime || request.preferred_time_end || request.created_at);
}

function getGroupPayloadFromRequest(request, groupId) {
  const isClosed = request.status === "closed";
  return {
    group_id: groupId,
    service_type: request.service_type,
    group_date: getGroupDateFromRequest(request),
    airport_code: request.airport_code,
    airport_name: request.airport_name,
    terminal: request.terminal,
    location_from: request.location_from,
    location_to: request.location_to,
    flight_time_reference: request.flight_datetime,
    preferred_time_start: request.preferred_time_start || request.flight_datetime,
    preferred_time_end: request.preferred_time_end,
    max_passengers: DEFAULT_GROUP_MAX_PASSENGERS,
    visible_on_frontend: !isClosed,
    status: isClosed ? GROUP_STATUS.CLOSED : GROUP_STATUS.SINGLE_MEMBER,
    notes: request.notes || null
  };
}

async function createGroupForRequest(supabase, request, options = {}) {
  const groupId = options.groupId || await allocateGroupId(supabase);
  const groupPayload = getGroupPayloadFromRequest(request, groupId);
  let group = null;
  let groupRef = groupId;

  const primaryInsert = await supabase
    .from("transport_groups")
    .insert(groupPayload)
    .select("*")
    .single();

  if (primaryInsert.error && isMissingColumnError(primaryInsert.error, "transport_groups.group_id")) {
    const legacyInsert = await supabase
      .from("transport_groups")
      .insert({
        service_type: request.service_type,
        group_date: getGroupDateFromRequest(request),
        airport_code: request.airport_code,
        airport_name: request.airport_name,
        terminal: request.terminal,
        location_from: request.location_from,
        location_to: request.location_to,
        flight_time_reference: request.flight_datetime,
        preferred_time_start: request.preferred_time_start || request.flight_datetime,
        preferred_time_end: request.preferred_time_end,
        max_passengers: DEFAULT_GROUP_MAX_PASSENGERS,
        visible_on_frontend: request.status !== "closed",
        status: request.status === "closed" ? GROUP_STATUS.CLOSED : GROUP_STATUS.SINGLE_MEMBER,
        notes: request.notes || null
      })
      .select("*")
      .single();

    if (legacyInsert.error) {
      throw legacyInsert.error;
    }
    group = legacyInsert.data;
    groupRef = group.id;
  } else if (primaryInsert.error) {
    throw primaryInsert.error;
  } else {
    group = primaryInsert.data;
  }

  if (options.skipMembership === true) {
    return normalizeGroupRecord(group, request);
  }

  const memberPayload = {
    group_id: groupRef,
    request_id: request.id,
    passenger_count_snapshot: request.passenger_count,
    luggage_count_snapshot: request.luggage_count,
    is_initiator: options.isInitiator !== false
  };

  let memberError = null;
  const memberInsert = await supabase
    .from("transport_group_members")
    .insert(memberPayload);

  if (memberInsert.error && isMissingColumnError(memberInsert.error, "transport_group_members.is_initiator")) {
    const legacyMemberInsert = await supabase
      .from("transport_group_members")
      .insert({
        group_id: groupRef,
        request_id: request.id,
        passenger_count_snapshot: request.passenger_count,
        luggage_count_snapshot: request.luggage_count
      });
    if (legacyMemberInsert.error) {
      memberError = legacyMemberInsert.error;
    }
  } else if (memberInsert.error) {
    memberError = memberInsert.error;
  }

  if (memberError) {
    try {
      await deleteEmptyGroupIfEligible(supabase, groupRef, { reason: "failed_group_membership_insert", force: true });
    } catch (cleanupError) {
      memberError.cleanup_error = cleanupError?.message || String(cleanupError);
      memberError.message = `${memberError.message || "failed to create group membership"}; cleanup of newly-created empty group failed: ${memberError.cleanup_error}`;
    }
    throw memberError;
  }

  return normalizeGroupRecord(group, request);
}

async function backfillMissingPickupGroups(supabase, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200;
  const query = supabase
    .from("transport_requests")
    .select("*, transport_group_members(request_id)")
    .eq("service_type", "pickup")
    .is("transport_group_members", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const excludeSources = Array.from(new Set([
    "admin_manual",
    ...(options.excludeSources || [])
  ].map(source => String(source || "").trim()).filter(Boolean)));
  if (excludeSources.includes("admin_manual")) {
    query.or("source.is.null,source.neq.admin_manual");
  }

  const { data: requests, error } = await query;

  if (error) {
    throw error;
  }

  const createdGroups = [];
  const backfillableRequests = (requests || []).filter(request => request.shareable !== false);
  for (const request of backfillableRequests) {
    const group = await createGroupForRequest(supabase, request, {
      isInitiator: true
    });
    createdGroups.push({
      request_id: request.id,
      order_no: request.order_no,
      group_id: group.group_id
    });
  }

  return createdGroups;
}

async function getGroupByBusinessId(supabase, groupId) {
  const primary = await supabase
    .from("transport_groups")
    .select("*")
    .eq("group_id", groupId)
    .single();

  if (primary.error && isMissingColumnError(primary.error, "transport_groups.group_id")) {
    const legacy = await supabase
      .from("transport_groups")
      .select("*")
      .eq("id", groupId)
      .single();
    if (legacy.error) {
      throw legacy.error;
    }
    return normalizeGroupRecord(legacy.data);
  }

  if (primary.error) {
    throw primary.error;
  }

  return normalizeGroupRecord(primary.data);
}

async function getGroupMembersWithRequests(supabase, groupId) {
  const { data, error } = await supabase
    .from("transport_group_members")
    .select("*, transport_requests(*)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

async function getTransportGroupMemberCount(supabase, groupId) {
  const groupIds = Array.from(new Set((Array.isArray(groupId) ? groupId : [groupId]).filter(Boolean)));
  if (!groupIds.length) {
    return 0;
  }
  const { count, error } = await supabase
    .from("transport_group_members")
    .select("id", { count: "exact", head: true })
    .in("group_id", groupIds);

  if (error) {
    throw error;
  }

  return Number(count || 0);
}

function isActiveGroupMember(member = {}) {
  const requestStatus = String(member.transport_requests?.status || "").toLowerCase();
  return Boolean(member.transport_requests) && !["closed", "cancelled"].includes(requestStatus);
}

function summarizeGroupMembers(members = []) {
  return (members || []).reduce((summary, member) => {
    summary.member_count += 1;
    if (isActiveGroupMember(member)) {
      summary.active_member_count += 1;
      summary.active_passenger_count += Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
    }
    return summary;
  }, {
    member_count: 0,
    active_member_count: 0,
    active_passenger_count: 0
  });
}

async function getTransportGroupMemberStats(supabase, groupId) {
  const groupIds = Array.from(new Set((Array.isArray(groupId) ? groupId : [groupId]).filter(Boolean)));
  if (!groupIds.length) {
    return summarizeGroupMembers([]);
  }
  const { data, error } = await supabase
    .from("transport_group_members")
    .select("group_id, request_id, passenger_count_snapshot, transport_requests(id, status, passenger_count)")
    .in("group_id", groupIds);

  if (error) {
    throw error;
  }

  return summarizeGroupMembers(data || []);
}

function groupRefCandidates(group, fallback) {
  return Array.from(new Set([
    group?.group_id,
    group?.group_ref,
    group?.id,
    fallback
  ].map(value => String(value || "").trim()).filter(Boolean)));
}

async function loadTransportGroupMemberStatsMap(supabase, groups = []) {
  const refGroups = (groups || []).map(group => ({
    group,
    refs: groupRefCandidates(group)
  }));
  const refs = Array.from(new Set(refGroups.flatMap(item => item.refs)));
  const statsMap = new Map();

  refGroups.forEach(item => {
    item.refs.forEach(ref => statsMap.set(ref, summarizeGroupMembers([])));
  });

  if (!refs.length) {
    return statsMap;
  }

  const { data, error } = await supabase
    .from("transport_group_members")
    .select("group_id, request_id, passenger_count_snapshot, transport_requests(id, status, passenger_count)")
    .in("group_id", refs);

  if (error) {
    throw error;
  }

  const membersByRef = new Map();
  (data || []).forEach(member => {
    const ref = String(member.group_id || "").trim();
    if (!membersByRef.has(ref)) {
      membersByRef.set(ref, []);
    }
    membersByRef.get(ref).push(member);
  });

  refGroups.forEach(item => {
    const members = item.refs.flatMap(ref => membersByRef.get(ref) || []);
    const stats = summarizeGroupMembers(members);
    item.refs.forEach(ref => statsMap.set(ref, stats));
  });

  return statsMap;
}

function getEmptyGroupGraceMinutes(options = {}) {
  const value = Number(options.graceMinutes ?? options.grace_minutes ?? DEFAULT_EMPTY_GROUP_GRACE_MINUTES);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_EMPTY_GROUP_GRACE_MINUTES;
}

function getEmptyGroupCutoffIso(options = {}) {
  if (options.cutoffIso) {
    return options.cutoffIso;
  }
  const graceMinutes = getEmptyGroupGraceMinutes(options);
  return new Date(Date.now() - graceMinutes * 60 * 1000).toISOString();
}

function getGroupAgeReferenceIso(group = {}) {
  return group.updated_at || group.created_at || null;
}

function isEmptyGroupOldEnough(group = {}, options = {}) {
  if (options.force === true) {
    return true;
  }
  const referenceIso = getGroupAgeReferenceIso(group);
  if (!referenceIso) {
    return false;
  }
  const referenceMs = new Date(referenceIso).getTime();
  const cutoffMs = new Date(getEmptyGroupCutoffIso(options)).getTime();
  return Number.isFinite(referenceMs) && Number.isFinite(cutoffMs) && referenceMs <= cutoffMs;
}

async function deleteEmptyGroupIfEligible(supabase, groupOrId, options = {}) {
  const groupId = typeof groupOrId === "string" ? groupOrId : (groupOrId?.group_id || groupOrId?.id || null);
  if (!groupId) {
    return { deleted: false, reason: "missing_group_id" };
  }

  let group = typeof groupOrId === "string" ? null : groupOrId;
  if (!group || !group.group_ref) {
    try {
      group = await getGroupByBusinessId(supabase, groupId);
    } catch (error) {
      if (String(error?.message || "").includes("multiple (or no) rows")) {
        return { deleted: false, reason: "group_not_found" };
      }
      throw error;
    }
  }

  const refs = groupRefCandidates(group, groupId);
  const memberStats = options.memberStats || await getTransportGroupMemberStats(supabase, refs);
  if (memberStats.active_member_count !== 0) {
    return {
      deleted: false,
      reason: "members_exist",
      member_count: memberStats.member_count,
      active_member_count: memberStats.active_member_count,
      active_passenger_count: memberStats.active_passenger_count,
      group
    };
  }

  if (!isEmptyGroupOldEnough(group, options)) {
    return {
      deleted: false,
      reason: "empty_group_grace_period",
      member_count: memberStats.member_count,
      active_member_count: memberStats.active_member_count,
      active_passenger_count: memberStats.active_passenger_count,
      group,
      cleanup_after: getEmptyGroupCutoffIso({ ...options, cutoffIso: undefined })
    };
  }

  const deletedAt = new Date().toISOString();
  const reason = options.reason || "zero_members";
  await logEmptyGroupDeletion(supabase, group, deletedAt, reason);

  const memberDelete = await supabase
    .from("transport_group_members")
    .delete()
    .in("group_id", refs);

  if (memberDelete.error) {
    throw memberDelete.error;
  }

  const { error } = await supabase
    .from("transport_groups")
    .delete()
    .eq("id", group.group_ref || group.id);

  if (error) {
    throw error;
  }

  return {
    deleted: true,
    group_id: group.group_id || groupId,
    deleted_at: deletedAt,
    reason,
    member_count: memberStats.member_count,
    active_member_count: memberStats.active_member_count,
    active_passenger_count: memberStats.active_passenger_count
  };
}

async function cleanupEmptyTransportGroups(supabase, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);
  const cutoffIso = getEmptyGroupCutoffIso(options);
  const { data, error } = await supabase
    .from("transport_groups")
    .select("*")
    .or(`updated_at.lte.${cutoffIso},and(updated_at.is.null,created_at.lte.${cutoffIso})`)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const deleted = [];
  const skipped = [];
  const normalizedGroups = (data || []).map(group => normalizeGroupRecord(group));
  const statsMap = await loadTransportGroupMemberStatsMap(supabase, normalizedGroups);
  for (const group of normalizedGroups) {
    const refs = groupRefCandidates(group);
    const memberStats = refs.map(ref => statsMap.get(ref)).find(Boolean) || summarizeGroupMembers([]);
    if (memberStats.active_member_count !== 0) {
      skipped.push({
        deleted: false,
        reason: "members_exist",
        member_count: memberStats.member_count,
        active_member_count: memberStats.active_member_count,
        active_passenger_count: memberStats.active_passenger_count,
        group
      });
      continue;
    }
    const result = await deleteEmptyGroupIfEligible(supabase, group, {
      ...options,
      cutoffIso,
      memberStats,
      reason: "zero_members"
    });
    if (result.deleted) {
      deleted.push(result);
    } else {
      skipped.push(result);
    }
  }

  return { skipped: false, deleted, skipped_items: skipped };
}

function getActiveMembers(members) {
  return (members || []).filter(isActiveGroupMember);
}

async function getGroupCapacityStats(supabase, groupId, group = null) {
  const members = await getGroupMembersWithRequests(supabase, groupId);
  const activeMembers = getActiveMembers(members);
  const currentPassengerCount = activeMembers.reduce((sum, member) => {
    return sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0);
  }, 0);
  const maxPassengers = Number(group?.max_passengers || DEFAULT_GROUP_MAX_PASSENGERS);

  return {
    members,
    active_members: activeMembers,
    current_passenger_count: currentPassengerCount,
    remaining_passenger_count: Math.max(maxPassengers - currentPassengerCount, 0),
    max_passengers: maxPassengers,
    member_order_nos: activeMembers
      .map(member => member.transport_requests?.order_no)
      .filter(Boolean)
  };
}

function validateGroupJoinShape(request, group, stats, times = {}, options = {}) {
  const currentGroupIds = new Set((options.currentGroupIds || []).filter(Boolean));
  const requestedPassengerCount = Number(request.passenger_count || 0);
  const serviceDate = deriveServiceDateFromTimes(times);
  const groupId = getGroupJoinRef(group);
  const displayGroupId = getGroupDisplayId(group);
  const status = normalizeGroupStatus(group.status);
  const rawStatus = group.status;
  const warnings = [];

  if (!requestedPassengerCount || requestedPassengerCount < 1) {
    throw buildTransportLifecycleError("request passenger_count is invalid", 400);
  }
  if (currentGroupIds.has(groupId) || currentGroupIds.has(displayGroupId)) {
    throw buildTransportLifecycleError("target group is the current group", 400);
  }
  if (BLOCKED_JOIN_GROUP_STATUSES.has(status) || BLOCKED_JOIN_GROUP_STATUSES.has(rawStatus)) {
    throw buildTransportLifecycleError("target group is not joinable", 400);
  }
  if (!JOINABLE_GROUP_STATUSES.has(status) && !JOINABLE_GROUP_STATUSES.has(rawStatus)) {
    throw buildTransportLifecycleError("target group status is not joinable", 400);
  }
  if (group.service_type !== request.service_type) {
    throw buildTransportLifecycleError("target group service_type does not match", 400);
  }
  if (group.airport_code !== request.airport_code) {
    throw buildTransportLifecycleError("target group airport_code does not match", 400);
  }
  if (group.group_date !== serviceDate) {
    throw buildTransportLifecycleError("target group date does not match", 400);
  }
  if (!stats.active_members.length) {
    throw buildTransportLifecycleError("target group has no active members", 400);
  }
  if (stats.remaining_passenger_count < requestedPassengerCount) {
    throw buildTransportLifecycleError("target group capacity is not enough", 409);
  }

  const targetGroupTime = group.preferred_time_start || group.flight_time_reference;
  const referenceTime = times.preferred_time_start || times.flight_datetime;
  const distance = hoursApart(referenceTime, targetGroupTime);
  if (distance === null || distance > MAX_TIME_ADJUST_CANDIDATE_HOURS) {
    throw buildTransportLifecycleError("target group time is outside the allowed window", 400);
  }

  const requestTerminal = normalizeText(request.terminal);
  const groupTerminal = normalizeText(group.terminal);
  if (requestTerminal && groupTerminal && !sameNormalizedText(requestTerminal, groupTerminal)) {
    warnings.push(buildCandidateWarning(
      "cross_terminal_surcharge",
      "订单航站楼与目标组不同，可跨航站楼加入；请客服确认跨航站楼费用和拼车组价格。"
    ));
  }
  if (!requestTerminal || !groupTerminal) {
    warnings.push(buildCandidateWarning("terminal_partial", "订单或目标组航站楼为空，请客服确认航站楼兼容。"));
  }

  return {
    service_date: serviceDate,
    warnings
  };
}

async function validateRequestCanJoinGroup(supabase, request, targetGroupId, times = {}, options = {}) {
  const group = await getGroupByBusinessId(supabase, targetGroupId);
  const groupRef = getGroupJoinRef(group, targetGroupId);

  const duplicate = await supabase
    .from("transport_group_members")
    .select("id")
    .eq("group_id", groupRef)
    .eq("request_id", request.id)
    .limit(1);

  if (duplicate.error) {
    throw duplicate.error;
  }
  if ((duplicate.data || []).length) {
    throw buildTransportLifecycleError("request is already in target group", 400);
  }

  const stats = await getGroupCapacityStats(supabase, groupRef, group);
  const validation = validateGroupJoinShape(request, group, stats, times, options);

  return {
    group,
    group_ref: groupRef,
    stats,
    warnings: validation.warnings
  };
}

async function findTimeAdjustCandidateGroups(supabase, request, times = {}, options = {}) {
  const serviceDate = deriveServiceDateFromTimes(times);
  const currentGroupIds = new Set((options.currentGroupIds || []).filter(Boolean));
  const passengerCount = Number(request.passenger_count || 0);
  if (!passengerCount || passengerCount < 1) {
    throw buildTransportLifecycleError("request passenger_count is invalid", 400);
  }

  const { data, error } = await supabase
    .from("transport_groups_public_view")
    .select("group_id, service_type, group_date, airport_code, terminal, location_from, location_to, preferred_time_start, current_passenger_count, remaining_passenger_count, status")
    .eq("service_type", request.service_type)
    .eq("airport_code", request.airport_code)
    .eq("group_date", serviceDate)
    .in("status", [GROUP_STATUS.SINGLE_MEMBER, GROUP_STATUS.ACTIVE, "open"])
    .gte("remaining_passenger_count", passengerCount)
    .order("preferred_time_start", { ascending: true, nullsFirst: false })
    .limit(options.limit || 20);

  if (error) {
    throw error;
  }

  const candidates = [];
  for (const rawGroup of data || []) {
    const fullGroup = await getGroupByBusinessId(supabase, rawGroup.group_id);
    const group = normalizeGroupRecord({
      ...(fullGroup || {}),
      current_passenger_count: rawGroup.current_passenger_count,
      remaining_passenger_count: rawGroup.remaining_passenger_count,
      status: rawGroup.status || fullGroup?.status
    });
    const groupRef = getGroupJoinRef(group, rawGroup.group_id);
    const displayId = getGroupDisplayId(group, rawGroup.group_id);
    if (currentGroupIds.has(groupRef) || currentGroupIds.has(displayId)) {
      continue;
    }

    try {
      const stats = await getGroupCapacityStats(supabase, groupRef, group);
      const validation = validateGroupJoinShape(request, group, stats, times, {
        currentGroupIds: Array.from(currentGroupIds)
      });
      candidates.push({
        ...summarizeCandidateGroup(group, stats, validation.warnings),
        time_distance_hours: hoursApart(times.preferred_time_start || times.flight_datetime, group.preferred_time_start || group.flight_time_reference)
      });
    } catch (candidateError) {
      if (candidateError.statusCode >= 500) {
        throw candidateError;
      }
    }
  }

  return candidates
    .sort((left, right) => {
      const leftDistance = Number(left.time_distance_hours || 0);
      const rightDistance = Number(right.time_distance_hours || 0);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      if (left.status !== right.status) return left.status === GROUP_STATUS.ACTIVE ? -1 : 1;
      return Number(left.remaining_passenger_count || 0) - Number(right.remaining_passenger_count || 0);
    })
    .map(({ time_distance_hours, ...group }) => group);
}

async function setRequestStatuses(supabase, requestIds, status) {
  if (!requestIds.length) {
    return;
  }
  const payload = { status };
  if (status === "closed") {
    payload.closed_at = new Date().toISOString();
  }
  if (status !== "closed") {
    payload.closed_at = null;
    payload.closed_reason = null;
  }
  const { error } = await supabase
    .from("transport_requests")
    .update(payload)
    .in("id", requestIds);

  if (error) {
    throw error;
  }
}

async function syncGroupState(supabase, groupId, options = {}) {
  const group = await getGroupByBusinessId(supabase, groupId);
  if ([GROUP_STATUS.CLOSED, GROUP_STATUS.CANCELLED].includes(group.status)) {
    return group;
  }

  const members = await getGroupMembersWithRequests(supabase, groupId);
  if (!members.length) {
    const cleanupResult = await deleteEmptyGroupIfEligible(supabase, group, {
      reason: options.emptyReason || "zero_members"
    });
    if (cleanupResult.deleted) {
      return {
        ...group,
        deleted: true,
        status: GROUP_STATUS.CLOSED,
        current_passenger_count: 0,
        remaining_passenger_count: Number(group.max_passengers || 0),
        cleanup: cleanupResult
      };
    }

    return {
      ...group,
      deleted: false,
      empty_pending_cleanup: false,
      current_passenger_count: 0,
      remaining_passenger_count: Number(group.max_passengers || 0)
    };
  }

  const activeMembers = getActiveMembers(members);
  const activeRequestIds = activeMembers.map(member => member.request_id);
  const totalPassengers = activeMembers.reduce((sum, member) => sum + Number(member.transport_requests?.passenger_count || member.passenger_count_snapshot || 0), 0);

  let nextStatus = GROUP_STATUS.SINGLE_MEMBER;
  if (!activeMembers.length) {
    nextStatus = GROUP_STATUS.CLOSED;
  } else if (totalPassengers >= Number(group.max_passengers || DEFAULT_GROUP_MAX_PASSENGERS)) {
    nextStatus = GROUP_STATUS.FULL;
  } else if (activeMembers.length >= 2) {
    nextStatus = GROUP_STATUS.ACTIVE;
  }

  if (activeMembers.length >= 2) {
    await setRequestStatuses(supabase, activeRequestIds, "matched");
  } else if (activeMembers.length === 1) {
    await setRequestStatuses(supabase, activeRequestIds, "published");
  }

  const representative = activeMembers[0]?.transport_requests || members[0]?.transport_requests || null;
  const updatePayload = {
    status: nextStatus
  };

  if (representative) {
    updatePayload.group_date = getGroupDateFromRequest(representative);
    updatePayload.airport_code = representative.airport_code;
    updatePayload.airport_name = representative.airport_name;
    updatePayload.terminal = representative.terminal;
    updatePayload.location_from = representative.location_from;
    updatePayload.location_to = representative.location_to;
    updatePayload.flight_time_reference = representative.flight_datetime;
    updatePayload.preferred_time_start = representative.preferred_time_start || representative.flight_datetime;
    updatePayload.preferred_time_end = representative.preferred_time_end;
    updatePayload.visible_on_frontend = representative.status !== "closed";
  }

  let result = await supabase
    .from("transport_groups")
    .update(updatePayload)
    .eq("group_id", groupId)
    .select("*")
    .single();

  if (result.error && isMissingColumnError(result.error, "transport_groups.group_id")) {
    const legacyPayload = {
      ...updatePayload,
      status: nextStatus
    };
    result = await supabase
      .from("transport_groups")
      .update(legacyPayload)
      .eq("id", group.group_ref || groupId)
      .select("*")
      .single();
  }

  if (result.error) {
    throw result.error;
  }

  return normalizeGroupRecord(result.data, representative);
}

async function createRequestRecord(supabase, requestPayload, options = {}) {
  const orderIdentity = options.orderIdentity || await allocateOrderNumber(supabase, "pickup");
  const insertPayload = {
    ...requestPayload,
    order_no: orderIdentity.orderNo,
    order_type: orderIdentity.orderType,
    business_date: orderIdentity.businessDate,
    status: "published",
    closed_at: null,
    closed_reason: null
  };

  const { data: request, error: requestError } = await supabase
    .from("transport_requests")
    .insert(insertPayload)
    .select("*")
    .single();

  if (requestError) {
    throw requestError;
  }

  return request;
}

async function createPickupRequestWithGroup(supabase, requestPayload, options = {}) {
  const request = await createRequestRecord(supabase, requestPayload, options);

  try {
    const group = await createGroupForRequest(supabase, request, {
      groupId: options.groupId,
      isInitiator: true
    });
    return { request, group };
  } catch (error) {
    await supabase.from("transport_requests").delete().eq("id", request.id);
    throw error;
  }
}

async function addRequestToGroup(supabase, groupId, request) {
  const group = await getGroupByBusinessId(supabase, groupId);
  const memberGroupId = group.group_id || group.group_ref || groupId;
  const { error } = await supabase
    .from("transport_group_members")
    .insert({
      group_id: memberGroupId,
      request_id: request.id,
      passenger_count_snapshot: request.passenger_count,
      luggage_count_snapshot: request.luggage_count,
      is_initiator: false
    });

  if (error && isMissingColumnError(error, "transport_group_members.is_initiator")) {
    const retry = await supabase
      .from("transport_group_members")
      .insert({
        group_id: memberGroupId,
        request_id: request.id,
        passenger_count_snapshot: request.passenger_count,
        luggage_count_snapshot: request.luggage_count
      });
    if (retry.error) {
      throw retry.error;
    }
  } else if (error) {
    throw error;
  }

  return syncGroupState(supabase, memberGroupId);
}

async function insertGroupMembership(supabase, payload) {
  const result = await supabase
    .from("transport_group_members")
    .insert(payload)
    .select("*")
    .single();

  if (result.error && isMissingColumnError(result.error, "transport_group_members.is_initiator")) {
    const { is_initiator, ...legacyPayload } = payload;
    const retry = await supabase
      .from("transport_group_members")
      .insert(legacyPayload)
      .select("*")
      .single();
    if (retry.error) {
      throw retry.error;
    }
    return retry.data;
  }

  if (result.error) {
    throw result.error;
  }
  return result.data;
}

async function safeSyncGroupState(supabase, groupId) {
  if (!groupId) {
    return null;
  }
  try {
    return await syncGroupState(supabase, groupId);
  } catch (error) {
    return {
      group_id: groupId,
      sync_failed: true,
      message: error?.message || String(error)
    };
  }
}

async function getSingleMembershipForRequest(supabase, requestId, expectedGroupId = null) {
  const { data: memberships, error } = await supabase
    .from("transport_group_members")
    .select("id, group_id, request_id, passenger_count_snapshot, luggage_count_snapshot, is_initiator")
    .eq("request_id", requestId);

  if (error) {
    throw error;
  }
  if (!memberships || memberships.length === 0) {
    throw buildTransportLifecycleError("request is not in a group", 400);
  }
  if (memberships.length > 1) {
    throw buildTransportLifecycleError("request has multiple active group memberships; please inspect manually", 409);
  }

  const membership = memberships[0];
  if (expectedGroupId && String(membership.group_id) !== String(expectedGroupId)) {
    throw buildTransportLifecycleError("request group membership changed; please refresh and try again", 409);
  }
  return membership;
}

async function restoreMembership(supabase, membership) {
  return insertGroupMembership(supabase, {
    group_id: membership.group_id,
    request_id: membership.request_id,
    passenger_count_snapshot: membership.passenger_count_snapshot,
    luggage_count_snapshot: membership.luggage_count_snapshot,
    is_initiator: membership.is_initiator !== false
  });
}

async function moveRequestToNewSingleGroupSafely(supabase, request, requestPayload = {}, options = {}) {
  const oldMembership = await getSingleMembershipForRequest(supabase, request.id, options.oldGroupId || null);
  const oldGroupId = oldMembership.group_id;
  const requestAfter = { ...request, ...requestPayload };
  let newGroup = null;
  let newGroupRef = null;
  let insertedMembership = null;
  let oldMembershipDeleted = false;
  let requestUpdated = false;
  const compensation = [];

  try {
    newGroup = await createGroupForRequest(supabase, requestAfter, {
      isInitiator: true,
      skipMembership: true
    });
    newGroupRef = getGroupJoinRef(newGroup, newGroup.group_ref || newGroup.group_id || newGroup.id);

    const deleteOld = await supabase
      .from("transport_group_members")
      .delete()
      .eq("id", oldMembership.id);
    if (deleteOld.error) {
      throw deleteOld.error;
    }
    oldMembershipDeleted = true;

    insertedMembership = await insertGroupMembership(supabase, {
      group_id: newGroupRef,
      request_id: request.id,
      passenger_count_snapshot: requestAfter.passenger_count,
      luggage_count_snapshot: requestAfter.luggage_count,
      is_initiator: true
    });

    const update = await supabase
      .from("transport_requests")
      .update(requestPayload)
      .eq("id", request.id);
    if (update.error) {
      throw update.error;
    }
    requestUpdated = true;

    await getSingleMembershipForRequest(supabase, request.id, newGroupRef);
    const oldGroup = await safeSyncGroupState(supabase, oldGroupId);
    const syncedNewGroup = await safeSyncGroupState(supabase, newGroupRef);

    return {
      old_group_id: oldGroupId,
      new_group_id: getGroupDisplayId(newGroup, newGroupRef),
      new_group_ref: newGroupRef,
      old_group: oldGroup,
      new_group: syncedNewGroup || newGroup,
      replacement_group: syncedNewGroup || newGroup,
      inserted_membership: insertedMembership
    };
  } catch (error) {
    if (insertedMembership?.id) {
      const cleanup = await supabase
        .from("transport_group_members")
        .delete()
        .eq("id", insertedMembership.id);
      compensation.push({
        step: "delete_new_single_membership",
        ok: !cleanup.error,
        message: cleanup.error?.message || null
      });
    } else if (newGroupRef) {
      const cleanup = await supabase
        .from("transport_group_members")
        .delete()
        .eq("group_id", newGroupRef)
        .eq("request_id", request.id);
      compensation.push({
        step: "delete_new_single_membership_by_request",
        ok: !cleanup.error,
        message: cleanup.error?.message || null
      });
    }

    if (oldMembershipDeleted) {
      try {
        await restoreMembership(supabase, oldMembership);
        compensation.push({ step: "restore_old_membership", ok: true, message: null });
      } catch (restoreError) {
        compensation.push({
          step: "restore_old_membership",
          ok: false,
          message: restoreError?.message || String(restoreError)
        });
      }
    }

    if (requestUpdated) {
      const restorePayload = Object.keys(requestPayload || {}).reduce((payload, field) => {
        payload[field] = request[field] === undefined ? null : request[field];
        return payload;
      }, {});
      const restoreRequest = await supabase
        .from("transport_requests")
        .update(restorePayload)
        .eq("id", request.id);
      compensation.push({
        step: "restore_request_after_new_single_failure",
        ok: !restoreRequest.error,
        message: restoreRequest.error?.message || null
      });
    }

    if (newGroupRef) {
      try {
        const cleanupGroup = await deleteEmptyGroupIfEligible(supabase, newGroupRef, { reason: "failed_move_out_new_single", force: true });
        compensation.push({ step: "delete_new_single_group_if_empty", ok: true, result: cleanupGroup });
      } catch (cleanupError) {
        compensation.push({
          step: "delete_new_single_group_if_empty",
          ok: false,
          message: cleanupError?.message || String(cleanupError)
        });
      }
    }

    compensation.push({
      step: "sync_old_group_after_new_single_failure",
      result: await safeSyncGroupState(supabase, oldGroupId)
    });
    if (newGroupRef) {
      compensation.push({
        step: "sync_new_group_after_new_single_failure",
        result: await safeSyncGroupState(supabase, newGroupRef)
      });
    }

    error.compensation = compensation;
    throw error;
  }
}

async function transferRequestToExistingGroup(supabase, request, targetGroupId, times = {}, options = {}) {
  const { data: memberships, error: membershipError } = await supabase
    .from("transport_group_members")
    .select("id, group_id, request_id, passenger_count_snapshot, luggage_count_snapshot, is_initiator")
    .eq("request_id", request.id);

  if (membershipError) {
    throw membershipError;
  }
  if (!memberships || memberships.length === 0) {
    throw buildTransportLifecycleError("request is not in a group", 400);
  }
  if (memberships.length > 1) {
    throw buildTransportLifecycleError("request has multiple active group memberships; please inspect manually", 409);
  }

  const oldMembership = memberships[0];
  const oldGroupId = oldMembership.group_id;
  const validation = await validateRequestCanJoinGroup(supabase, request, targetGroupId, times, {
    currentGroupIds: [oldGroupId]
  });
  const newGroupId = validation.group_ref;
  const operatedAt = options.operatedAt || new Date().toISOString();
  const requestUpdatePayload = {
    last_operated_by: options.operatedBy || request.last_operated_by || null,
    last_operated_at: operatedAt
  };
  if (times.flight_datetime !== undefined) {
    requestUpdatePayload.flight_datetime = times.flight_datetime;
  }
  if (times.preferred_time_start !== undefined) {
    requestUpdatePayload.preferred_time_start = times.preferred_time_start;
  }
  const restorePayload = {
    flight_datetime: request.flight_datetime,
    preferred_time_start: request.preferred_time_start,
    last_operated_by: request.last_operated_by,
    last_operated_at: request.last_operated_at
  };

  let insertedTargetMembership = null;
  let oldMembershipDeleted = false;
  let requestUpdated = false;
  const compensation = [];

  try {
    const update = await supabase
      .from("transport_requests")
      .update(requestUpdatePayload)
      .eq("id", request.id);
    if (update.error) {
      throw update.error;
    }
    requestUpdated = true;

    const deleteOld = await supabase
      .from("transport_group_members")
      .delete()
      .eq("id", oldMembership.id);
    if (deleteOld.error) {
      throw deleteOld.error;
    }
    oldMembershipDeleted = true;

    insertedTargetMembership = await insertGroupMembership(supabase, {
      group_id: newGroupId,
      request_id: request.id,
      passenger_count_snapshot: request.passenger_count,
      luggage_count_snapshot: request.luggage_count,
      is_initiator: false
    });

    const oldGroup = await syncGroupState(supabase, oldGroupId, {
      emptyReason: options.emptyReason || "zero_members"
    });
    const newGroup = await syncGroupState(supabase, newGroupId);

    return {
      old_group_id: oldGroupId,
      new_group_id: getGroupDisplayId(validation.group, newGroupId),
      new_group_ref: newGroupId,
      old_group: oldGroup,
      new_group: newGroup,
      target_group: summarizeCandidateGroup(validation.group, validation.stats, validation.warnings),
      inserted_membership: insertedTargetMembership
    };
  } catch (error) {
    if (insertedTargetMembership?.id) {
      const cleanup = await supabase
        .from("transport_group_members")
        .delete()
        .eq("id", insertedTargetMembership.id);
      compensation.push({
        step: "delete_target_membership",
        ok: !cleanup.error,
        message: cleanup.error?.message || null
      });
    } else {
      const cleanup = await supabase
        .from("transport_group_members")
        .delete()
        .eq("group_id", newGroupId)
        .eq("request_id", request.id);
      compensation.push({
        step: "delete_target_membership_by_request",
        ok: !cleanup.error,
        message: cleanup.error?.message || null
      });
    }

    if (oldMembershipDeleted) {
      try {
        await insertGroupMembership(supabase, {
          group_id: oldGroupId,
          request_id: request.id,
          passenger_count_snapshot: oldMembership.passenger_count_snapshot,
          luggage_count_snapshot: oldMembership.luggage_count_snapshot,
          is_initiator: oldMembership.is_initiator !== false
        });
        compensation.push({ step: "restore_old_membership", ok: true, message: null });
      } catch (restoreError) {
        compensation.push({
          step: "restore_old_membership",
          ok: false,
          message: restoreError?.message || String(restoreError)
        });
      }
    }

    if (requestUpdated) {
      const restoreRequest = await supabase
        .from("transport_requests")
        .update(restorePayload)
        .eq("id", request.id);
      compensation.push({
        step: "restore_request_times",
        ok: !restoreRequest.error,
        message: restoreRequest.error?.message || null
      });
    }

    compensation.push({
      step: "sync_old_group",
      result: await safeSyncGroupState(supabase, oldGroupId)
    });
    compensation.push({
      step: "sync_target_group",
      result: await safeSyncGroupState(supabase, newGroupId)
    });

    error.compensation = compensation;
    throw error;
  }
}

async function removeRequestFromGroup(supabase, requestId, options = {}) {
  const { data: request, error: requestError } = await supabase
    .from("transport_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (requestError) {
    throw requestError;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("transport_group_members")
    .select("id, group_id")
    .eq("request_id", requestId);

  if (membershipError) {
    throw membershipError;
  }

  if (!memberships || !memberships.length) {
    return null;
  }

  const groupIds = memberships.map(item => item.group_id);
  const memberIds = memberships.map(item => item.id);
  const { error: deleteError } = await supabase
    .from("transport_group_members")
    .delete()
    .in("id", memberIds);

  if (deleteError) {
    throw deleteError;
  }

  if (options.closeRequest) {
    const { error: updateError } = await supabase
      .from("transport_requests")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_reason: options.closedReason || "admin_closed"
      })
      .eq("id", requestId);

    if (updateError) {
      throw updateError;
    }
  }

  const groups = [];
  for (const groupId of groupIds) {
    groups.push(await syncGroupState(supabase, groupId, {
      emptyReason: options.emptyReason || "zero_members"
    }));
  }

  const shouldCreateReplacementGroup = !options.closeRequest
    && options.regroup !== false
    && request.status !== "closed";

  let replacementGroup = null;
  if (shouldCreateReplacementGroup) {
    replacementGroup = await createGroupForRequest(supabase, request, {
      isInitiator: true
    });
  } else if (!options.closeRequest && options.regroup === false && request.status !== "closed") {
    const { error: requestUpdateError } = await supabase
      .from("transport_requests")
      .update({
        status: "published",
        closed_at: null,
        closed_reason: null
      })
      .eq("id", requestId);

    if (requestUpdateError) {
      throw requestUpdateError;
    }
  }

  return {
    affected_groups: groups,
    replacement_group: replacementGroup
  };
}

module.exports = {
  GROUP_STATUS,
  backfillMissingPickupGroups,
  createRequestRecord,
  createPickupRequestWithGroup,
  createGroupForRequest,
  getGroupByBusinessId,
  getGroupMembersWithRequests,
  syncGroupState,
  cleanupEmptyTransportGroups,
  deleteEmptyGroupIfEligible,
  addRequestToGroup,
  findTimeAdjustCandidateGroups,
  validateRequestCanJoinGroup,
  moveRequestToNewSingleGroupSafely,
  transferRequestToExistingGroup,
  removeRequestFromGroup
};
