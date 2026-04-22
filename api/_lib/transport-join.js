const { mapRequestPayload, DEFAULT_GROUP_MAX_PASSENGERS } = require("./transport");

function getMinutesDifference(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000;
}

function getIsoDatePart(value) {
  return new Date(value).toISOString().slice(0, 10);
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
  return source?.preferred_time_start || source?.flight_datetime || null;
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
    preferred_time_start: body.preferred_time_start || body.flight_datetime,
    preferred_time_end: body.preferred_time_end || null,
    shareable: true,
    status: "published",
    notes: body.notes || null
  });
}

function buildJoinResult({
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
}) {
  return {
    joinable,
    reason,
    surchargeGbp,
    currentPassengerCount,
    remainingPassengerCount: Math.max(DEFAULT_GROUP_MAX_PASSENGERS - currentPassengerCount, 0),
    nextPassengerCount,
    sameAirport,
    sameTerminal,
    sameDate,
    withinTimeWindow,
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
  const sameDate = getIsoDatePart(targetPickupTime || targetRequest.flight_datetime) === getIsoDatePart(joinPickupTime || joinPayload.flight_datetime);
  const withinTimeWindow = getMinutesDifference(targetPickupTime || targetRequest.flight_datetime, joinPickupTime || joinPayload.flight_datetime) <= 240;
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
  const sameDate = getIsoDatePart(effectiveTargetDate) === getIsoDatePart(effectiveJoinDate);
  const joinWindowMinutes = getStrictJoinWindowMinutes(joinPayload.service_type);
  const withinTimeWindow = getMinutesDifference(effectiveTargetDate, effectiveJoinDate) <= joinWindowMinutes;
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

module.exports = {
  buildJoinDraft,
  evaluateJoin: evaluateJoinWindowAware
};
