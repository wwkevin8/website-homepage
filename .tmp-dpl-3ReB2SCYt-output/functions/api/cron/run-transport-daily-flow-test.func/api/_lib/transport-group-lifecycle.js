const { allocateOrderNumber, allocateGroupId } = require("./order-numbers");
const { DEFAULT_GROUP_MAX_PASSENGERS } = require("./transport");

const GROUP_STATUS = {
  SINGLE_MEMBER: "single_member",
  ACTIVE: "active",
  FULL: "full",
  CLOSED: "closed",
  CANCELLED: "cancelled"
};

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

function normalizeGroupRecord(group, requestLike) {
  if (!group) {
    return group;
  }
  const ref = group.group_id || group.id;
  return {
    ...group,
    group_ref: group.id || group.group_id,
    group_id: group.group_id || deriveDisplayGroupId(ref, group.group_date || requestLike?.flight_datetime || requestLike?.created_at),
    status: group.status
  };
}

function getIsoDatePart(value) {
  return new Date(value).toISOString().slice(0, 10);
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
        status: request.status === "closed" ? "closed" : "open",
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

  const memberPayload = {
    group_id: groupRef,
    request_id: request.id,
    passenger_count_snapshot: request.passenger_count,
    luggage_count_snapshot: request.luggage_count,
    is_initiator: options.isInitiator !== false
  };

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
      throw legacyMemberInsert.error;
    }
  } else if (memberInsert.error) {
    throw memberInsert.error;
  }

  return normalizeGroupRecord(group, request);
}

async function backfillMissingPickupGroups(supabase, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200;
  const { data: requests, error } = await supabase
    .from("transport_requests")
    .select("*, transport_group_members(request_id)")
    .eq("service_type", "pickup")
    .is("transport_group_members", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  const createdGroups = [];
  for (const request of requests || []) {
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

function getActiveMembers(members) {
  return (members || []).filter(member => member.transport_requests && member.transport_requests.status !== "closed");
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

async function syncGroupState(supabase, groupId) {
  const group = await getGroupByBusinessId(supabase, groupId);
  if ([GROUP_STATUS.CLOSED, GROUP_STATUS.CANCELLED].includes(group.status)) {
    return group;
  }

  const members = await getGroupMembersWithRequests(supabase, groupId);
  if (!members.length) {
    const { error } = await supabase
      .from("transport_groups")
      .delete()
      .eq("id", group.group_ref || group.id);

    if (error) {
      throw error;
    }

    return {
      ...group,
      deleted: true,
      status: GROUP_STATUS.CLOSED,
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
      status: nextStatus === GROUP_STATUS.CLOSED
        ? "closed"
        : nextStatus === GROUP_STATUS.FULL
          ? "full"
          : "open"
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
    groups.push(await syncGroupState(supabase, groupId));
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
  addRequestToGroup,
  removeRequestFromGroup
};
