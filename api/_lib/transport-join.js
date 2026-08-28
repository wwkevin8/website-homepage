const { mapRequestPayload, DEFAULT_GROUP_MAX_PASSENGERS } = require("./transport");

function getMinutesDifference(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

function getIsoDatePart(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function getDateDistanceDays(a, b) {
  const left = new Date(`${a}T00:00:00.000Z`);
  const right = new Date(`${b}T00:00:00.000Z`);
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) {
    return null;
  }
  return Math.abs(left.getTime() - right.getTime()) / (24 * 60 * 60 * 1000);
}

function buildTimeWarning(code, message, context = {}) {
  return {
    code,
    message,
    risk_confirmed: true,
    ...context
  };
}

function normalizeCity(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLocation(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[閿?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function locationsMatch(a, b) {
  const left = normalizeLocation(a);
  const right = normalizeLocation(b);
  if (!left || !right) {
    return false;
  }
  return left === right || left.includes(right) || right.includes(left);
}

function getEffectivePickupTime(source) {
  return source?.flight_datetime || null;
}

function buildJoinDraft(body, siteUser) {
  const serviceType = body.service_type === "dropoff" ? "dropoff" : "pickup";
  return mapRequestPayload({
    service_type: serviceType,
    student_name: body.student_name || siteUser.nickname,
    email: body.email || siteUser.email,
    phone: body.phone || siteUser.phone,
    wechat: body.wechat || siteUser.wechat_id,
    passenger_count: body.passenger_count,
    luggage_count: body.luggage_count,
    airport_code: body.airport_code,
    airport_name: body.airport_name,
    terminal: body.terminal,
    flight_no: body.flight_no,
    flight_datetime: body.flight_datetime,
    location_from: body.location_from || (serviceType === "dropoff" ? "" : body.airport_name || body.airport_code),
    location_to: body.location_to || (serviceType === "dropoff" ? body.airport_name || body.airport_code : ""),
    shareable: true,
    status: "published",
    notes: body.notes || null
  });
}

function buildJoinResult({
  joinable,
  reason,
  errorCode = null,
  surchargeGbp,
  currentPassengerCount,
  nextPassengerCount,
  sameAirport,
  sameTerminal,
  sameDate,
  withinTimeWindow,
  group,
  warnings = [],
  timeDistanceMinutes = null,
  targetGroupTime = null,
  orderTime = null
}) {
  const maxPassengers = Number(group?.max_passengers || 0);
  return {
    joinable,
    reason,
    errorCode,
    surchargeGbp,
    currentPassengerCount,
    maxPassengerCount: maxPassengers,
    remainingPassengerCount: Math.max(maxPassengers - currentPassengerCount, 0),
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    warnings,
    timeDistanceMinutes,
    targetGroupTime,
    orderTime,
    groupId: group.group_id
  };
}

function evaluateJoin({ targetRequest, group, activeMembers, joinPayload, activeFutureRequests = [] }) {
  const currentPassengerCount = activeMembers.reduce((sum, item) => sum + Number(item.transport_requests?.passenger_count || 0), 0);
  const nextPassengerCount = currentPassengerCount + Number(joinPayload.passenger_count || 0);
  const sameServiceType = String(targetRequest.service_type || "").trim() === String(joinPayload.service_type || "").trim();
  const sameAirport = String(targetRequest.airport_code || "").trim().toUpperCase() === String(joinPayload.airport_code || "").trim().toUpperCase();
  const sameTerminal = String(targetRequest.terminal || "").trim().toUpperCase() === String(joinPayload.terminal || "").trim().toUpperCase();
  const targetPickupTime = getEffectivePickupTime(targetRequest);
  const joinPickupTime = getEffectivePickupTime(joinPayload);
  const effectiveTargetDate = targetPickupTime || targetRequest.flight_datetime;
  const effectiveJoinDate = joinPickupTime || joinPayload.flight_datetime;
  const sameDate = getIsoDatePart(effectiveTargetDate) === getIsoDatePart(effectiveJoinDate);
  const joinWindowMinutes = 240;
  const timeDistanceMinutes = getMinutesDifference(effectiveTargetDate, effectiveJoinDate);
  const withinTimeWindow = timeDistanceMinutes <= joinWindowMinutes;
  const allowCrossMidnightDateMismatch = false;
  const warnings = [];
  const sameTypeRequests = (activeFutureRequests || []).filter(item => item.service_type === joinPayload.service_type);
  const earliestSameTypeRequest = sameTypeRequests[0] || null;
  const nextFlightTime = new Date(joinPayload.flight_datetime).getTime();
  const earliestSameTypeFlightTime = earliestSameTypeRequest ? new Date(earliestSameTypeRequest.flight_datetime).getTime() : NaN;

  let joinable = true;
  let reason = "";
  let surchargeGbp = 0;

  if (!sameServiceType) {
    joinable = false;
    reason = "服务类型不同，无法加入当前拼车组。";
  } else if (!sameAirport) {
    joinable = false;
    reason = "机场不同，无法加入当前拼车组。";
  } else if (!sameDate) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机日期不同，无法拼车。" : "接机日期不同，无法拼车。";
  } else if (!withinTimeWindow) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机时间差超过 3 小时，无法拼车。" : "接机时间差超过 3 小时，无法拼车。";
  } else if (!["published", "matched"].includes(targetRequest.status)) {
    joinable = false;
    reason = "当前拼车组状态不可加入。";
  } else if (!targetRequest.shareable) {
    joinable = false;
    reason = "当前拼车组不接受拼车。";
  } else if (new Date(targetRequest.flight_datetime).getTime() <= Date.now()) {
    joinable = false;
    reason = "当前拼车组已过期。";
  } else if ((activeFutureRequests || []).length >= 3) {
    joinable = false;
    reason = "当前账号最多只能保留 3 张未来有效订单。";
  } else if (earliestSameTypeRequest && !Number.isNaN(nextFlightTime) && !Number.isNaN(earliestSameTypeFlightTime) && nextFlightTime < earliestSameTypeFlightTime) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "新送机单时间不能早于当前最早送机单。" : "新接机单时间不能早于当前最早接机单。";
  } else if (nextPassengerCount > DEFAULT_GROUP_MAX_PASSENGERS) {
    joinable = false;
    reason = `加入后总人数将超过 ${DEFAULT_GROUP_MAX_PASSENGERS} 人。`;
  }

  if (joinable && !sameTerminal) {
    surchargeGbp = Number(joinPayload.passenger_count || 0) * 15;
  }

  if (false && joinable && !withinTimeWindow) {
    warnings.push(buildTimeWarning(
      "large_time_gap",
      "该订单时间与目标拼车组时间相差较大，请确认是否仍要加入。",
      {
        operation_type: "前台加入",
        threshold_minutes: joinWindowMinutes,
        time_distance_minutes: Math.round(timeDistanceMinutes),
        order_time: effectiveJoinDate,
        target_group_time: effectiveTargetDate
      }
    ));
  }

  if (false && joinable && allowCrossMidnightDateMismatch) {
    warnings.push(buildTimeWarning(
      "cross_midnight_date_mismatch",
      "该订单与目标拼车组跨午夜但实际时间差较近，请确认日期与时间后再加入。",
      {
        operation_type: "前台加入",
        threshold_minutes: joinWindowMinutes,
        time_distance_minutes: Math.round(timeDistanceMinutes),
        order_time: effectiveJoinDate,
        target_group_time: effectiveTargetDate
      }
    ));
  }

  return buildJoinResult({
    joinable,
    reason,
    surchargeGbp,
    currentPassengerCount,
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    group,
    warnings,
    timeDistanceMinutes: Math.round(timeDistanceMinutes),
    targetGroupTime: effectiveTargetDate,
    orderTime: effectiveJoinDate
  });
}

function evaluateJoinByPickupTime({ targetRequest, group, activeMembers, joinPayload, activeFutureRequests = [] }) {
  const currentPassengerCount = activeMembers.reduce((sum, item) => sum + Number(item.transport_requests?.passenger_count || 0), 0);
  const nextPassengerCount = currentPassengerCount + Number(joinPayload.passenger_count || 0);
  const sameServiceType = String(targetRequest.service_type || "").trim() === String(joinPayload.service_type || "").trim();
  const sameAirport = String(targetRequest.airport_code || "").trim().toUpperCase() === String(joinPayload.airport_code || "").trim().toUpperCase();
  const sameTerminal = String(targetRequest.terminal || "").trim().toUpperCase() === String(joinPayload.terminal || "").trim().toUpperCase();
  const targetPickupTime = getEffectivePickupTime(targetRequest);
  const joinPickupTime = getEffectivePickupTime(joinPayload);
  const effectiveTargetDate = targetPickupTime || targetRequest.flight_datetime;
  const effectiveJoinDate = joinPickupTime || joinPayload.flight_datetime;
  const sameDate = getIsoDatePart(effectiveTargetDate) === getIsoDatePart(effectiveJoinDate);
  const withinTimeWindow = getMinutesDifference(effectiveTargetDate, effectiveJoinDate) <= 240;
  const sameCity = joinPayload.service_type === "dropoff"
    ? normalizeCity(targetRequest.location_from) === normalizeCity(joinPayload.location_from)
    : normalizeCity(targetRequest.location_to) === normalizeCity(joinPayload.location_to);
  const sameTypeRequests = (activeFutureRequests || []).filter(item => item.service_type === joinPayload.service_type);
  const earliestSameTypeRequest = sameTypeRequests[0] || null;
  const nextFlightTime = new Date(joinPayload.flight_datetime).getTime();
  const earliestSameTypeFlightTime = earliestSameTypeRequest ? new Date(earliestSameTypeRequest.flight_datetime).getTime() : NaN;

  let joinable = true;
  let reason = "";
  let surchargeGbp = 0;

  if (!sameServiceType) {
    joinable = false;
    reason = "服务类型不同，无法加入当前拼车组。";
  } else if (!sameAirport) {
    joinable = false;
    reason = "机场不同，无法加入当前拼车组。";
  } else if (!sameCity) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "出发城市不同，无法拼车。" : "目的地城市不同，无法拼车。";
  } else if (!sameDate) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机日期不同，无法拼车。" : "接机日期不同，无法拼车。";
  } else if (!withinTimeWindow) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机时间差超过 4 小时，无法拼车。" : "接机时间差超过 4 小时，无法拼车。";
  } else if (!["published", "matched"].includes(targetRequest.status)) {
    joinable = false;
    reason = "当前拼车组状态不可加入。";
  } else if (!targetRequest.shareable) {
    joinable = false;
    reason = "当前拼车组不接受拼车。";
  } else if (new Date(targetRequest.flight_datetime).getTime() <= Date.now()) {
    joinable = false;
    reason = "当前拼车组已过期。";
  } else if ((activeFutureRequests || []).length >= 3) {
    joinable = false;
    reason = "当前账号最多只能保留 3 张未来有效订单。";
  } else if (earliestSameTypeRequest && !Number.isNaN(nextFlightTime) && !Number.isNaN(earliestSameTypeFlightTime) && nextFlightTime < earliestSameTypeFlightTime) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "新送机单时间不能早于当前最早送机单。" : "新接机单时间不能早于当前最早接机单。";
  } else if (nextPassengerCount > DEFAULT_GROUP_MAX_PASSENGERS) {
    joinable = false;
    reason = `加入后总人数将超过 ${DEFAULT_GROUP_MAX_PASSENGERS} 人。`;
  }

  if (joinable && !sameTerminal) {
    surchargeGbp = Number(joinPayload.passenger_count || 0) * 15;
  }

  return buildJoinResult({
    joinable,
    reason,
    surchargeGbp,
    currentPassengerCount,
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    group
  });
}

function evaluateJoinFinal({ targetRequest, group, activeMembers, joinPayload, activeFutureRequests = [] }) {
  const currentPassengerCount = activeMembers.reduce((sum, item) => sum + Number(item.transport_requests?.passenger_count || 0), 0);
  const nextPassengerCount = currentPassengerCount + Number(joinPayload.passenger_count || 0);
  const sameServiceType = String(targetRequest.service_type || "").trim() === String(joinPayload.service_type || "").trim();
  const sameAirport = String(targetRequest.airport_code || "").trim().toUpperCase() === String(joinPayload.airport_code || "").trim().toUpperCase();
  const sameTerminal = String(targetRequest.terminal || "").trim().toUpperCase() === String(joinPayload.terminal || "").trim().toUpperCase();
  const targetPickupTime = getEffectivePickupTime(targetRequest);
  const joinPickupTime = getEffectivePickupTime(joinPayload);
  const effectiveTargetDate = targetPickupTime || targetRequest.flight_datetime;
  const effectiveJoinDate = joinPickupTime || joinPayload.flight_datetime;
  const sameDate = getIsoDatePart(effectiveTargetDate) === getIsoDatePart(effectiveJoinDate);
  const withinTimeWindow = getMinutesDifference(effectiveTargetDate, effectiveJoinDate) <= 240;

  let joinable = true;
  let reason = "";
  let surchargeGbp = 0;

  if (!sameServiceType) {
    joinable = false;
    reason = "服务类型不同，无法加入当前拼车组。";
  } else if (!sameAirport) {
    joinable = false;
    reason = "机场不同，无法加入当前拼车组。";
  } else if (!sameDate) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机日期不同，无法拼车。" : "接机日期不同，无法拼车。";
  } else if (!withinTimeWindow) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机时间差超过 4 小时，无法拼车。" : "接机时间差超过 4 小时，无法拼车。";
  } else if (!["published", "matched"].includes(targetRequest.status)) {
    joinable = false;
    reason = "当前拼车组状态不可加入。";
  } else if (!targetRequest.shareable) {
    joinable = false;
    reason = "当前拼车组不接受拼车。";
  } else if (new Date(targetRequest.flight_datetime).getTime() <= Date.now()) {
    joinable = false;
    reason = "当前拼车组已过期。";
  } else if ((activeFutureRequests || []).length >= 3) {
    joinable = false;
    reason = "当前账号最多只能保留 3 张未来有效订单。";
  } else if (nextPassengerCount > DEFAULT_GROUP_MAX_PASSENGERS) {
    joinable = false;
    reason = `加入后总人数将超过 ${DEFAULT_GROUP_MAX_PASSENGERS} 人。`;
  }

  if (joinable && !sameTerminal) {
    surchargeGbp = Number(joinPayload.passenger_count || 0) * 15;
  }

  return buildJoinResult({
    joinable,
    reason,
    surchargeGbp,
    currentPassengerCount,
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    group
  });
}

function evaluateJoinStrict({ targetRequest, group, activeMembers, joinPayload, activeFutureRequests = [] }) {
  const currentPassengerCount = activeMembers.reduce((sum, item) => sum + Number(item.transport_requests?.passenger_count || 0), 0);
  const nextPassengerCount = currentPassengerCount + Number(joinPayload.passenger_count || 0);
  const sameServiceType = String(targetRequest.service_type || "").trim() === String(joinPayload.service_type || "").trim();
  const sameAirport = String(targetRequest.airport_code || "").trim().toUpperCase() === String(joinPayload.airport_code || "").trim().toUpperCase();
  const sameTerminal = String(targetRequest.terminal || "").trim().toUpperCase() === String(joinPayload.terminal || "").trim().toUpperCase();
  const targetPickupTime = getEffectivePickupTime(targetRequest);
  const joinPickupTime = getEffectivePickupTime(joinPayload);
  const effectiveTargetDate = targetPickupTime || targetRequest.flight_datetime;
  const effectiveJoinDate = joinPickupTime || joinPayload.flight_datetime;
  const sameDate = getIsoDatePart(effectiveTargetDate) === getIsoDatePart(effectiveJoinDate);
  const withinTimeWindow = getMinutesDifference(effectiveTargetDate, effectiveJoinDate) <= 240;
  const sameTypeRequest = (activeFutureRequests || []).find(item => item.service_type === joinPayload.service_type);

  let joinable = true;
  let reason = "";
  let surchargeGbp = 0;

  if (!sameServiceType) {
    joinable = false;
    reason = "服务类型不同，无法加入当前拼车组。";
  } else if (!sameAirport) {
    joinable = false;
    reason = "机场不同，无法加入当前拼车组。";
  } else if (!sameDate) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机日期不同，无法拼车。" : "接机日期不同，无法拼车。";
  } else if (!withinTimeWindow) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机时间差超过 4 小时，无法拼车。" : "接机时间差超过 4 小时，无法拼车。";
  } else if (!["published", "matched"].includes(targetRequest.status)) {
    joinable = false;
    reason = "当前拼车组状态不可加入。";
  } else if (!targetRequest.shareable) {
    joinable = false;
    reason = "当前拼车组不接受拼车。";
  } else if (new Date(targetRequest.flight_datetime).getTime() <= Date.now()) {
    joinable = false;
    reason = "当前拼车组已过期。";
  } else if (sameTypeRequest) {
    joinable = false;
    reason = `当前账号已存在一张未来有效${joinPayload.service_type === "dropoff" ? "送机" : "接机"}单（${sameTypeRequest.order_no}），同一账号同类服务一次只保留一张有效单。`;
  } else if (nextPassengerCount > DEFAULT_GROUP_MAX_PASSENGERS) {
    joinable = false;
    reason = `加入后总人数将超过 ${DEFAULT_GROUP_MAX_PASSENGERS} 人。`;
  }

  if (joinable && !sameTerminal) {
    surchargeGbp = Number(joinPayload.passenger_count || 0) * 15;
  }

  return buildJoinResult({
    joinable,
    reason,
    surchargeGbp,
    currentPassengerCount,
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    group
  });
}

function getStrictJoinWindowMinutes(serviceType) {
  return serviceType === "dropoff" ? 360 : 240;
}

function evaluateJoinWindowAware({ targetRequest, group, activeMembers, joinPayload, activeFutureRequests = [] }) {
  const currentPassengerCount = activeMembers.reduce((sum, item) => sum + Number(item.transport_requests?.passenger_count || 0), 0);
  const nextPassengerCount = currentPassengerCount + Number(joinPayload.passenger_count || 0);
  const sameServiceType = String(targetRequest.service_type || "").trim() === String(joinPayload.service_type || "").trim();
  const sameAirport = String(targetRequest.airport_code || "").trim().toUpperCase() === String(joinPayload.airport_code || "").trim().toUpperCase();
  const sameTerminal = String(targetRequest.terminal || "").trim().toUpperCase() === String(joinPayload.terminal || "").trim().toUpperCase();
  const targetPickupTime = getEffectivePickupTime(targetRequest);
  const joinPickupTime = getEffectivePickupTime(joinPayload);
  const effectiveTargetDate = targetPickupTime || targetRequest.flight_datetime;
  const effectiveJoinDate = joinPickupTime || joinPayload.flight_datetime;
  const targetDatePart = getIsoDatePart(effectiveTargetDate);
  const joinDatePart = getIsoDatePart(effectiveJoinDate);
  const sameDate = targetDatePart === joinDatePart;
  const joinWindowMinutes = getStrictJoinWindowMinutes(joinPayload.service_type);
  const timeDistanceMinutes = getMinutesDifference(effectiveTargetDate, effectiveJoinDate);
  const withinTimeWindow = timeDistanceMinutes <= joinWindowMinutes;
  const adjacentDateDistance = getDateDistanceDays(targetDatePart, joinDatePart);
  const allowCrossMidnightDateMismatch = !sameDate
    && adjacentDateDistance === 1
    && withinTimeWindow;
  const sameTypeRequest = (activeFutureRequests || []).find(item => item.service_type === joinPayload.service_type);

  let joinable = true;
  let reason = "";
  let surchargeGbp = 0;
  const warnings = [];

  if (!sameServiceType) {
    joinable = false;
    reason = "服务类型不同，无法加入当前拼车组。";
  } else if (!sameAirport) {
    joinable = false;
    reason = "机场不同，无法加入当前拼车组。";
  } else if (!sameDate && !allowCrossMidnightDateMismatch) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机日期不同，无法拼车。" : "接机日期不同，无法拼车。";
  } else if (false && !withinTimeWindow) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机时间差超过 6 小时，无法拼车。" : "接机时间差超过 4 小时，无法拼车。";
  } else if (!["published", "matched"].includes(targetRequest.status)) {
    joinable = false;
    reason = "当前拼车组状态不可加入。";
  } else if (!targetRequest.shareable) {
    joinable = false;
    reason = "当前拼车组不接受拼车。";
  } else if (new Date(targetRequest.flight_datetime).getTime() <= Date.now()) {
    joinable = false;
    reason = "当前拼车组已过期。";
  } else if (sameTypeRequest) {
    joinable = false;
    reason = `当前账号已存在一张未来有效${joinPayload.service_type === "dropoff" ? "送机" : "接机"}单（${sameTypeRequest.order_no}），同一账号同类服务一次只保留一张有效单。`;
  } else if (nextPassengerCount > DEFAULT_GROUP_MAX_PASSENGERS) {
    joinable = false;
    reason = `加入后总人数将超过 ${DEFAULT_GROUP_MAX_PASSENGERS} 人。`;
  }

  if (joinable && !sameTerminal) {
    surchargeGbp = Number(joinPayload.passenger_count || 0) * 15;
  }

  return buildJoinResult({
    joinable,
    reason,
    surchargeGbp,
    currentPassengerCount,
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    group
  });
}

function evaluateJoinWindowAwareRelaxed({ targetRequest, group, activeMembers, joinPayload, activeFutureRequests = [] }) {
  const effectiveActiveMembers = (activeMembers || []).filter(item => {
    const status = String(item.transport_requests?.status || "").trim().toLowerCase();
    return Boolean(item.transport_requests) && !["closed", "cancelled"].includes(status);
  });
  const currentPassengerCount = effectiveActiveMembers.reduce((sum, item) => {
    return sum + Number(item.transport_requests?.passenger_count || item.passenger_count_snapshot || 0);
  }, 0);
  const maxPassengers = Number(group?.max_passengers || 0);
  const nextPassengerCount = currentPassengerCount + Number(joinPayload.passenger_count || 0);
  const sameServiceType = String(targetRequest.service_type || "").trim() === String(joinPayload.service_type || "").trim();
  const sameAirport = String(targetRequest.airport_code || "").trim().toUpperCase() === String(joinPayload.airport_code || "").trim().toUpperCase();
  const sameTerminal = String(targetRequest.terminal || "").trim().toUpperCase() === String(joinPayload.terminal || "").trim().toUpperCase();
  const groupStatus = String(group?.status || "").trim().toLowerCase();
  const groupVisibleOnFrontend = group?.visible_on_frontend === true;
  const effectiveTargetDate = group?.flight_time_reference || getEffectivePickupTime(targetRequest) || targetRequest.flight_datetime;
  const effectiveJoinDate = getEffectivePickupTime(joinPayload) || joinPayload.flight_datetime;
  const targetDatePart = getIsoDatePart(effectiveTargetDate);
  const joinDatePart = getIsoDatePart(effectiveJoinDate);
  const sameDate = targetDatePart === joinDatePart;
  const joinWindowMinutes = getStrictJoinWindowMinutes(joinPayload.service_type);
  const timeDistanceMinutes = getMinutesDifference(effectiveTargetDate, effectiveJoinDate);
  const withinTimeWindow = timeDistanceMinutes <= joinWindowMinutes;
  const allowCrossMidnightDateMismatch = !sameDate
    && getDateDistanceDays(targetDatePart, joinDatePart) === 1
    && withinTimeWindow;
  const sameTypeRequest = (activeFutureRequests || []).find(item => item.service_type === joinPayload.service_type);
  const warnings = [];

  let joinable = true;
  let reason = "";
  let errorCode = null;
  let surchargeGbp = 0;

  if (!sameServiceType) {
    joinable = false;
    reason = "服务类型不同，无法加入当前拼车组。";
    errorCode = "transport_join_service_mismatch";
  } else if (!sameAirport) {
    joinable = false;
    reason = "机场不同，无法加入当前拼车组。";
    errorCode = "transport_join_airport_mismatch";
  } else if (["full", "closed", "cancelled"].includes(groupStatus)) {
    joinable = false;
    reason = "当前拼车组已满员、关闭或取消，无法加入。";
    errorCode = "transport_join_group_not_open";
  } else if (!["single_member", "active", "open"].includes(groupStatus)) {
    joinable = false;
    reason = "当前拼车组状态不可加入。";
    errorCode = "transport_join_group_not_open";
  } else if (!groupVisibleOnFrontend) {
    joinable = false;
    reason = "当前拼车组未公开开放，无法加入。";
    errorCode = "transport_join_group_hidden";
  } else if (new Date(effectiveTargetDate).getTime() <= Date.now()) {
    joinable = false;
    reason = "当前拼车组已过期。";
    errorCode = "transport_join_group_expired";
  } else if (!sameDate && !allowCrossMidnightDateMismatch) {
    joinable = false;
    reason = joinPayload.service_type === "dropoff" ? "送机日期不同，无法拼车。" : "接机日期不同，无法拼车。";
    errorCode = "transport_join_invalid_date";
  } else if (sameTypeRequest) {
    joinable = false;
    reason = `当前账号已存在一张未来有效${joinPayload.service_type === "dropoff" ? "送机" : "接机"}单（${sameTypeRequest.order_no}），同一账号同类服务一次只保留一张有效单。`;
    errorCode = "transport_join_existing_future_request";
  } else if (maxPassengers < 1 || nextPassengerCount > maxPassengers) {
    joinable = false;
    reason = `加入后总人数将超过 ${maxPassengers} 人。`;
    errorCode = "transport_join_group_full";
  }

  if (joinable && !sameTerminal) {
    surchargeGbp = Number(joinPayload.passenger_count || 0) * 15;
  }
  if (joinable && !withinTimeWindow) {
    warnings.push(buildTimeWarning(
      "large_time_gap",
      "该订单时间与目标拼车组时间相差较大，请确认是否仍要加入。",
      {
        operation_type: "前台加入",
        threshold_minutes: joinWindowMinutes,
        time_distance_minutes: Math.round(timeDistanceMinutes),
        order_time: effectiveJoinDate,
        target_group_time: effectiveTargetDate
      }
    ));
  }
  if (joinable && allowCrossMidnightDateMismatch) {
    warnings.push(buildTimeWarning(
      "cross_midnight_date_mismatch",
      "该订单与目标拼车组跨午夜但实际时间差较近，请确认日期与时间后再加入。",
      {
        operation_type: "前台加入",
        threshold_minutes: joinWindowMinutes,
        time_distance_minutes: Math.round(timeDistanceMinutes),
        order_time: effectiveJoinDate,
        target_group_time: effectiveTargetDate
      }
    ));
  }

  return buildJoinResult({
    joinable,
    reason,
    errorCode,
    surchargeGbp,
    currentPassengerCount,
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
    group,
    warnings,
    timeDistanceMinutes: Math.round(timeDistanceMinutes),
    targetGroupTime: effectiveTargetDate,
    orderTime: effectiveJoinDate
  });
}

module.exports = {
  buildJoinDraft,
  evaluateJoin: evaluateJoinWindowAwareRelaxed
};
