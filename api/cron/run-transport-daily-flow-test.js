const { EventEmitter } = require("events");
const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, forbidden, serverError, getCronSuppliedSecret } = require("../_lib/http");
const { hashPassword, createAdminSessionToken, ADMIN_COOKIE_NAME } = require("../_lib/admin-security");
const { createUserSessionToken, COOKIE_NAME } = require("../_lib/user-auth");
const { createPickupRequestWithGroup, createRequestRecord, addRequestToGroup } = require("../_lib/transport-group-lifecycle");

const myRequestsHandler = require("../../public-api-handlers/my-transport-requests");
const publicGroupsHandler = require("../../public-api-handlers/transport-groups");
const publicBoardHandler = require("../../public-api-handlers/transport-board");
const adminGroupsHandler = require("../transport-groups");
const adminRequestsHandler = require("../transport-requests");

const QA_PASSWORD = process.env.TRANSPORT_FLOW_TEST_PASSWORD || "QaFlow123456!";

function isMissingRelationError(error, relationName) {
  const message = String(error?.message || "");
  return message.includes(`relation "${relationName}" does not exist`)
    || message.includes(`Could not find the table 'public.${relationName}' in the schema cache`);
}

function createMockReq({ method = "GET", query = {}, headers = {}, body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.query = query;
  req.headers = headers;
  process.nextTick(() => {
    if (body !== null && body !== undefined) {
      req.emit("data", Buffer.from(JSON.stringify(body)));
    }
    req.emit("end");
  });
  return req;
}

function createMockRes(resolve) {
  const headers = {};
  return {
    statusCode: 200,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },
    end(body) {
      let parsedBody = body;
      if (typeof body === "string") {
        try {
          parsedBody = JSON.parse(body);
        } catch (error) {
          parsedBody = body;
        }
      }
      resolve({
        statusCode: this.statusCode,
        headers,
        body: parsedBody
      });
    }
  };
}

function invokeHandler(handler, { method = "GET", query = {}, headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = createMockReq({ method, query, headers, body });
    const res = createMockRes(resolve);
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function slug(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function futureDateTimeIso(daysToAdd, hour, minute) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function addMismatch(mismatches, scenario, field, expected, actual, extra = {}) {
  mismatches.push({
    group_id: scenario,
    surface: "daily_flow_test",
    field,
    expected,
    actual,
    ...extra
  });
}

async function getAdminAuthCookie(supabase) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("No active admin user available for daily flow test");
  return `${ADMIN_COOKIE_NAME}=${createAdminSessionToken(data.id)}`;
}

async function ensureQaUser(supabase, runId, suffix, overrides = {}) {
  const email = `qa_daily_${slug(runId)}_${suffix}@example.com`;
  const nowIso = new Date().toISOString();
  const payload = {
    email,
    nickname: overrides.nickname || `Daily ${suffix.toUpperCase()} ${runId.slice(-4)}`,
    phone: overrides.phone || `+4477009${String(Math.floor(Math.random() * 90000) + 10000)}`,
    contact_preference: "wechat",
    wechat_id: overrides.wechat_id || `daily_wechat_${slug(runId)}_${suffix}`,
    whatsapp_contact: "",
    nationality: "China",
    password_hash: hashPassword(QA_PASSWORD),
    email_verified_at: nowIso
  };

  const inserted = await supabase
    .from("site_users")
    .insert(payload)
    .select("id, email, nickname, phone, wechat_id")
    .single();

  if (inserted.error) throw inserted.error;
  return inserted.data;
}

function buildSubmitPayload(user, options) {
  return {
    service_type: options.service_type,
    student_name: user.nickname,
    email: user.email,
    phone: user.phone,
    wechat: user.wechat_id,
    passenger_count: 1,
    luggage_count: 1,
    airport_code: options.airport_code,
    airport_name: options.airport_name,
    terminal: options.terminal,
    flight_no: options.flight_no,
    flight_datetime: options.flight_datetime,
    location_from: options.location_from,
    location_to: options.location_to,
    preferred_time_start: options.preferred_time_start,
    preferred_time_end: null,
    shareable: true,
    status: "published",
    notes: options.notes
  };
}

async function fetchMyRequests(user) {
  const response = await invokeHandler(myRequestsHandler, {
    method: "GET",
    headers: {
      cookie: `${COOKIE_NAME}=${createUserSessionToken(user.id)}`
    }
  });
  if (response.statusCode !== 200 || response.body?.error) {
    throw new Error(response.body?.error?.message || "Failed to load personal center requests");
  }
  return Array.isArray(response.body?.data) ? response.body.data : [];
}

async function fetchPublicGroups(groupIds) {
  const response = await invokeHandler(publicGroupsHandler, {
    method: "GET",
    query: {
      page: 1,
      limit: 100,
      sort: "upcoming"
    }
  });
  if (response.statusCode !== 200 || response.body?.error) {
    throw new Error(response.body?.error?.message || "Failed to load public groups");
  }
  const items = Array.isArray(response.body?.data?.items) ? response.body.data.items : [];
  return items.filter(item => groupIds.includes(item.group_id));
}

async function fetchPublicBoard(groupIds) {
  const response = await invokeHandler(publicBoardHandler, {
    method: "GET",
    query: {
      page: 1,
      limit: 200,
      sort: "upcoming"
    }
  });
  if (response.statusCode !== 200 || response.body?.error) {
    throw new Error(response.body?.error?.message || "Failed to load public board");
  }
  const items = Array.isArray(response.body?.data?.items) ? response.body.data.items : [];
  return items.filter(item => groupIds.includes(item.group_id));
}

async function fetchAdminGroups(adminCookie, groupIds) {
  const response = await invokeHandler(adminGroupsHandler, {
    method: "GET",
    query: {
      paginate: "false",
      visible_on_frontend: "true"
    },
    headers: {
      cookie: adminCookie
    }
  });
  if (response.statusCode !== 200 || response.body?.error) {
    throw new Error(response.body?.error?.message || "Failed to load admin groups");
  }
  const items = Array.isArray(response.body?.data) ? response.body.data : [];
  return items.filter(item => groupIds.includes(item.group_id));
}

async function fetchAdminRequests(adminCookie, orderNos) {
  const response = await invokeHandler(adminRequestsHandler, {
    method: "GET",
    query: {
      paginate: "false",
      status: "active"
    },
    headers: {
      cookie: adminCookie
    }
  });
  if (response.statusCode !== 200 || response.body?.error) {
    throw new Error(response.body?.error?.message || "Failed to load admin requests");
  }
  const items = Array.isArray(response.body?.data) ? response.body.data : [];
  return items.filter(item => orderNos.includes(item.order_no));
}

async function createOrderForUser(supabase, user, payload) {
  const { request, group } = await createPickupRequestWithGroup(supabase, {
    ...payload,
    site_user_id: user.id,
    email_verified_snapshot: true,
    profile_verified_snapshot: true
  });
  return {
    id: request.id,
    orderNo: request.order_no,
    groupId: group.group_id
  };
}

async function createJoinedOrderForUser(supabase, user, targetGroupId, payload) {
  const request = await createRequestRecord(supabase, {
    ...payload,
    site_user_id: user.id,
    email_verified_snapshot: true,
    profile_verified_snapshot: true
  });
  const group = await addRequestToGroup(supabase, targetGroupId, request);
  return {
    id: request.id,
    orderNo: request.order_no,
    groupId: group.group_id,
    nextPassengerCount: Number(group.current_passenger_count || 0)
  };
}

async function persistAuditLog(supabase, report) {
  const payload = {
    checked_at: report.checked_at,
    sampled_group_count: report.sampled_group_count,
    sampled_group_ids: report.sampled_group_ids || [],
    checked_request_count: report.checked_request_count,
    checked_order_nos: report.checked_order_nos || [],
    skipped_check_count: report.skipped_check_count || 0,
    skipped_checks: report.skipped_checks || [],
    mismatch_count: report.mismatch_count || 0,
    mismatches: report.mismatches || []
  };

  const { error } = await supabase
    .from("transport_sync_audit_logs")
    .insert(payload);

  if (error) throw error;
}

async function cleanupQaRun(supabase, userIds) {
  if (!Array.isArray(userIds) || !userIds.length) {
    return;
  }

  const { data: requests, error: requestError } = await supabase
    .from("transport_requests")
    .select("id")
    .in("site_user_id", userIds);
  if (requestError) throw requestError;

  const requestIds = (requests || []).map(item => item.id).filter(Boolean);
  const groupIds = new Set();

  if (requestIds.length) {
    const { data: memberships, error: membershipError } = await supabase
      .from("transport_group_members")
      .select("group_id, request_id")
      .in("request_id", requestIds);
    if (membershipError) throw membershipError;

    (memberships || []).forEach(item => {
      if (item.group_id) {
        groupIds.add(item.group_id);
      }
    });

    const { error: deleteMembershipsError } = await supabase
      .from("transport_group_members")
      .delete()
      .in("request_id", requestIds);
    if (deleteMembershipsError) throw deleteMembershipsError;

    const { error: deleteRequestsError } = await supabase
      .from("transport_requests")
      .delete()
      .in("id", requestIds);
    if (deleteRequestsError) throw deleteRequestsError;
  }

  const groupIdList = Array.from(groupIds);
  if (groupIdList.length) {
    const { error: deleteGroupsError } = await supabase
      .from("transport_groups")
      .delete()
      .in("group_id", groupIdList);
    if (deleteGroupsError && !String(deleteGroupsError.message || "").includes("transport_groups.group_id")) {
      throw deleteGroupsError;
    }
  }

  const { error: deleteUsersError } = await supabase
    .from("site_users")
    .delete()
    .in("id", userIds);
  if (deleteUsersError) throw deleteUsersError;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const expectedSecret = String(process.env.CRON_SECRET || "").trim();
  const suppliedSecret = getCronSuppliedSecret(req);
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    forbidden(res, "Invalid cron secret");
    return;
  }

  const supabase = getSupabaseAdmin();
  const runId = `daily_flow_${Date.now()}`;
  const createdUsers = [];
  const trackedGroupIds = new Set();
  const trackedOrderNos = [];
  const mismatches = [];
  const skippedChecks = [];
  let storage = { stored: true };
  let cleanupResult = {
    planned_user_count: 0,
    completed: false
  };
  let notification = {
    sent: false,
    skipped: true,
    reason: "daily_flow_email_disabled"
  };

  function trackOrder(data) {
    if (data?.groupId) {
      trackedGroupIds.add(data.groupId);
    }
    if (data?.orderNo) {
      trackedOrderNos.push(data.orderNo);
    }
  }

  try {
    const adminCookie = await getAdminAuthCookie(supabase);

    const user1 = await ensureQaUser(supabase, runId, "u1", { nickname: `QA Pickup A ${runId.slice(-4)}` });
    const user2 = await ensureQaUser(supabase, runId, "u2", { nickname: `QA Pickup B ${runId.slice(-4)}` });
    const user3 = await ensureQaUser(supabase, runId, "u3", { nickname: `QA Dropoff A ${runId.slice(-4)}` });
    const user4 = await ensureQaUser(supabase, runId, "u4", { nickname: `QA Dropoff B ${runId.slice(-4)}` });
    const user5 = await ensureQaUser(supabase, runId, "u5", { nickname: `QA Join ${runId.slice(-4)}` });
    createdUsers.push(user1, user2, user3, user4, user5);

    const pickup1 = await createOrderForUser(supabase, user1, buildSubmitPayload(user1, {
      service_type: "pickup",
      airport_code: "LHR",
      airport_name: "希思罗机场",
      terminal: "T1",
      flight_no: `QA${String(Date.now()).slice(-4)}`,
      flight_datetime: futureDateTimeIso(30, 9, 10),
      preferred_time_start: futureDateTimeIso(30, 9, 20),
      location_from: "LHR T1",
      location_to: `QA Daily ${runId} Flat 28, Orbital`,
      notes: `daily flow pickup 1 ${runId}`
    }));
    trackOrder(pickup1);
    const pickup2 = await createOrderForUser(supabase, user2, buildSubmitPayload(user2, {
      service_type: "pickup",
      airport_code: "LGW",
      airport_name: "盖特威克机场",
      terminal: "T1",
      flight_no: `QB${String(Date.now()).slice(-4)}`,
      flight_datetime: futureDateTimeIso(31, 10, 15),
      preferred_time_start: futureDateTimeIso(31, 10, 25),
      location_from: "LGW T1",
      location_to: `QA Daily ${runId} Flat 30, Orbital`,
      notes: `daily flow pickup 2 ${runId}`
    }));
    trackOrder(pickup2);
    const dropoff1 = await createOrderForUser(supabase, user3, buildSubmitPayload(user3, {
      service_type: "dropoff",
      airport_code: "LHR",
      airport_name: "希思罗机场",
      terminal: "T2",
      flight_no: `QC${String(Date.now()).slice(-4)}`,
      flight_datetime: futureDateTimeIso(32, 8, 40),
      preferred_time_start: futureDateTimeIso(32, 8, 10),
      location_from: `QA Daily ${runId} Flat 32, Orbital`,
      location_to: "LHR T2",
      notes: `daily flow dropoff 1 ${runId}`
    }));
    trackOrder(dropoff1);
    const dropoff2 = await createOrderForUser(supabase, user4, buildSubmitPayload(user4, {
      service_type: "dropoff",
      airport_code: "MAN",
      airport_name: "曼彻斯特机场",
      terminal: "T3",
      flight_no: `QD${String(Date.now()).slice(-4)}`,
      flight_datetime: futureDateTimeIso(33, 7, 55),
      preferred_time_start: futureDateTimeIso(33, 7, 25),
      location_from: `QA Daily ${runId} Flat 36, Orbital`,
      location_to: "MAN T3",
      notes: `daily flow dropoff 2 ${runId}`
    }));

    trackOrder(dropoff2);
    const joinResult = await createJoinedOrderForUser(supabase, user5, pickup1.groupId, {
      ...buildSubmitPayload(user5, {
        service_type: "pickup",
        airport_code: "LHR",
        airport_name: "希思罗机场",
        terminal: "T1",
        flight_no: `QJ${String(Date.now()).slice(-4)}`,
        flight_datetime: futureDateTimeIso(30, 9, 10),
        preferred_time_start: futureDateTimeIso(30, 9, 20),
        location_from: "LHR T1",
        location_to: `QA Daily ${runId} Flat 28, Orbital`,
        notes: `daily flow join ${runId}`
      }),
      status: "published"
    });
    trackOrder(joinResult);

    const user1AfterJoin = await fetchMyRequests(user1);
    const user3AfterCreate = await fetchMyRequests(user3);
    const user5AfterJoin = await fetchMyRequests(user5);
    const row1 = user1AfterJoin.find(item => item.order_no === pickup1.orderNo);
    const row3 = user3AfterCreate.find(item => item.order_no === dropoff1.orderNo);
    const row5 = user5AfterJoin.find(item => item.order_no === joinResult.orderNo);

    if (!row1 || !row5) {
      addMismatch(mismatches, "carpool_join", "personal_center_missing_joined_orders", "both orders visible", `${Boolean(row1)}/${Boolean(row5)}`);
    } else {
      if (normalizeText(row1.group_id) !== normalizeText(joinResult.groupId) || normalizeText(row5.group_id) !== normalizeText(joinResult.groupId)) {
        addMismatch(mismatches, "carpool_join", "group_id", joinResult.groupId, `${row1.group_id}/${row5.group_id}`);
      }
      if (normalizeNumber(row1.current_passenger_count) !== 2 || normalizeNumber(row5.current_passenger_count) !== 2) {
        addMismatch(mismatches, "carpool_join", "current_passenger_count", 2, `${row1.current_passenger_count}/${row5.current_passenger_count}`);
      }
      if (normalizeNumber(row1.current_average_price_gbp) !== normalizeNumber(row5.current_average_price_gbp)) {
        addMismatch(mismatches, "carpool_join", "current_average_price_gbp", row1.current_average_price_gbp, row5.current_average_price_gbp);
      }
    }

    if (!row3) {
      addMismatch(mismatches, "dropoff_create", "personal_center_missing_order", dropoff1.orderNo, "missing");
    }

    const groupIds = Array.from(new Set([
      ...Array.from(trackedGroupIds),
      pickup1.groupId,
      pickup2.groupId,
      dropoff1.groupId,
      dropoff2.groupId,
      joinResult.groupId
    ].filter(Boolean)));
    const orderNos = Array.from(new Set([
      ...trackedOrderNos,
      pickup1.orderNo,
      pickup2.orderNo,
      dropoff1.orderNo,
      dropoff2.orderNo,
      joinResult.orderNo
    ].filter(Boolean)));

    const publicGroups = await fetchPublicGroups(groupIds);
    const publicBoard = await fetchPublicBoard(groupIds);
    const adminGroups = await fetchAdminGroups(adminCookie, groupIds);
    const adminRequests = await fetchAdminRequests(adminCookie, orderNos);

    const publicGroupsById = new Map(publicGroups.map(item => [item.group_id, item]));
    const publicBoardById = new Map(publicBoard.map(item => [item.group_id, item]));
    const adminGroupsById = new Map(adminGroups.map(item => [item.group_id, item]));
    const adminRequestsByOrder = new Map(adminRequests.map(item => [item.order_no, item]));

    const joinedGroupId = joinResult.groupId;
    const groupComparisons = [
      { scenario: "pickup_carpool_group", groupId: joinedGroupId, expectedCount: 2 },
      { scenario: "dropoff_group", groupId: dropoff1.groupId, expectedCount: 1 }
    ];

    groupComparisons.forEach(({ scenario, groupId, expectedCount }) => {
      const pg = publicGroupsById.get(groupId);
      const pb = publicBoardById.get(groupId);
      const ag = adminGroupsById.get(groupId);

      if (!pg || !pb || !ag) {
        addMismatch(mismatches, scenario, "group_visible", "present on public_groups/public_board/admin_groups", `${Boolean(pg)}/${Boolean(pb)}/${Boolean(ag)}`);
        return;
      }

      const counts = [pg.current_passenger_count, pb.current_passenger_count, ag.current_passenger_count].map(normalizeNumber);
      if (counts.some(value => value !== expectedCount)) {
        addMismatch(mismatches, scenario, "current_passenger_count", expectedCount, counts.join("/"));
      }

      const prices = [pg.current_average_price_gbp, pb.current_average_price_gbp, ag.current_average_price_gbp].map(normalizeNumber);
      if (!(prices[0] === prices[1] && prices[1] === prices[2])) {
        addMismatch(mismatches, scenario, "current_average_price_gbp", prices[0], prices.join("/"));
      }
    });

    [
      { scenario: "pickup_admin_request_1", orderNo: pickup1.orderNo, expectedGroupId: joinedGroupId, expectedServiceType: "pickup" },
      { scenario: "pickup_admin_request_2", orderNo: joinResult.orderNo, expectedGroupId: joinedGroupId, expectedServiceType: "pickup" },
      { scenario: "dropoff_admin_request", orderNo: dropoff1.orderNo, expectedGroupId: dropoff1.groupId, expectedServiceType: "dropoff" }
    ].forEach(({ scenario, orderNo, expectedGroupId, expectedServiceType }) => {
      const row = adminRequestsByOrder.get(orderNo);
      if (!row) {
        addMismatch(mismatches, scenario, "admin_request_visible", orderNo, "missing");
        return;
      }
      if (normalizeText(row.group_id) !== normalizeText(expectedGroupId)) {
        addMismatch(mismatches, scenario, "group_id", expectedGroupId, row.group_id, { order_no: orderNo });
      }
      if (normalizeText(row.service_type) !== normalizeText(expectedServiceType)) {
        addMismatch(mismatches, scenario, "service_type", expectedServiceType, row.service_type, { order_no: orderNo });
      }
    });

    const report = {
      checked_at: new Date().toISOString(),
      sampled_group_count: groupIds.length,
      sampled_group_ids: groupIds,
      checked_request_count: orderNos.length,
      checked_order_nos: orderNos,
      skipped_check_count: skippedChecks.length,
      skipped_checks: skippedChecks,
      mismatch_count: mismatches.length,
      mismatches
    };

    try {
      await persistAuditLog(supabase, report);
    } catch (error) {
      if (isMissingRelationError(error, "transport_sync_audit_logs")) {
        storage = { stored: false, reason: "missing_table" };
      } else {
        throw error;
      }
    }

    cleanupResult = {
      planned_user_count: createdUsers.length,
      completed: true
    };
    await cleanupQaRun(supabase, createdUsers.map(item => item.id).filter(Boolean));
    createdUsers.length = 0;

    ok(res, {
      ...report,
      storage,
      cleanup: cleanupResult,
      notification
    });
  } catch (error) {
    const failureReport = {
      checked_at: new Date().toISOString(),
      sampled_group_count: trackedGroupIds.size,
      sampled_group_ids: Array.from(trackedGroupIds),
      checked_request_count: trackedOrderNos.length,
      checked_order_nos: trackedOrderNos,
      skipped_check_count: skippedChecks.length,
      skipped_checks: skippedChecks,
      mismatch_count: mismatches.length + 1,
      mismatches: mismatches.concat([{
        group_id: runId,
        surface: "daily_flow_test",
        field: "fatal_error",
        expected: "full_flow_success",
        actual: error && error.message ? error.message : "unknown_error"
      }])
    };

    try {
      await persistAuditLog(supabase, failureReport);
    } catch (persistError) {
      if (isMissingRelationError(persistError, "transport_sync_audit_logs")) {
        storage = { stored: false, reason: "missing_table" };
      } else {
        console.error("[transport-daily-flow-test] persist failed", persistError);
      }
    }

    try {
      if (createdUsers.length) {
        cleanupResult = {
          planned_user_count: createdUsers.length,
          completed: true
        };
        await cleanupQaRun(supabase, createdUsers.map(item => item.id).filter(Boolean));
        createdUsers.length = 0;
      }
    } catch (cleanupError) {
      cleanupResult = {
        planned_user_count: createdUsers.length,
        completed: false,
        error: cleanupError && cleanupError.message ? cleanupError.message : "cleanup_failed"
      };
      console.error("[transport-daily-flow-test] cleanup failed", cleanupError);
    }

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      data: null,
      error: {
        message: error && error.message ? error.message : "Unexpected server error"
      },
      meta: {
        report: failureReport,
        storage,
        cleanup: cleanupResult,
        notification
      }
    }));
  }
};
