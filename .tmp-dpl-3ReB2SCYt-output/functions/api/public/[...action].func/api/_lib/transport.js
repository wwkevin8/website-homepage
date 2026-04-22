const REQUEST_STATUSES = ["published", "matched", "closed"];
const GROUP_STATUSES = ["single_member", "active", "full", "closed", "cancelled"];
const SERVICE_TYPES = ["pickup", "dropoff"];
const MANUAL_CURRENT_PREFIX = "manual_current:";
const PUBLIC_REQUEST_STATUSES = ["published", "matched"];
const ACTIVE_PICKUP_REQUEST_STATUSES = ["published", "matched"];
const DEFAULT_GROUP_MAX_PASSENGERS = 5;

function deriveDisplayGroupId(sourceId, dateValue) {
  if (!sourceId) {
    return null;
  }
  if (String(sourceId).startsWith("GRP-")) {
    return String(sourceId);
  }
  const date = new Date(dateValue || Date.now());
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const suffix = String(sourceId).replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0");
  return `GRP-${yy}${mm}${dd}-${suffix}`;
}

function getIsoDatePart(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeGroupMembersRelation(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    return [value];
  }
  return [];
}

function normalizeSingleRelation(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  if (value && typeof value === "object") {
    return value;
  }
  return null;
}

function isIsoDateTime(value) {
  if (!value) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function normalizeNullableText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const next = String(value).trim();
  return next ? next : null;
}

function normalizeRequiredText(value, field) {
  const next = normalizeNullableText(value);
  if (!next) {
    throw new Error(`${field} is required`);
  }
  return next;
}

function parseManualCurrentPassengerCount(value) {
  const raw = normalizeNullableText(value);
  if (!raw || !raw.startsWith(MANUAL_CURRENT_PREFIX)) {
    return null;
  }
  const parsed = Number.parseInt(raw.slice(MANUAL_CURRENT_PREFIX.length), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function encodeManualCurrentPassengerCount(value) {
  const parsed = ensurePositiveInteger(value, "current_passenger_count", true);
  return `${MANUAL_CURRENT_PREFIX}${parsed}`;
}

function ensureEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function normalizeLegacyGroupStatus(value) {
  if (value === "open" || value === "draft") {
    return "single_member";
  }
  return value;
}

function ensurePositiveInteger(value, field, allowZero = false) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || (!allowZero && parsed <= 0) || (allowZero && parsed < 0)) {
    throw new Error(`${field} is invalid`);
  }
  return parsed;
}

function ensureDateTime(value, field, required = true) {
  if (!value && !required) {
    return null;
  }
  if (!isIsoDateTime(value)) {
    throw new Error(`${field} must be a valid datetime`);
  }
  return new Date(value).toISOString();
}

function ensureDate(value, field) {
  const next = normalizeRequiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) {
    throw new Error(`${field} must be a valid date`);
  }
  return next;
}

function validateTimeWindow(start, end) {
  if (start && end && new Date(start).getTime() > new Date(end).getTime()) {
    throw new Error("preferred_time_end must be later than preferred_time_start");
  }
}

function deriveGroupDate(groupDate, preferredTimeStart, flightTimeReference) {
  const sourceDate = preferredTimeStart
    ? getIsoDatePart(preferredTimeStart)
    : flightTimeReference
      ? getIsoDatePart(flightTimeReference)
      : null;

  if (!groupDate && sourceDate) {
    return sourceDate;
  }

  if (!groupDate && !sourceDate) {
    throw new Error("group_date is required when no datetime source is provided");
  }

  if (groupDate && sourceDate && groupDate !== sourceDate) {
    throw new Error("group_date must match preferred_time_start or flight_time_reference date");
  }

  return groupDate;
}

function mapRequestPayload(payload, existing = {}) {
  const requestedStatus = payload.status ?? existing.status ?? "published";

  const next = {
    service_type: ensureEnum(payload.service_type ?? existing.service_type, SERVICE_TYPES, "service_type"),
    student_name: normalizeRequiredText(payload.student_name ?? existing.student_name, "student_name"),
    email: normalizeNullableText(payload.email ?? existing.email),
    phone: normalizeNullableText(payload.phone ?? existing.phone),
    wechat: normalizeNullableText(payload.wechat ?? existing.wechat),
    passenger_count: ensurePositiveInteger(payload.passenger_count ?? existing.passenger_count, "passenger_count"),
    luggage_count: ensurePositiveInteger(payload.luggage_count ?? existing.luggage_count ?? 0, "luggage_count", true),
    airport_code: normalizeRequiredText(payload.airport_code ?? existing.airport_code, "airport_code"),
    airport_name: normalizeRequiredText(payload.airport_name ?? existing.airport_name, "airport_name"),
    terminal: normalizeNullableText(payload.terminal ?? existing.terminal),
    flight_no: normalizeNullableText(payload.flight_no ?? existing.flight_no),
    flight_datetime: ensureDateTime(payload.flight_datetime ?? existing.flight_datetime, "flight_datetime"),
    location_from: normalizeRequiredText(payload.location_from ?? existing.location_from, "location_from"),
    location_to: normalizeRequiredText(payload.location_to ?? existing.location_to, "location_to"),
    preferred_time_start: ensureDateTime(payload.preferred_time_start ?? existing.preferred_time_start, "preferred_time_start", false),
    preferred_time_end: ensureDateTime(payload.preferred_time_end ?? existing.preferred_time_end, "preferred_time_end", false),
    shareable: payload.shareable ?? existing.shareable ?? true,
    status: ensureEnum(requestedStatus, REQUEST_STATUSES, "status"),
    notes: normalizeNullableText(payload.notes ?? existing.notes),
    admin_note: normalizeNullableText(payload.admin_note ?? existing.admin_note),
    closed_reason: normalizeNullableText(payload.closed_reason ?? existing.closed_reason),
    closed_at: payload.closed_at === undefined
      ? existing.closed_at ?? null
      : ensureDateTime(payload.closed_at, "closed_at", false)
  };

  validateTimeWindow(next.preferred_time_start, next.preferred_time_end);
  return next;
}

function mapGroupPayload(payload, existing = {}) {
  const preferredTimeStart = ensureDateTime(payload.preferred_time_start ?? existing.preferred_time_start, "preferred_time_start", false);
  const preferredTimeEnd = ensureDateTime(payload.preferred_time_end ?? existing.preferred_time_end, "preferred_time_end", false);
  const flightTimeReference = ensureDateTime(payload.flight_time_reference ?? existing.flight_time_reference, "flight_time_reference", false);
  const normalizedGroupDateInput = payload.group_date ?? existing.group_date ?? null;
  const normalizedGroupDate = normalizedGroupDateInput ? ensureDate(normalizedGroupDateInput, "group_date") : null;

  const manualCurrentPassengerCount = ensurePositiveInteger(
    payload.current_passenger_count ?? parseManualCurrentPassengerCount(existing.vehicle_type) ?? 0,
    "current_passenger_count",
    true
  );

  const next = {
    service_type: ensureEnum(payload.service_type ?? existing.service_type, SERVICE_TYPES, "service_type"),
    group_date: deriveGroupDate(normalizedGroupDate, preferredTimeStart, flightTimeReference),
    airport_code: normalizeRequiredText(payload.airport_code ?? existing.airport_code, "airport_code"),
    airport_name: normalizeRequiredText(payload.airport_name ?? existing.airport_name, "airport_name"),
    terminal: normalizeNullableText(payload.terminal ?? existing.terminal),
    location_from: normalizeRequiredText(payload.location_from ?? existing.location_from, "location_from"),
    location_to: normalizeRequiredText(payload.location_to ?? existing.location_to, "location_to"),
    flight_time_reference: flightTimeReference,
    preferred_time_start: preferredTimeStart,
    preferred_time_end: preferredTimeEnd,
    vehicle_type: encodeManualCurrentPassengerCount(manualCurrentPassengerCount),
    max_passengers: ensurePositiveInteger(payload.max_passengers ?? existing.max_passengers, "max_passengers"),
    visible_on_frontend: payload.visible_on_frontend ?? existing.visible_on_frontend ?? false,
    status: ensureEnum(normalizeLegacyGroupStatus(payload.status ?? existing.status ?? "single_member"), GROUP_STATUSES, "status"),
    notes: normalizeNullableText(payload.notes ?? existing.notes)
  };

  validateTimeWindow(next.preferred_time_start, next.preferred_time_end);
  return next;
}

function applyEffectiveGroupCounts(record) {
  if (!record) {
    return record;
  }

  const manualCurrentPassengerCount = parseManualCurrentPassengerCount(record.vehicle_type);
  const currentPassengerCount = manualCurrentPassengerCount ?? Number(record.current_passenger_count || 0);
  const maxPassengers = Number(record.max_passengers || 0);

  let normalizedStatus = record.status;
  if (record.status === "open" || record.status === "draft") {
    if (currentPassengerCount >= maxPassengers && maxPassengers > 0) {
      normalizedStatus = "full";
    } else if (Number(record.member_request_count || 0) >= 2 || currentPassengerCount >= 2) {
      normalizedStatus = "active";
    } else {
      normalizedStatus = "single_member";
    }
  }

  return {
    ...record,
    group_id: record.group_id || deriveDisplayGroupId(record.id, record.group_date || record.flight_time_reference || record.preferred_time_start),
    group_ref: record.id,
    status: normalizedStatus,
    current_passenger_count: currentPassengerCount,
    remaining_passenger_count: Math.max(maxPassengers - currentPassengerCount, 0),
    manual_current_passenger_count: manualCurrentPassengerCount
  };
}

function applyRequestFilters(query, reqQuery) {
  if (reqQuery.order_no) {
    query.eq("order_no", String(reqQuery.order_no).trim().toUpperCase());
  }
  if (reqQuery.service_type) {
    query.eq("service_type", reqQuery.service_type);
  }
  if (reqQuery.airport_code) {
    query.eq("airport_code", reqQuery.airport_code);
  } else if (reqQuery.airport_name) {
    query.eq("airport_name", reqQuery.airport_name);
  }
  if (reqQuery.status === "active") {
    query.in("status", ACTIVE_PICKUP_REQUEST_STATUSES);
  } else if (reqQuery.status === "expired") {
    query.eq("status", "closed");
  } else if (reqQuery.status) {
    query.eq("status", reqQuery.status);
  }
  if (reqQuery.date_from) {
    query.gte("flight_datetime", `${reqQuery.date_from}T00:00:00.000Z`);
  }
  if (reqQuery.date_to) {
    query.lte("flight_datetime", `${reqQuery.date_to}T23:59:59.999Z`);
  }
}

function applyGroupFilters(query, reqQuery) {
  if (reqQuery.service_type) {
    query.eq("service_type", reqQuery.service_type);
  }
  if (reqQuery.airport_code) {
    query.eq("airport_code", reqQuery.airport_code);
  } else if (reqQuery.airport_name) {
    query.eq("airport_name", reqQuery.airport_name);
  }
  if (reqQuery.status === "active") {
    query.in("status", ["single_member", "active", "full"]);
  } else if (reqQuery.status === "closed") {
    query.in("status", ["closed", "cancelled"]);
  } else if (reqQuery.status) {
    query.eq("status", reqQuery.status);
  }
  if (reqQuery.visible_on_frontend !== undefined && reqQuery.visible_on_frontend !== "") {
    query.eq("visible_on_frontend", reqQuery.visible_on_frontend === "true");
  }
  if (reqQuery.date_from) {
    query.gte("group_date", reqQuery.date_from);
  }
  if (reqQuery.date_to) {
    query.lte("group_date", reqQuery.date_to);
  }
}

async function getGroupPassengerCount(supabase, groupId) {
  const { data, error } = await supabase
    .from("transport_group_members")
    .select("passenger_count_snapshot")
    .eq("group_id", groupId);

  if (error) {
    throw error;
  }

  return (data || []).reduce((sum, item) => sum + (item.passenger_count_snapshot || 0), 0);
}

function deriveRequestFlags(request) {
  const members = normalizeGroupMembersRelation(request.transport_group_members);
  const siteUser = normalizeSingleRelation(request.site_users);
  const isGrouped = members.length > 0;
  const rawGroupId = members[0]?.group_id || null;
  const displayGroupId = deriveDisplayGroupId(rawGroupId, request.flight_datetime || request.business_date || request.created_at);
  return {
    ...request,
    transport_group_members: members,
    is_grouped: isGrouped,
    effective_status: request.status,
    student_email: request.email || siteUser?.email || null,
    group_ref: rawGroupId,
    group_id: displayGroupId,
    is_initiator: Boolean(members[0]?.is_initiator)
  };
}

function resolveRequestServiceStatus(request, group) {
  if (request?.status === "closed") {
    return "closed";
  }

  const referenceTime = request?.flight_datetime || group?.preferred_time_start || group?.flight_time_reference || null;
  if (referenceTime) {
    const reference = new Date(referenceTime);
    if (!Number.isNaN(reference.getTime()) && Date.now() >= reference.getTime()) {
      return "closed";
    }
  }
  return request?.status || "published";
}

function resolveRequestMatchingStatus(isGrouped, isSourceOrder) {
  return isGrouped || isSourceOrder ? "matched" : "unmatched";
}

function deriveRequestDisplayFlags(request, options = {}) {
  const members = normalizeGroupMembersRelation(request.transport_group_members);
  const siteUser = normalizeSingleRelation(request.site_users);
  const isGrouped = members.length > 0;
  const group = options.group || null;
  const isSourceOrder = Boolean(options.isSourceOrder);
  const rawGroupId = group?.group_ref || group?.group_id || members[0]?.group_id || null;
  const displayGroupId = group?.group_id || deriveDisplayGroupId(rawGroupId, request.flight_datetime || request.business_date || request.created_at);
  return {
    ...request,
    transport_group_members: members,
    is_grouped: isGrouped,
    effective_status: request.status,
    student_email: request.email || siteUser?.email || null,
    service_status_code: resolveRequestServiceStatus(request, group),
    matching_status_code: request?.status === "matched" ? "matched" : resolveRequestMatchingStatus(isGrouped, isSourceOrder),
    matched_group_id: displayGroupId,
    group_id: displayGroupId,
    group_ref: rawGroupId,
    is_initiator: Boolean(members[0]?.is_initiator)
  };
}

async function closeExpiredRequests(supabase) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("transport_requests")
    .update({
      status: "closed",
      closed_reason: "expired",
      closed_at: nowIso
    })
    .in("status", ACTIVE_PICKUP_REQUEST_STATUSES)
    .lte("flight_datetime", nowIso)
    .select("id");

  if (error) {
    throw error;
  }

  return data || [];
}

async function syncGroupStatus(supabase, groupId) {
  const { syncGroupState } = require("./transport-group-lifecycle");
  return syncGroupState(supabase, groupId);
}

module.exports = {
  REQUEST_STATUSES,
  PUBLIC_REQUEST_STATUSES,
  ACTIVE_PICKUP_REQUEST_STATUSES,
  GROUP_STATUSES,
  SERVICE_TYPES,
  DEFAULT_GROUP_MAX_PASSENGERS,
  mapRequestPayload,
  mapGroupPayload,
  applyEffectiveGroupCounts,
  applyRequestFilters,
  applyGroupFilters,
  syncGroupStatus,
  closeExpiredRequests,
  getGroupPassengerCount,
  deriveRequestFlags,
  deriveRequestDisplayFlags,
  deriveDisplayGroupId,
  normalizeGroupMembersRelation,
  MAX_REQUEST_STATUS: REQUEST_STATUSES
};
