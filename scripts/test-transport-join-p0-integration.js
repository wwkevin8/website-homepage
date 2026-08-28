const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { spawnSync } = require("node:child_process");
const { createClient } = require("@supabase/supabase-js");
const { buildGroupStats } = require("../api/_lib/transport-group-stats");
const { _test: boardTest } = require("../public-api-handlers/transport-board");

const root = path.resolve(__dirname, "..");
const marker = `P0JOIN_${Date.now()}`;
const created = { users: [], requests: [], groups: [] };
const results = [];
let supabase;
let protectedEmptyGroups = [];
let faultTriggerName = "";
let faultFunctionName = "";

function loadLocalEnv() {
  const envPath = path.join(root, ".env");
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const values = {
    LOCAL_SUPABASE_URL: process.env.LOCAL_SUPABASE_URL,
    LOCAL_SUPABASE_ANON_KEY: process.env.LOCAL_SUPABASE_ANON_KEY,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY,
    USER_SESSION_SECRET: process.env.USER_SESSION_SECRET
  };
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!values[match[1]]) values[match[1]] = value;
  }
  for (const name of ["LOCAL_SUPABASE_URL", "LOCAL_SUPABASE_ANON_KEY", "LOCAL_SUPABASE_SERVICE_ROLE_KEY", "USER_SESSION_SECRET"]) {
    assert.ok(values[name], `missing ${name}`);
  }
  const url = new URL(values.LOCAL_SUPABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "local Supabase URL must be loopback");
  process.env.SUPABASE_URL = values.LOCAL_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = values.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  process.env.USER_SESSION_SECRET = values.USER_SESSION_SECRET;
  process.env.APP_ENV = "local";
  process.env.RUNTIME_MODE = "local_test";
  return values;
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

async function callHandler(handler, userId, payload) {
  const { createUserSessionToken, COOKIE_NAME } = require("../api/_lib/user-auth");
  const req = Readable.from([JSON.stringify(payload)]);
  req.method = "POST";
  req.url = "/api/public/test";
  req.query = {};
  req.headers = { cookie: `${COOKIE_NAME}=${createUserSessionToken(userId)}` };
  const res = makeResponse();
  await handler(req, res);
  return res.result();
}

async function query(table, select = "*") {
  const result = await supabase.from(table).select(select);
  if (result.error) throw result.error;
  return result.data || [];
}

function queryLocalMetadata(sql) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "supabase_db_webside", "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`local metadata query failed: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

function assertPublicGroupViewContract() {
  const metadata = queryLocalMetadata(`
    select json_build_object(
      'columns', (select json_agg(x order by ordinal_position) from (
        select ordinal_position, column_name, udt_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'transport_groups_public_view'
      ) x),
      'owner', (select pg_get_userbyid(relowner) from pg_class where oid = 'public.transport_groups_public_view'::regclass),
      'reloptions', (select reloptions from pg_class where oid = 'public.transport_groups_public_view'::regclass),
      'anon_grants', (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'transport_groups_public_view' and grantee = 'anon'),
      'authenticated_grants', (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'transport_groups_public_view' and grantee = 'authenticated'),
      'service_role_select', (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'transport_groups_public_view' and grantee = 'service_role' and privilege_type = 'SELECT')
    );
  `);
  const expectedColumns = [
    ["id", "uuid"], ["group_id", "text"], ["service_type", "text"], ["group_date", "date"],
    ["airport_code", "text"], ["airport_name", "text"], ["terminal", "text"], ["location_from", "text"],
    ["location_to", "text"], ["flight_time_reference", "timestamptz"], ["preferred_time_start", "timestamptz"],
    ["preferred_time_end", "timestamptz"], ["vehicle_type", "text"], ["max_passengers", "int4"],
    ["visible_on_frontend", "bool"], ["status", "text"], ["notes", "text"], ["created_at", "timestamptz"],
    ["updated_at", "timestamptz"], ["member_request_count", "int8"], ["current_passenger_count", "int8"],
    ["current_luggage_count", "int8"], ["remaining_passenger_count", "int8"]
  ];
  assert.deepEqual(metadata.columns.map(column => [column.column_name, column.udt_name]), expectedColumns, "public Group view must match the Production 23-column contract");
  assert.deepEqual(metadata.columns.map(column => column.ordinal_position), Array.from({ length: 23 }, (_, index) => index + 1));
  assert.equal(metadata.owner, "postgres");
  assert.equal(metadata.reloptions, null);
  assert.equal(metadata.anon_grants, 0);
  assert.equal(metadata.authenticated_grants, 0);
  assert.equal(metadata.service_role_select, 1);
}

async function createUser(label) {
  const email = `${marker.toLowerCase()}-${label}@example.test`;
  const { data, error } = await supabase.from("site_users").insert({
    email,
    nickname: `${marker} ${label}`,
    phone: `07000${String(created.users.length + 1).padStart(6, "0")}`,
    wechat_id: `${marker}_${label}`,
    email_verified_at: new Date().toISOString()
  }).select("id,email").single();
  if (error) throw error;
  created.users.push(data.id);
  return data;
}

function futureIso(offsetMinutes = 0) {
  return new Date(Date.now() + 14 * 86400000 + offsetMinutes * 60000).toISOString();
}

async function createFixture({ label, serviceType = "pickup", maxPassengers = 5, passengers = [3], shareable = false }) {
  const flightTime = futureIso(created.groups.length * 20);
  const groupId = `GRP-${marker.slice(-10)}-${label}`.slice(0, 40).toUpperCase();
  const { data: group, error: groupError } = await supabase.from("transport_groups").insert({
    group_id: groupId,
    service_type: serviceType,
    group_date: flightTime.slice(0, 10),
    airport_code: "LHR",
    airport_name: "Heathrow Airport",
    terminal: "T2",
    location_from: serviceType === "dropoff" ? "Nottingham" : "Heathrow Airport T2",
    location_to: serviceType === "dropoff" ? "Heathrow Airport T2" : "Nottingham",
    flight_time_reference: flightTime,
    preferred_time_start: flightTime,
    max_passengers: maxPassengers,
    visible_on_frontend: true,
    status: passengers.reduce((a, b) => a + b, 0) >= maxPassengers ? "full" : "active",
    notes: marker
  }).select("*").single();
  if (groupError) throw groupError;
  created.groups.push(group.id);

  const requests = [];
  for (let index = 0; index < passengers.length; index += 1) {
    const orderNo = `PU${Date.now().toString().slice(-8)}-${label}-${index}`.slice(0, 40);
    const requestPayload = {
      order_no: orderNo,
      order_type: "pickup",
      business_date: flightTime.slice(0, 10),
      service_type: serviceType,
      student_name: `${marker} member ${label} ${index}`,
      email: `${marker.toLowerCase()}-${label}-${index}@example.test`,
      phone: "07000000000",
      wechat: `${marker}_${label}_${index}`,
      passenger_count: passengers[index],
      luggage_count: 1,
      airport_code: "LHR",
      airport_name: "Heathrow Airport",
      terminal: "T2",
      flight_no: `QA${label}${index}`.slice(0, 20),
      flight_datetime: flightTime,
      location_from: group.location_from,
      location_to: group.location_to,
      preferred_time_start: flightTime,
      shareable,
      status: "matched",
      notes: marker,
      email_verified_snapshot: true,
      profile_verified_snapshot: true
    };
    const { data: request, error: requestError } = await supabase.from("transport_requests").insert(requestPayload).select("*").single();
    if (requestError) throw requestError;
    created.requests.push(request.id);
    requests.push(request);
    const { error: memberError } = await supabase.from("transport_group_members").insert({
      group_id: group.group_id,
      request_id: request.id,
      passenger_count_snapshot: request.passenger_count,
      luggage_count_snapshot: request.luggage_count,
      is_initiator: index === 0
    });
    if (memberError) throw memberError;
  }
  return { group, requests, targetRequestId: [...requests].sort((a, b) => a.id.localeCompare(b.id))[0].id, flightTime };
}

async function createStandaloneRequest(fixture, label, passengerCount = 1) {
  const source = fixture.requests[0];
  const { id, created_at, updated_at, join_submission_id, join_submission_payload_hash, ...base } = source;
  const { data, error } = await supabase.from("transport_requests").insert({
    ...base,
    order_no: `PU${Date.now().toString().slice(-8)}-${label}`.slice(0, 40),
    student_name: `${marker} standalone ${label}`,
    email: `${marker.toLowerCase()}-${label}@example.test`,
    wechat: `${marker}_${label}`,
    passenger_count: passengerCount,
    luggage_count: 1,
    notes: marker,
    site_user_id: null,
    status: "matched"
  }).select("*").single();
  if (error) throw error;
  created.requests.push(data.id);
  return data;
}

function joinPayload(fixture, fallback = "接受") {
  const target = fixture.requests.find(item => item.id === fixture.targetRequestId);
  return {
    target_request_id: fixture.targetRequestId,
    airport_code: target.airport_code,
    airport_name: target.airport_name,
    terminal: target.terminal,
    flight_no: `J${Date.now().toString().slice(-6)}`,
    flight_datetime: target.flight_datetime,
    passenger_count: 1,
    luggage_count: 1,
    location_from: target.location_from,
    location_to: target.location_to,
    fallback_accept: fallback,
    notes: `${marker}|fallback_accept=${fallback}`
  };
}

async function groupState(fixture) {
  const { data: members, error } = await supabase.from("transport_group_members")
    .select("request_id,passenger_count_snapshot,transport_requests(id,status,passenger_count,site_user_id,notes)")
    .eq("group_id", fixture.group.group_id);
  if (error) throw error;
  const active = members.filter(item => item.transport_requests && !["closed", "cancelled"].includes(item.transport_requests.status));
  return {
    members,
    memberCount: members.length,
    passengers: active.reduce((sum, item) => sum + Number(item.transport_requests.passenger_count || 0), 0)
  };
}

async function snapshotProtectedEmptyGroups() {
  const groups = await query("transport_groups", "id,group_id,status,visible_on_frontend,max_passengers,flight_time_reference,notes,created_at,updated_at");
  const members = await query("transport_group_members", "group_id");
  const occupied = new Set(members.map(item => item.group_id));
  const cutoff = Date.now() - 10 * 60000;
  return groups.filter(item => !occupied.has(item.group_id) && new Date(item.created_at).getTime() < cutoff && !String(item.notes || "").includes(marker))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function assertQaZero() {
  const [requests, groups, users] = await Promise.all([
    query("transport_requests", "id,notes,email"),
    query("transport_groups", "id,notes,group_id"),
    query("site_users", "id,email")
  ]);
  assert.equal(requests.filter(item => String(item.notes || "").includes(marker) || String(item.email || "").includes(marker.toLowerCase())).length, 0);
  assert.equal(groups.filter(item => String(item.notes || "").includes(marker) || String(item.group_id || "").includes(marker)).length, 0);
  assert.equal(users.filter(item => String(item.email || "").includes(marker.toLowerCase())).length, 0);
}

async function cleanup() {
  if (faultTriggerName && faultFunctionName) {
    const sql = `drop trigger if exists ${faultTriggerName} on public.transport_group_members; drop function if exists public.${faultFunctionName}();`;
    const dropped = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: sql, encoding: "utf8" });
    if (dropped.status !== 0) throw new Error(`fault injection cleanup failed: ${dropped.stderr}`);
    faultTriggerName = "";
    faultFunctionName = "";
  }
  if (created.users.length) {
    const { data, error } = await supabase.from("transport_requests").select("id").in("site_user_id", created.users);
    if (error) throw error;
    for (const item of data || []) {
      if (!created.requests.includes(item.id)) created.requests.push(item.id);
    }
  }
  if (created.requests.length) {
    const { error } = await supabase.from("transport_requests").delete().in("id", created.requests);
    if (error) throw error;
  }
  if (created.groups.length) {
    const { error } = await supabase.from("transport_groups").delete().in("id", created.groups);
    if (error) throw error;
  }
  if (created.users.length) {
    const { error } = await supabase.from("site_users").delete().in("id", created.users);
    if (error) throw error;
  }
}

async function main() {
  const env = loadLocalEnv();
  supabase = createClient(env.LOCAL_SUPABASE_URL, env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  assertPublicGroupViewContract();
  await assertQaZero();
  protectedEmptyGroups = await snapshotProtectedEmptyGroups();
  assert.equal(protectedEmptyGroups.length, 6, "protected non-QA empty-group baseline changed");
  const preview = require("../public-api-handlers/transport-join-preview");
  const submit = require("../public-api-handlers/transport-join-submit");

  for (const serviceType of ["pickup", "dropoff"]) {
    const fixture = await createFixture({ label: serviceType, serviceType, maxPassengers: 5, passengers: [3], shareable: false });
    const user = await createUser(serviceType);
    const previewResult = await callHandler(preview, user.id, joinPayload(fixture, serviceType === "pickup" ? "接受" : "不接受"));
    assert.equal(previewResult.status, 200);
    assert.equal(previewResult.body.data.evaluation.joinable, true);
    const submitResult = await callHandler(submit, user.id, joinPayload(fixture, serviceType === "pickup" ? "接受" : "不接受"));
    assert.equal(submitResult.status, 201);
    created.requests.push(submitResult.body.data.requestId);
    const state = await groupState(fixture);
    assert.equal(state.memberCount, 2);
    assert.equal(state.passengers, 4);
    results.push({ test: `${serviceType}_preview_submit`, status: "pass", members: state.memberCount, passengers: state.passengers });
  }

  for (const maxPassengers of [4, 5, 6]) {
    const fixture = await createFixture({ label: `cap${maxPassengers}`, maxPassengers, passengers: [3], shareable: false });
    const user = await createUser(`cap${maxPassengers}`);
    const p = await callHandler(preview, user.id, joinPayload(fixture));
    assert.equal(p.status, 200);
    assert.equal(p.body.data.evaluation.maxPassengerCount, maxPassengers);
    assert.equal(p.body.data.evaluation.remainingPassengerCount, maxPassengers - 3);
    const s = await callHandler(submit, user.id, joinPayload(fixture));
    assert.equal(s.status, 201);
    created.requests.push(s.body.data.requestId);
    const state = await groupState(fixture);
    assert.equal(state.passengers, 4);
    results.push({ test: `capacity_${maxPassengers}`, status: "pass", members: state.memberCount, passengers: state.passengers });
  }

  const fullFixture = await createFixture({ label: "full", maxPassengers: 4, passengers: [4], shareable: false });
  const fullUser = await createUser("full");
  const beforeFullRequests = (await query("transport_requests", "id,site_user_id")).filter(item => item.site_user_id === fullUser.id).length;
  const fullPreview = await callHandler(preview, fullUser.id, joinPayload(fullFixture));
  const fullSubmit = await callHandler(submit, fullUser.id, joinPayload(fullFixture));
  assert.equal(fullPreview.body.data?.evaluation?.joinable, false);
  assert.equal(fullSubmit.status, 409);
  assert.equal(fullSubmit.body.error.code, "transport_join_group_not_open");
  const afterFullRequests = (await query("transport_requests", "id,site_user_id")).filter(item => item.site_user_id === fullUser.id).length;
  assert.equal(afterFullRequests, beforeFullRequests);
  results.push({ test: "full_rejection", status: "pass" });

  const occupiedFixture = await createFixture({ label: "occupied", maxPassengers: 4, passengers: [3], shareable: false });
  const waitingUser = await createUser("waiting");
  const occupyingUser = await createUser("occupying");
  const waitingPayload = joinPayload(occupiedFixture);
  const waitingPreview = await callHandler(preview, waitingUser.id, waitingPayload);
  assert.equal(waitingPreview.body.data.evaluation.joinable, true);
  const occupyingSubmit = await callHandler(submit, occupyingUser.id, joinPayload(occupiedFixture));
  assert.equal(occupyingSubmit.status, 201);
  created.requests.push(occupyingSubmit.body.data.requestId);
  const waitingSubmit = await callHandler(submit, waitingUser.id, waitingPayload);
  assert.equal(waitingSubmit.status, 409);
  assert.ok(waitingSubmit.body.error.code);
  const waitingRequests = (await query("transport_requests", "id,site_user_id")).filter(item => item.site_user_id === waitingUser.id);
  assert.equal(waitingRequests.length, 0);
  results.push({ test: "preview_then_seat_taken", status: "pass" });

  const raceFixture = await createFixture({ label: "race", maxPassengers: 4, passengers: [3], shareable: false });
  const raceUserA = await createUser("raceA");
  const raceUserB = await createUser("raceB");
  const raceResponses = await Promise.all([
    callHandler(submit, raceUserA.id, joinPayload(raceFixture)),
    callHandler(submit, raceUserB.id, joinPayload(raceFixture))
  ]);
  for (const response of raceResponses) if (response.status === 201) created.requests.push(response.body.data.requestId);
  const raceState = await groupState(raceFixture);
  const raceSuccesses = raceResponses.filter(item => item.status === 201).length;
  assert.ok(raceSuccesses <= 1, "at most one final-seat join may succeed");
  assert.equal(raceState.passengers <= 4, true);
  assert.equal(raceState.members.length, 1 + raceSuccesses);
  results.push({ test: "concurrent_last_seat", status: "pass", successes: raceSuccesses, responses: raceResponses.map(item => item.status), members: raceState.memberCount, passengers: raceState.passengers });

  for (const [serviceType, contenderCount] of [["pickup", 3], ["dropoff", 5]]) {
    const multiFixture = await createFixture({ label: `multi${serviceType}`, serviceType, maxPassengers: 4, passengers: [3], shareable: false });
    const users = [];
    for (let index = 0; index < contenderCount; index += 1) users.push(await createUser(`multi${serviceType}${index}`));
    const responses = await Promise.all(users.map(user => callHandler(submit, user.id, joinPayload(multiFixture))));
    for (const response of responses) if (response.status === 201) created.requests.push(response.body.data.requestId);
    const state = await groupState(multiFixture);
    assert.equal(responses.filter(item => item.status === 201).length, 1);
    assert.equal(responses.filter(item => item.status === 409).length, contenderCount - 1);
    assert.equal(responses.filter(item => item.status === 400).length, 0);
    assert.equal(responses.filter(item => item.status === 500).length, 0);
    assert.equal(responses.filter(item => item.status === 409).every(item => Boolean(item.body.error?.code)), true);
    assert.equal(state.memberCount, 2);
    assert.equal(state.passengers, 4);
    results.push({ test: `multi_${serviceType}_${contenderCount}`, statuses: responses.map(item => item.status), members: state.memberCount, passengers: state.passengers });
  }

  const sameIdFixture = await createFixture({ label: "sameid", maxPassengers: 5, passengers: [3], shareable: false });
  const sameIdUser = await createUser("sameid");
  const sameIdPayload = { ...joinPayload(sameIdFixture), submission_id: crypto.randomUUID() };
  const sameIdResponses = await Promise.all([
    callHandler(submit, sameIdUser.id, sameIdPayload),
    callHandler(submit, sameIdUser.id, sameIdPayload)
  ]);
  const sameIdSuccessful = sameIdResponses.filter(item => [200, 201].includes(item.status));
  assert.equal(sameIdSuccessful.length, 2);
  assert.deepEqual(new Set(sameIdSuccessful.map(item => item.body.data.requestId)).size, 1);
  assert.deepEqual(sameIdResponses.map(item => item.status).sort(), [200, 201]);
  const sameIdRequestId = sameIdSuccessful[0].body.data.requestId;
  created.requests.push(sameIdRequestId);
  const sameIdReplay = await callHandler(submit, sameIdUser.id, sameIdPayload);
  assert.equal(sameIdReplay.status, 200);
  assert.equal(sameIdReplay.body.data.requestId, sameIdRequestId);
  const sameIdConflict = await callHandler(submit, sameIdUser.id, { ...sameIdPayload, flight_no: "CHANGED" });
  assert.equal(sameIdConflict.status, 409);
  const sameIdState = await groupState(sameIdFixture);
  assert.equal(sameIdState.memberCount, 2);
  assert.equal(sameIdState.passengers, 4);
  results.push({ test: "same_submission_id", statuses: sameIdResponses.map(item => item.status), replay: sameIdReplay.status, conflict: sameIdConflict.status, requests: 1, members: sameIdState.memberCount, passengers: sameIdState.passengers });

  const timeoutFixture = await createFixture({ label: "timeout", maxPassengers: 5, passengers: [3], shareable: false });
  const timeoutUser = await createUser("timeout");
  const timeoutPayload = { ...joinPayload(timeoutFixture), submission_id: crypto.randomUUID() };
  await callHandler(submit, timeoutUser.id, timeoutPayload); // Deliberately discard the first response.
  const timeoutRetry = await callHandler(submit, timeoutUser.id, timeoutPayload);
  assert.equal(timeoutRetry.status, 200);
  created.requests.push(timeoutRetry.body.data.requestId);
  const timeoutState = await groupState(timeoutFixture);
  assert.equal(timeoutState.memberCount, 2);
  assert.equal(timeoutState.passengers, 4);
  results.push({ test: "discarded_response_retry", retry: 200, members: timeoutState.memberCount, passengers: timeoutState.passengers });

  const updateFixture = await createFixture({ label: "updates", maxPassengers: 5, passengers: [2, 1], shareable: false });
  const updateMembers = await supabase.from("transport_group_members").select("id,request_id,passenger_count_snapshot").eq("group_id", updateFixture.group.group_id).order("created_at");
  if (updateMembers.error) throw updateMembers.error;
  const updateId = updateMembers.data[0].id;
  let updateResult = await supabase.from("transport_group_members").update({ passenger_count_snapshot: 3 }).eq("id", updateId);
  if (updateResult.error) throw updateResult.error;
  updateResult = await supabase.from("transport_group_members").update({ passenger_count_snapshot: 5 }).eq("id", updateId);
  assert.ok(updateResult.error && updateResult.error.message.includes("transport_group_capacity_exceeded"));
  let updatedRow = await supabase.from("transport_group_members").select("passenger_count_snapshot").eq("id", updateId).single();
  assert.equal(updatedRow.data.passenger_count_snapshot, 3);
  updateResult = await supabase.from("transport_group_members").update({ passenger_count_snapshot: 1 }).eq("id", updateId);
  if (updateResult.error) throw updateResult.error;
  updatedRow = await supabase.from("transport_group_members").select("passenger_count_snapshot").eq("id", updateId).single();
  assert.equal(updatedRow.data.passenger_count_snapshot, 1);
  const deleteId = updateMembers.data[1].id;
  const deleteResult = await supabase.from("transport_group_members").delete().eq("id", deleteId);
  if (deleteResult.error) throw deleteResult.error;
  results.push({ test: "member_update_delete", legalIncrease: 3, rejectedIncrease: 5, decrease: 1, delete: "pass" });

  const inactiveFixture = await createFixture({ label: "inactive", maxPassengers: 10, passengers: [1, 2, 3], shareable: false });
  const inactiveRequestIds = inactiveFixture.requests.map(item => item.id);
  let statusUpdate = await supabase.from("transport_requests").update({ status: "closed" }).eq("id", inactiveRequestIds[1]);
  if (statusUpdate.error) throw statusUpdate.error;
  statusUpdate = await supabase.from("transport_requests").update({ status: "closed" }).eq("id", inactiveRequestIds[2]);
  if (statusUpdate.error) throw statusUpdate.error;
  const inactiveUser = await createUser("inactive");
  const inactivePreview = await callHandler(preview, inactiveUser.id, joinPayload(inactiveFixture));
  assert.equal(inactivePreview.status, 200);
  assert.equal(inactivePreview.body.data.evaluation.currentPassengerCount, 1);
  const inactiveMembersResult = await supabase.from("transport_group_members")
    .select("request_id,passenger_count_snapshot,luggage_count_snapshot,transport_requests(id,status,passenger_count,luggage_count,terminal,flight_no,flight_datetime,airport_code,notes)")
    .eq("group_id", inactiveFixture.group.group_id);
  if (inactiveMembersResult.error) throw inactiveMembersResult.error;
  const inactiveStats = buildGroupStats(inactiveFixture.group, inactiveMembersResult.data);
  assert.equal(inactiveStats.current_passenger_count, 1);
  const inactiveBoard = boardTest.mapBoardItem({
    ...inactiveFixture.requests[0],
    group_id: inactiveFixture.group.group_id,
    group_status: "active",
    group_visible_on_frontend: true,
    flight_time_reference: inactiveFixture.flightTime
  }, new Map([[inactiveFixture.group.group_id, inactiveMembersResult.data]]), inactiveStats);
  assert.equal(inactiveBoard.current_passenger_count, 1);
  let inactiveView = await supabase.from("transport_groups_public_view")
    .select("member_request_count,current_passenger_count,current_luggage_count,remaining_passenger_count")
    .eq("group_id", inactiveFixture.group.group_id).single();
  if (inactiveView.error) throw inactiveView.error;
  assert.equal(Number(inactiveView.data.member_request_count), 1);
  assert.equal(Number(inactiveView.data.current_passenger_count), 1);
  const inactiveSubmit = await callHandler(submit, inactiveUser.id, joinPayload(inactiveFixture));
  assert.equal(inactiveSubmit.status, 201);
  created.requests.push(inactiveSubmit.body.data.requestId);
  inactiveView = await supabase.from("transport_groups_public_view").select("current_passenger_count").eq("group_id", inactiveFixture.group.group_id).single();
  assert.equal(Number(inactiveView.data.current_passenger_count), 2);
  statusUpdate = await supabase.from("transport_requests").update({ status: "matched" }).in("id", [inactiveRequestIds[1], inactiveRequestIds[2]]);
  if (statusUpdate.error) throw statusUpdate.error;
  inactiveView = await supabase.from("transport_groups_public_view").select("current_passenger_count").eq("group_id", inactiveFixture.group.group_id).single();
  assert.equal(Number(inactiveView.data.current_passenger_count), 7);
  results.push({
    test: "inactive_request_count_consistency",
    closed: "database-tested",
    cancelled: "static-only: canonical Request status constraint normalizes cancelled to closed",
    preview: 1,
    stats: 1,
    board: 1,
    view: 1,
    afterSubmit: 2,
    restored: 7
  });

  for (const scenario of [
    { label: "statefull", patch: { status: "full" }, code: "transport_join_group_not_open" },
    { label: "stateclosed", patch: { status: "closed" }, code: "transport_join_group_not_open" },
    { label: "statecancelled", patch: { status: "cancelled" }, code: "transport_join_group_not_open" },
    { label: "statehidden", patch: { visible_on_frontend: false }, code: "transport_join_group_hidden" },
    { label: "stateexpired", patch: { flight_time_reference: new Date(Date.now() - 60000).toISOString() }, code: "transport_join_group_expired" }
  ]) {
    const stateFixture = await createFixture({ label: scenario.label, maxPassengers: 5, passengers: [3], shareable: false });
    const groupPatch = await supabase.from("transport_groups").update(scenario.patch).eq("id", stateFixture.group.id);
    if (groupPatch.error) throw groupPatch.error;
    stateFixture.group = { ...stateFixture.group, ...scenario.patch };
    const stateUser = await createUser(scenario.label);
    const stateResponse = await callHandler(submit, stateUser.id, joinPayload(stateFixture));
    assert.equal(stateResponse.status, 409, `${scenario.label} must return 409`);
    assert.equal(stateResponse.body.error.code, scenario.code);
    const stateRequests = (await query("transport_requests", "id,site_user_id")).filter(item => item.site_user_id === stateUser.id);
    assert.equal(stateRequests.length, 0);
    results.push({ test: scenario.label, response: 409, code: scenario.code });
  }

  const invalidResponse = await callHandler(submit, inactiveUser.id, { passenger_count: 1 });
  assert.equal(invalidResponse.status, 400);
  results.push({ test: "invalid_input", response: 400 });

  const moveSource = await createFixture({ label: "movesource", maxPassengers: 4, passengers: [1], shareable: false });
  const moveTarget = await createFixture({ label: "movetarget", maxPassengers: 4, passengers: [1], shareable: false });
  const sourceMember = await supabase.from("transport_group_members").select("id").eq("group_id", moveSource.group.group_id).single();
  let moveResult = await supabase.from("transport_group_members").update({ group_id: moveTarget.group.group_id }).eq("id", sourceMember.data.id);
  if (moveResult.error) throw moveResult.error;
  let movedRows = await supabase.from("transport_group_members").select("id,group_id").eq("id", sourceMember.data.id).single();
  assert.equal(movedRows.data.group_id, moveTarget.group.group_id);
  moveResult = await supabase.from("transport_group_members").update({ group_id: moveSource.group.group_id }).eq("id", sourceMember.data.id);
  if (moveResult.error) throw moveResult.error;

  const blockedMoveSource = await createFixture({ label: "moveblockedsource", maxPassengers: 4, passengers: [2], shareable: false });
  const blockedMoveTarget = await createFixture({ label: "moveblockedtarget", maxPassengers: 2, passengers: [1], shareable: false });
  const blockedMember = await supabase.from("transport_group_members").select("id").eq("group_id", blockedMoveSource.group.group_id).single();
  moveResult = await supabase.from("transport_group_members").update({ group_id: blockedMoveTarget.group.group_id }).eq("id", blockedMember.data.id);
  assert.ok(moveResult.error?.message.includes("transport_group_capacity_exceeded"));
  movedRows = await supabase.from("transport_group_members").select("id,group_id").eq("id", blockedMember.data.id).single();
  assert.equal(movedRows.data.group_id, blockedMoveSource.group.group_id);
  results.push({ test: "member_cross_group_update", legalMove: "pass", overCapacityMove: "rejected", originalRowPreserved: true });

  const { addRequestToGroup } = require("../api/_lib/transport-group-lifecycle");
  const backgroundFixture = await createFixture({ label: "backgroundrace", maxPassengers: 4, passengers: [3], shareable: false });
  const backgroundRequest = await createStandaloneRequest(backgroundFixture, "backgroundrace", 1);
  const backgroundUser = await createUser("backgroundrace");
  const [backgroundApi, backgroundWrite] = await Promise.allSettled([
    callHandler(submit, backgroundUser.id, joinPayload(backgroundFixture)),
    addRequestToGroup(supabase, backgroundFixture.group.group_id, backgroundRequest)
  ]);
  if (backgroundApi.status === "fulfilled" && backgroundApi.value.status === 201) created.requests.push(backgroundApi.value.body.data.requestId);
  const backgroundMembers = await supabase.from("transport_group_members").select("request_id,passenger_count_snapshot").eq("group_id", backgroundFixture.group.group_id);
  const backgroundPassengers = backgroundMembers.data.reduce((sum, item) => sum + Number(item.passenger_count_snapshot), 0);
  assert.equal(backgroundMembers.data.length, 2);
  assert.equal(backgroundPassengers, 4);
  assert.equal([backgroundApi, backgroundWrite].filter(item => item.status === "fulfilled" && (item.value?.status === 201 || item.value?.group_id)).length, 1);
  results.push({
    test: "rpc_vs_background_add",
    api: backgroundApi.status === "fulfilled" ? backgroundApi.value.status : "rejected",
    background: backgroundWrite.status,
    members: 2,
    passengers: 4,
    standaloneRequestRetainedIfBackgroundLost: backgroundWrite.status === "rejected"
  });

  const directFixture = await createFixture({ label: "directrace", maxPassengers: 4, passengers: [3], shareable: false });
  const directRequest = await createStandaloneRequest(directFixture, "directrace", 1);
  const directUser = await createUser("directrace");
  const [directApi, directWrite] = await Promise.allSettled([
    callHandler(submit, directUser.id, joinPayload(directFixture)),
    supabase.from("transport_group_members").insert({
      group_id: directFixture.group.group_id,
      request_id: directRequest.id,
      passenger_count_snapshot: 1,
      luggage_count_snapshot: 1,
      is_initiator: false
    }).then(result => { if (result.error) throw result.error; return result; })
  ]);
  if (directApi.status === "fulfilled" && directApi.value.status === 201) created.requests.push(directApi.value.body.data.requestId);
  const directMembers = await supabase.from("transport_group_members").select("request_id,passenger_count_snapshot").eq("group_id", directFixture.group.group_id);
  assert.equal(directMembers.data.length, 2);
  assert.equal(directMembers.data.reduce((sum, item) => sum + Number(item.passenger_count_snapshot), 0), 4);
  assert.equal([directApi, directWrite].filter(item => item.status === "fulfilled" && (item.value?.status === 201 || item.value)).length >= 1, true);
  assert.equal(directApi.status === "fulfilled" && directApi.value.status === 201 && directWrite.status === "fulfilled", false);
  results.push({ test: "rpc_vs_direct_insert", api: directApi.status === "fulfilled" ? directApi.value.status : "rejected", direct: directWrite.status, members: 2, passengers: 4 });

  const snapshotFixture = await createFixture({ label: "snapshotrace", maxPassengers: 4, passengers: [2, 1], shareable: false });
  const snapshotMember = await supabase.from("transport_group_members").select("id").eq("group_id", snapshotFixture.group.group_id).order("created_at").limit(1).single();
  const snapshotUser = await createUser("snapshotrace");
  const [snapshotApi, snapshotWrite] = await Promise.allSettled([
    callHandler(submit, snapshotUser.id, joinPayload(snapshotFixture)),
    supabase.from("transport_group_members").update({ passenger_count_snapshot: 3 }).eq("id", snapshotMember.data.id)
      .then(result => { if (result.error) throw result.error; return result; })
  ]);
  if (snapshotApi.status === "fulfilled" && snapshotApi.value.status === 201) created.requests.push(snapshotApi.value.body.data.requestId);
  const snapshotMembers = await supabase.from("transport_group_members").select("passenger_count_snapshot").eq("group_id", snapshotFixture.group.group_id);
  assert.equal(snapshotMembers.data.reduce((sum, item) => sum + Number(item.passenger_count_snapshot), 0), 4);
  assert.equal(snapshotApi.status === "fulfilled" && snapshotApi.value.status === 201 && snapshotWrite.status === "fulfilled", false);
  results.push({ test: "rpc_vs_snapshot_update", api: snapshotApi.status === "fulfilled" ? snapshotApi.value.status : "rejected", update: snapshotWrite.status, snapshotPassengers: 4 });

  const faultFixture = await createFixture({ label: "fault", maxPassengers: 5, passengers: [3], shareable: false });
  const faultUser = await createUser("fault");
  faultFunctionName = `qa_fail_member_${marker.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
  faultTriggerName = `aaa_${faultFunctionName}`;
  const faultSql = `create function public.${faultFunctionName}() returns trigger language plpgsql as $$ begin if exists (select 1 from public.transport_requests where id=new.request_id and notes like '${marker}%') then raise exception 'qa_forced_member_failure'; end if; return new; end $$; create trigger ${faultTriggerName} before insert on public.transport_group_members for each row execute function public.${faultFunctionName}();`;
  const installed = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: faultSql, encoding: "utf8" });
  if (installed.status !== 0) throw new Error(`fault injection install failed: ${installed.stderr}`);
  const faultBefore = await groupState(faultFixture);
  const faultResponse = await callHandler(submit, faultUser.id, joinPayload(faultFixture));
  assert.equal(faultResponse.status, 500);
  const faultRequests = (await query("transport_requests", "id,site_user_id")).filter(item => item.site_user_id === faultUser.id);
  assert.equal(faultRequests.length, 0);
  const faultAfter = await groupState(faultFixture);
  assert.deepEqual(faultAfter, faultBefore);
  const faultDropSql = `drop trigger ${faultTriggerName} on public.transport_group_members; drop function public.${faultFunctionName}();`;
  const faultDropped = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], { input: faultDropSql, encoding: "utf8" });
  if (faultDropped.status !== 0) throw new Error(`fault injection cleanup failed: ${faultDropped.stderr}`);
  faultTriggerName = "";
  faultFunctionName = "";
  results.push({ test: "forced_member_failure_rollback", response: 500, requests: 0, members: 0, groupUnchanged: true });

  const duplicateFixture = await createFixture({ label: "duplicate", maxPassengers: 5, passengers: [3], shareable: false });
  const duplicateUser = await createUser("duplicate");
  const duplicatePayload = joinPayload(duplicateFixture);
  const duplicateResponses = await Promise.all([
    callHandler(submit, duplicateUser.id, duplicatePayload),
    callHandler(submit, duplicateUser.id, duplicatePayload)
  ]);
  for (const response of duplicateResponses) if (response.status === 201) created.requests.push(response.body.data.requestId);
  const duplicateState = await groupState(duplicateFixture);
  const userRequests = (await query("transport_requests", "id,site_user_id,status")).filter(item => item.site_user_id === duplicateUser.id && ["published", "matched"].includes(item.status));
  results.push({ test: "rapid_duplicate", statuses: duplicateResponses.map(item => item.status), validRequests: userRequests.length, members: duplicateState.memberCount, passengers: duplicateState.passengers });
  assert.ok(duplicateResponses.filter(item => item.status === 201).length <= 1, "rapid duplicate submit created two successful responses");
  assert.ok(userRequests.length <= 1, "rapid duplicate submit created two valid orders");

  console.log(JSON.stringify({ marker, results }, null, 2));
}

(async () => {
  let failure = null;
  try {
    await main();
  } catch (error) {
    failure = error;
    console.error(JSON.stringify({ marker, results, failure: error.message }, null, 2));
  } finally {
    try {
      await cleanup();
      await assertQaZero();
      const after = await snapshotProtectedEmptyGroups();
      assert.deepEqual(after, protectedEmptyGroups, "protected non-QA empty Groups changed");
      console.log(JSON.stringify({ cleanup: "pass", qaRemaining: 0, protectedEmptyGroupsUnchanged: protectedEmptyGroups.length }, null, 2));
    } catch (cleanupError) {
      console.error(`cleanup failed: ${cleanupError.message}`);
      process.exitCode = 2;
      return;
    }
  }
  if (failure) process.exitCode = 1;
})();
