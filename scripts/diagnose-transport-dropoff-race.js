const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
let supabase;

function loadLocalEnv() {
  const values = {
    LOCAL_SUPABASE_URL: process.env.LOCAL_SUPABASE_URL,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY,
    USER_SESSION_SECRET: process.env.USER_SESSION_SECRET
  };
  const envPath = path.join(root, ".env");
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!values[match[1]]) values[match[1]] = value;
  }
  for (const name of ["LOCAL_SUPABASE_URL", "LOCAL_SUPABASE_SERVICE_ROLE_KEY", "USER_SESSION_SECRET"]) assert.ok(values[name], `missing ${name}`);
  const url = new URL(values.LOCAL_SUPABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "Supabase target is not loopback");
  process.env.SUPABASE_URL = values.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = values.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.USER_SESSION_SECRET = values.USER_SESSION_SECRET;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_test";
  return values;
}

function catalogEvidence() {
  const sql = String.raw`select json_build_object(
    'rpc', exists(select 1 from pg_proc where proname='join_transport_group_atomic'),
    'capacity_trigger', exists(select 1 from pg_trigger where tgname='trg_transport_group_member_capacity' and not tgisinternal)
  );`;
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`local catalog check failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout.trim());
}

async function rows(table, select = "*") {
  const result = await supabase.from(table).select(select);
  if (result.error) throw result.error;
  return result.data || [];
}

async function protectedSnapshot() {
  const [groups, members] = await Promise.all([
    rows("transport_groups", "id,group_id,status,visible_on_frontend,max_passengers,flight_time_reference,notes,created_at,updated_at"),
    rows("transport_group_members", "group_id")
  ]);
  const occupied = new Set(members.map(item => item.group_id));
  const cutoff = Date.now() - 10 * 60000;
  return groups.filter(item => !occupied.has(item.group_id) && new Date(item.created_at).getTime() < cutoff)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function makeResponse() {
  let body = "";
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    end(value = "") { body += String(value); },
    result() { return { status: this.statusCode, body: body ? JSON.parse(body) : null }; }
  };
}

async function callSubmit(handler, userId, payload, label, startedAt) {
  const { createUserSessionToken, COOKIE_NAME } = require("../api/_lib/user-auth");
  const req = Readable.from([JSON.stringify(payload)]);
  req.method = "POST";
  req.url = "/api/public/transport-join-submit";
  req.query = {};
  req.headers = { cookie: `${COOKIE_NAME}=${createUserSessionToken(userId)}` };
  const res = makeResponse();
  await handler(req, res);
  return { label, submissionId: payload.submission_id, completedMs: Date.now() - startedAt, ...res.result() };
}

async function assertMarkerZero(marker) {
  const lower = marker.toLowerCase();
  const [requests, groups, users] = await Promise.all([
    rows("transport_requests", "id,notes,email"), rows("transport_groups", "id,group_id,notes"), rows("site_users", "id,email,nickname")
  ]);
  const requestIds = requests.filter(x => String(x.notes || "").includes(marker) || String(x.email || "").includes(lower)).map(x => x.id);
  const groupRows = groups.filter(x => String(x.notes || "").includes(marker) || String(x.group_id || "").includes(marker));
  const userRows = users.filter(x => String(x.email || "").includes(lower) || String(x.nickname || "").includes(marker));
  let memberCount = 0;
  if (requestIds.length || groupRows.length) {
    const allMembers = await rows("transport_group_members", "id,group_id,request_id");
    memberCount = allMembers.filter(x => requestIds.includes(x.request_id) || groupRows.some(g => g.group_id === x.group_id)).length;
  }
  assert.deepEqual({ requests: requestIds.length, groups: groupRows.length, members: memberCount, users: userRows.length }, { requests: 0, groups: 0, members: 0, users: 0 });
  return { requests: 0, groups: 0, members: 0, users: 0 };
}

async function createRoundFixture(marker) {
  const tracked = { userIds: [], requestIds: [], groupIds: [], memberIds: [] };
  const flightTime = new Date(Date.now() + 14 * 86400000).toISOString();
  const groupCode = `GRP-${marker}`.slice(0, 40).toUpperCase();
  const groupInsert = await supabase.from("transport_groups").insert({
    group_id: groupCode, service_type: "dropoff", group_date: flightTime.slice(0, 10), airport_code: "LHR",
    airport_name: "Heathrow Airport", terminal: "T2", location_from: "Nottingham", location_to: "Heathrow Airport T2",
    flight_time_reference: flightTime, preferred_time_start: flightTime, max_passengers: 4,
    visible_on_frontend: true, status: "active", notes: marker
  }).select("*").single();
  if (groupInsert.error) throw groupInsert.error;
  tracked.groupIds.push(groupInsert.data.id);
  const initiatorInsert = await supabase.from("transport_requests").insert({
    order_no: `QA-${marker}-INIT`.slice(0, 40), order_type: "pickup", business_date: flightTime.slice(0, 10),
    service_type: "dropoff", student_name: `${marker} initiator`, email: `${marker.toLowerCase()}-init@example.test`,
    phone: "07000000000", wechat: `${marker}_init`, passenger_count: 3, luggage_count: 1,
    airport_code: "LHR", airport_name: "Heathrow Airport", terminal: "T2", flight_no: "QA500",
    flight_datetime: flightTime, location_from: "Nottingham", location_to: "Heathrow Airport T2",
    preferred_time_start: flightTime, shareable: false, status: "matched", notes: marker,
    email_verified_snapshot: true, profile_verified_snapshot: true
  }).select("*").single();
  if (initiatorInsert.error) throw initiatorInsert.error;
  tracked.requestIds.push(initiatorInsert.data.id);
  const memberInsert = await supabase.from("transport_group_members").insert({
    group_id: groupCode, request_id: initiatorInsert.data.id, passenger_count_snapshot: 3,
    luggage_count_snapshot: 1, is_initiator: true
  }).select("id").single();
  if (memberInsert.error) throw memberInsert.error;
  tracked.memberIds.push(memberInsert.data.id);
  const users = [];
  for (let index = 0; index < 5; index += 1) {
    const userInsert = await supabase.from("site_users").insert({
      email: `${marker.toLowerCase()}-u${index}@example.test`, nickname: `${marker} U${index}`,
      phone: `070001${String(index).padStart(5, "0")}`, wechat_id: `${marker}_u${index}`, email_verified_at: new Date().toISOString()
    }).select("id").single();
    if (userInsert.error) throw userInsert.error;
    tracked.userIds.push(userInsert.data.id);
    users.push({ id: userInsert.data.id, label: `QA-U${index + 1}` });
  }
  return { marker, tracked, group: groupInsert.data, initiator: initiatorInsert.data, users, flightTime };
}

function payloadFor(fixture, submissionId, index) {
  return {
    target_request_id: fixture.initiator.id, submission_id: submissionId,
    airport_code: "LHR", airport_name: "Heathrow Airport", terminal: "T2", flight_no: `QA5${index}`,
    flight_datetime: fixture.flightTime, passenger_count: 1, luggage_count: 1,
    location_from: "Nottingham", location_to: "Heathrow Airport T2", fallback_accept: index % 2 ? "不接受" : "接受",
    notes: `${fixture.marker}|contender=${index}`
  };
}

function responseSummary(item, order) {
  const data = item.body?.data || {};
  return {
    qaAccount: item.label, submissionId: item.submissionId, httpStatus: item.status,
    businessErrorCode: item.body?.code || item.body?.error?.code || item.body?.errorCode || null,
    created: item.status === 201, idempotentReplay: data.idempotentReplay ?? null,
    requestId: data.requestId || null, orderNo: data.orderNo || null, groupId: data.groupId || null,
    rpcCurrentPassengerCount: data.currentPassengerCount ?? null,
    rpcRemainingCount: data.remainingPassengerCount ?? null,
    apiEvaluationNextPassengerCount: data.nextPassengerCount ?? null,
    completionOrder: order, completedMs: item.completedMs,
    message: item.body?.message || item.body?.error?.message || null
  };
}

async function collectEvidence(fixture, responses) {
  const groupResult = await supabase.from("transport_groups")
    .select("id,group_id,status,visible_on_frontend,max_passengers,flight_time_reference,created_at,updated_at")
    .eq("id", fixture.group.id).single();
  if (groupResult.error) throw groupResult.error;
  const memberResult = await supabase.from("transport_group_members")
    .select("id,group_id,request_id,passenger_count_snapshot,luggage_count_snapshot,is_initiator,created_at")
    .eq("group_id", fixture.group.group_id).order("created_at");
  if (memberResult.error) throw memberResult.error;
  const requestIds = memberResult.data.map(x => x.request_id);
  const requestResult = await supabase.from("transport_requests")
    .select("id,order_no,site_user_id,service_type,status,passenger_count,shareable,join_submission_id,created_at,updated_at")
    .in("id", requestIds).order("created_at");
  if (requestResult.error) throw requestResult.error;
  const requestById = new Map(requestResult.data.map(x => [x.id, x]));
  const activeStatuses = row => !["closed", "cancelled"].includes(String(row?.status || "").toLowerCase());
  const rawSnapshot = memberResult.data.reduce((sum, x) => sum + Number(x.passenger_count_snapshot || 0), 0);
  const activeSnapshot = memberResult.data.reduce((sum, x) => sum + (activeStatuses(requestById.get(x.request_id)) ? Number(x.passenger_count_snapshot || 0) : 0), 0);
  const requestPassenger = memberResult.data.reduce((sum, x) => sum + (activeStatuses(requestById.get(x.request_id)) ? Number(requestById.get(x.request_id)?.passenger_count || 0) : 0), 0);
  const viewResult = await supabase.from("transport_groups_public_view").select("group_id,current_passenger_count,remaining_passenger_count").eq("group_id", fixture.group.group_id).single();
  if (viewResult.error) throw viewResult.error;
  const nestedResult = await supabase.from("transport_group_members")
    .select("request_id,passenger_count_snapshot,transport_requests(id,status,passenger_count,site_user_id)")
    .eq("group_id", fixture.group.group_id).order("created_at");
  if (nestedResult.error) throw nestedResult.error;
  const nestedActive = nestedResult.data.filter(item => item.transport_requests && !["closed", "cancelled"].includes(item.transport_requests.status));
  const originalScriptPassengerCount = nestedActive.reduce((sum, item) => sum + Number(item.transport_requests.passenger_count || 0), 0);
  const summaries = responses.map(responseSummary);
  const success = summaries.find(x => x.httpStatus === 201);
  const successRequest = success ? requestById.get(success.requestId) : null;
  const successMember = success ? memberResult.data.find(x => x.request_id === success.requestId) : null;
  let classification = "undetermined";
  if (!success || !successRequest || !successMember || !activeStatuses(successRequest) || Number(successMember?.passenger_count_snapshot) !== 1 || Number(successRequest?.passenger_count) !== 1) classification = "A";
  else if (rawSnapshot !== 4 || activeSnapshot !== 4 || requestPassenger !== 4 || Number(viewResult.data.current_passenger_count) !== 4) classification = "B";
  else if (originalScriptPassengerCount !== 4) classification = "C";
  else classification = "no_anomaly";
  return {
    responses: summaries,
    database: {
      group: groupResult.data,
      members: memberResult.data.map(x => ({ ...x, requestExists: requestById.has(x.request_id) })),
      requests: requestResult.data,
      initiatorRequestId: fixture.initiator.id,
      successful201RequestId: success?.requestId || null,
      successful201MemberExists: Boolean(successMember),
      successful201RequestActive: Boolean(successRequest && activeStatuses(successRequest)),
      successful201MemberSnapshot: successMember?.passenger_count_snapshot ?? null,
      successful201RequestPassengerCount: successRequest?.passenger_count ?? null,
      missingRequestMemberIds: memberResult.data.filter(x => !requestById.has(x.request_id)).map(x => x.id),
      responseRequestIdMatchesDatabase: Boolean(success && successRequest)
    },
    counts: {
      rawMemberSnapshot: rawSnapshot, activeMemberSnapshot: activeSnapshot, activeRequestPassengerCount: requestPassenger,
      publicGroupView: Number(viewResult.data.current_passenger_count), publicGroupViewRemaining: Number(viewResult.data.remaining_passenger_count),
      successfulApiNextPassengerCount: success?.apiEvaluationNextPassengerCount ?? null,
      rpcCountFieldsExposedByHandler: false,
      originalIntegrationNestedCount: originalScriptPassengerCount,
      nestedRelationShapes: nestedResult.data.map(x => ({ requestId: x.request_id, shape: Array.isArray(x.transport_requests) ? "array" : typeof x.transport_requests, value: x.transport_requests }))
    },
    classification
  };
}

async function preciseCleanup(fixture) {
  const userRequestResult = await supabase.from("transport_requests").select("id").in("site_user_id", fixture.tracked.userIds);
  if (userRequestResult.error) throw userRequestResult.error;
  const requestIds = [...new Set([...fixture.tracked.requestIds, ...(userRequestResult.data || []).map(x => x.id)])];
  if (requestIds.length) {
    const result = await supabase.from("transport_requests").delete().in("id", requestIds);
    if (result.error) throw result.error;
  }
  const groupResult = await supabase.from("transport_groups").delete().in("id", fixture.tracked.groupIds);
  if (groupResult.error) throw groupResult.error;
  const userResult = await supabase.from("site_users").delete().in("id", fixture.tracked.userIds);
  if (userResult.error) throw userResult.error;
  return assertMarkerZero(fixture.marker);
}

async function main() {
  const env = loadLocalEnv();
  supabase = createClient(env.LOCAL_SUPABASE_URL, env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const catalog = catalogEvidence();
  assert.deepEqual(catalog, { rpc: true, capacity_trigger: true });
  const protectedBefore = await protectedSnapshot();
  assert.equal(protectedBefore.length, 6, "protected empty Group count is not 6");
  const submit = require("../public-api-handlers/transport-join-submit");
  const rounds = [];
  for (let round = 1; round <= 3; round += 1) {
    const marker = `P0RACE_${Date.now()}_R${round}`;
    await assertMarkerZero(marker);
    const fixture = await createRoundFixture(marker);
    let evidence;
    try {
      const startedAt = Date.now();
      const calls = fixture.users.map((user, index) => callSubmit(submit, user.id, payloadFor(fixture, crypto.randomUUID(), index), user.label, startedAt));
      const rawResponses = await Promise.all(calls);
      rawResponses.sort((a, b) => a.completedMs - b.completedMs);
      evidence = await collectEvidence(fixture, rawResponses);
      rounds.push({ round, marker, ...evidence });
    } finally {
      const zero = await preciseCleanup(fixture);
      const protectedAfterRound = await protectedSnapshot();
      assert.deepEqual(protectedAfterRound, protectedBefore, `protected empty Groups changed in round ${round}`);
      if (rounds.at(-1)?.round === round) rounds.at(-1).cleanup = { qa: zero, protectedGroupsUnchanged: true };
    }
  }
  const protectedAfter = await protectedSnapshot();
  assert.deepEqual(protectedAfter, protectedBefore);
  console.log(JSON.stringify({ environment: "local-loopback", catalog, protectedEmptyGroups: protectedBefore.map(x => x.id), rounds }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ diagnosticFailed: true, message: error.message }, null, 2));
  process.exitCode = 1;
});
