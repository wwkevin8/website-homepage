const REQUEST_STATUSES = ["draft", "open", "grouped", "closed", "cancelled"];
const GROUP_STATUSES = ["draft", "open", "full", "closed", "cancelled"];
const SERVICE_TYPES = ["pickup", "dropoff"];

function getIsoDatePart(value) {
  return new Date(value).toISOString().slice(0, 10);
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

function ensureEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new Error(`${field} is invalid`);
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
  const requestedStatus = payload.status ?? existing.status ?? "draft";
  if (requestedStatus === "grouped") {
    throw new Error("status grouped can only be set by group assignment");
  }

  const next = {
    service_type: ensureEnum(payload.service_type ?? existing.service_type, SERVICE_TYPES, "service_type"),
    student_name: normalizeRequiredText(payload.student_name ?? existing.student_name, "student_name"),
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
    notes: normalizeNullableText(payload.notes ?? existing.notes)
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
    vehicle_type: normalizeNullableText(payload.vehicle_type ?? existing.vehicle_type),
    max_passengers: ensurePositiveInteger(payload.max_passengers ?? existing.max_passengers, "max_passengers"),
    visible_on_frontend: payload.visible_on_frontend ?? existing.visible_on_frontend ?? false,
    status: ensureEnum(payload.status ?? existing.status ?? "draft", GROUP_STATUSES, "status"),
    notes: normalizeNullableText(payload.notes ?? existing.notes)
  };

  validateTimeWindow(next.preferred_time_start, next.preferred_time_end);
  return next;
}

function applyRequestFilters(query, reqQuery) {
  if (reqQuery.service_type) {
    query.eq("service_type", reqQuery.service_type);
  }
  if (reqQuery.airport_code) {
    query.eq("airport_code", reqQuery.airport_code);
  } else if (reqQuery.airport_name) {
    query.eq("airport_name", reqQuery.airport_name);
  }
  if (reqQuery.status) {
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
  if (reqQuery.status) {
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
  const isGrouped = Array.isArray(request.transport_group_members) && request.transport_group_members.length > 0;
  return {
    ...request,
    is_grouped: isGrouped,
    effective_status: isGrouped ? "grouped" : request.status
  };
}

async function syncGroupStatus(supabase, groupId) {
  const { data: group, error: groupError } = await supabase
    .from("transport_groups")
    .select("id, status, max_passengers")
    .eq("id", groupId)
    .single();

  if (groupError) {
    throw groupError;
  }

  if (["closed", "cancelled"].includes(group.status)) {
    return group;
  }

  const currentPassengerCount = await getGroupPassengerCount(supabase, groupId);
  const nextStatus = currentPassengerCount >= group.max_passengers ? "full" : "open";

  const { data, error } = await supabase
    .from("transport_groups")
    .update({ status: nextStatus })
    .eq("id", groupId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  REQUEST_STATUSES,
  GROUP_STATUSES,
  SERVICE_TYPES,
  mapRequestPayload,
  mapGroupPayload,
  applyRequestFilters,
  applyGroupFilters,
  syncGroupStatus,
  getGroupPassengerCount,
  deriveRequestFlags,
  MAX_REQUEST_STATUS: REQUEST_STATUSES
};
