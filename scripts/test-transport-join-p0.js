const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { buildJoinDraft, evaluateJoin } = require("../api/_lib/transport-join");
const { buildGroupStats } = require("../api/_lib/transport-group-stats");
const { _test: boardTest } = require("../public-api-handlers/transport-board");

const atomicJoinMigration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260828164011_transport_join_atomic_idempotency.sql"),
  "utf8"
);
const rpcJoinableStatusMatch = atomicJoinMigration.match(/if\s+v_group\.status\s+not\s+in\s*\(([^)]*)\)/i);
assert.ok(rpcJoinableStatusMatch, "atomic join RPC must expose an inspectable Group status allowlist");
const rpcJoinableStatuses = [...rpcJoinableStatusMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const jsJoinableStatuses = ["single_member", "active", "open"];
assert.deepEqual(rpcJoinableStatuses, jsJoinableStatuses, "JS evaluator and atomic RPC Group status allowlists must stay aligned");
for (const status of ["draft", "full", "closed", "cancelled"]) {
  assert.equal(rpcJoinableStatuses.includes(status), false, `${status} must not enter the atomic RPC allowlist`);
}

const publicGroupViewMigration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260828213000_transport_public_group_active_member_counts.sql"),
  "utf8"
);
const publicGroupViewSelect = publicGroupViewMigration.match(/create\s+or\s+replace\s+view\s+public\.transport_groups_public_view\s+as\s+select([\s\S]*?)from\s+public\.transport_groups\s+g/i)?.[1];
assert.ok(publicGroupViewSelect, "public Group view migration must keep an inspectable SELECT contract");
const normalizedPublicGroupViewSelect = publicGroupViewSelect.replace(/\s+/g, " ").trim();
const orderedPublicGroupViewExpressions = [
  "g.id as id", "g.group_id", "g.service_type", "g.group_date", "g.airport_code", "g.airport_name",
  "g.terminal", "g.location_from", "g.location_to", "g.flight_time_reference", "g.preferred_time_start",
  "g.preferred_time_end", "g.vehicle_type", "g.max_passengers", "g.visible_on_frontend", "g.status",
  "g.notes", "g.created_at", "g.updated_at", "as member_request_count", "as current_passenger_count",
  "as current_luggage_count", "as remaining_passenger_count"
];
let expressionOffset = -1;
for (const expression of orderedPublicGroupViewExpressions) {
  const nextOffset = normalizedPublicGroupViewSelect.toLowerCase().indexOf(expression, expressionOffset + 1);
  assert.ok(nextOffset > expressionOffset, `public Group view expression must appear in contract order: ${expression}`);
  expressionOffset = nextOffset;
}
assert.match(normalizedPublicGroupViewSelect, /^g\.id as id\s*,\s*g\.group_id\s*,/i, "public Group view must begin with UUID id followed by text group_id");
assert.doesNotMatch(normalizedPublicGroupViewSelect, /^g\.group_id\s+as\s+id\s*,/i, "group_id must never be aliased as the first id column");
for (const alias of ["member_request_count", "current_passenger_count", "current_luggage_count", "remaining_passenger_count"]) {
  assert.equal((normalizedPublicGroupViewSelect.match(new RegExp(`\\bas\\s+${alias}\\b`, "gi")) || []).length, 1, `${alias} must appear exactly once`);
}
assert.match(publicGroupViewMigration, /r\.status\s+not\s+in\s*\(\s*'closed'\s*,\s*'cancelled'\s*\)/i, "inactive Requests must be excluded from public Group aggregates");

const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

function request(id, passengerCount = 1, overrides = {}) {
  return {
    id,
    service_type: "pickup",
    airport_code: "LHR",
    airport_name: "Heathrow Airport",
    terminal: "T2",
    flight_datetime: future,
    location_from: "Heathrow Airport T2",
    location_to: "Nottingham",
    passenger_count: passengerCount,
    shareable: false,
    status: "matched",
    ...overrides
  };
}

function member(id, passengerCount = 1, overrides = {}) {
  const transportRequest = request(id, passengerCount, overrides);
  return {
    request_id: id,
    passenger_count_snapshot: passengerCount,
    transport_requests: transportRequest
  };
}

function group(maxPassengers = 5, overrides = {}) {
  return {
    group_id: "GRP-P0-TEST",
    status: "active",
    visible_on_frontend: true,
    max_passengers: maxPassengers,
    flight_time_reference: future,
    ...overrides
  };
}

function joinPayload(serviceType = "pickup", fallbackAccept = "接受", overrides = {}) {
  const isDropoff = serviceType === "dropoff";
  return {
    service_type: serviceType,
    airport_code: "LHR",
    airport_name: "Heathrow Airport",
    terminal: "T2",
    flight_datetime: future,
    location_from: isDropoff ? "Nottingham" : "Heathrow Airport T2",
    location_to: isDropoff ? "Heathrow Airport T2" : "Nottingham",
    passenger_count: 1,
    luggage_count: 1,
    fallback_accept: fallbackAccept,
    notes: `拼车失败是否接受包车或现有拼车人数：${fallbackAccept}`,
    ...overrides
  };
}

function evaluate({ serviceType = "pickup", maxPassengers = 5, members, groupOverrides = {}, targetOverrides = {}, payloadOverrides = {} }) {
  const typedMembers = members.map(item => ({
    ...item,
    transport_requests: {
      ...item.transport_requests,
      service_type: serviceType,
      location_from: serviceType === "dropoff" ? "Nottingham" : "Heathrow Airport T2",
      location_to: serviceType === "dropoff" ? "Heathrow Airport T2" : "Nottingham"
    }
  }));
  const targetRequest = {
    ...typedMembers[0].transport_requests,
    shareable: false,
    ...targetOverrides
  };
  return evaluateJoin({
    targetRequest,
    group: group(maxPassengers, { service_type: serviceType, ...groupOverrides }),
    activeMembers: typedMembers,
    joinPayload: joinPayload(serviceType, "接受", payloadOverrides),
    activeFutureRequests: []
  });
}

const threePeople = [member("request-c", 1), member("request-a", 1), member("request-b", 1)];

for (const serviceType of ["pickup", "dropoff"]) {
  const accepted = evaluate({ serviceType, members: threePeople, payloadOverrides: { fallback_accept: "接受" } });
  const rejectedFallback = evaluate({ serviceType, members: threePeople, payloadOverrides: { fallback_accept: "不接受" } });
  assert.equal(accepted.joinable, true, `${serviceType} must allow a public open group whose representative is non-shareable`);
  assert.deepEqual(rejectedFallback, accepted, `${serviceType} fallback preference must not change evaluation`);
}

const reordered = evaluate({ members: [...threePeople].reverse() });
const originalOrder = evaluate({ members: threePeople });
assert.deepEqual(reordered, originalOrder, "member query order must not change group joinability");
assert.equal(originalOrder.joinable, true, "all members may be non-shareable while their public open group remains joinable");
assert.equal(
  buildGroupStats(group(5), threePeople).join_target_request_id,
  buildGroupStats(group(5), [...threePeople].reverse()).join_target_request_id,
  "join_target_request_id must be deterministic across member query order"
);
assert.equal(
  evaluate({ members: threePeople, targetOverrides: { status: "closed", shareable: false } }).joinable,
  true,
  "technical target order status and shareable must not override an open group"
);

for (const status of jsJoinableStatuses) {
  assert.equal(evaluate({ members: threePeople, groupOverrides: { status } }).joinable, true, `${status} must be joinable`);
}
for (const status of ["draft", "full", "closed", "cancelled"]) {
  assert.equal(evaluate({ members: threePeople, groupOverrides: { status } }).joinable, false, `${status} must be blocked`);
}
assert.equal(evaluate({ members: threePeople, groupOverrides: { visible_on_frontend: false } }).joinable, false, "hidden group must be blocked");
assert.equal(evaluate({
  members: threePeople,
  groupOverrides: { flight_time_reference: new Date(Date.now() - 60_000).toISOString() }
}).joinable, false, "expired group must be blocked");

const inactiveMembers = [
  member("active-request", 2),
  member("closed-request", 4, { status: "closed" }),
  member("cancelled-request", 5, { status: "cancelled" })
];
const inactiveResult = evaluate({ members: inactiveMembers, maxPassengers: 4 });
assert.equal(inactiveResult.currentPassengerCount, 2, "closed and cancelled requests must not consume join capacity");
assert.equal(inactiveResult.remainingPassengerCount, 2);
assert.equal(inactiveResult.joinable, true);
assert.equal(evaluate({ members: threePeople, groupOverrides: { status: "full" } }).errorCode, "transport_join_group_not_open");
assert.equal(evaluate({ members: threePeople, groupOverrides: { status: "closed" } }).errorCode, "transport_join_group_not_open");
assert.equal(evaluate({ members: threePeople, groupOverrides: { visible_on_frontend: false } }).errorCode, "transport_join_group_hidden");
assert.equal(evaluate({
  members: threePeople,
  groupOverrides: { flight_time_reference: new Date(Date.now() - 60_000).toISOString() }
}).errorCode, "transport_join_group_expired");

for (const maxPassengers of [4, 5, 6]) {
  const result = evaluate({ members: threePeople, maxPassengers });
  const stats = buildGroupStats(group(maxPassengers), threePeople);
  assert.equal(result.maxPassengerCount, maxPassengers);
  assert.equal(result.currentPassengerCount, 3);
  assert.equal(result.remainingPassengerCount, maxPassengers - 3);
  assert.equal(stats.max_passengers, maxPassengers);
  assert.equal(stats.current_passenger_count, 3);
  assert.equal(stats.remaining_passenger_count, maxPassengers - 3);
}

assert.equal(evaluate({ members: threePeople, maxPassengers: 4, payloadOverrides: { passenger_count: 2 } }).joinable, false, "join must not exceed max_passengers");

const previewSnapshot = evaluate({ members: threePeople, maxPassengers: 4 });
const submitSnapshotAfterSeatTaken = evaluate({ members: [...threePeople, member("request-d", 1)], maxPassengers: 4 });
assert.equal(previewSnapshot.joinable, true, "preview may allow the last seat");
assert.equal(submitSnapshotAfterSeatTaken.joinable, false, "submit re-evaluation must reject after the last seat is taken");

const draftAccept = buildJoinDraft(joinPayload("pickup", "接受"), { nickname: "Test", email: "test@example.com" });
const draftReject = buildJoinDraft(joinPayload("pickup", "不接受"), { nickname: "Test", email: "test@example.com" });
assert.equal(draftAccept.shareable, true);
assert.equal(draftReject.shareable, true);

const boardMembers = threePeople.map((item, index) => ({
  ...item,
  transport_requests: {
    ...item.transport_requests,
    shareable: false,
    terminal: "T2",
    flight_no: `QA${index + 1}`,
    luggage_count: 1,
    notes: ""
  }
}));
const boardGroup = group(5);
const boardStats = buildGroupStats(boardGroup, boardMembers);
const boardSource = {
  ...boardMembers[0].transport_requests,
  group_id: boardGroup.group_id,
  group_status: "active",
  group_visible_on_frontend: true,
  flight_time_reference: future
};
const boardItem = boardTest.mapBoardItem(boardSource, new Map([[boardGroup.group_id, boardMembers]]), boardStats);
assert.equal(boardItem.current_passenger_count, 3, "board uses the shared active-member count");
assert.equal(boardItem.remaining_passenger_count, 2, "board uses the group's actual capacity");
assert.equal(boardItem.joinable, true, "all non-shareable members cannot block a public open group");

const publicSourceRows = boardTest.filterPublicSourceRows([
  { id: "group-member", group_id: boardGroup.group_id, shareable: false },
  { id: "private-standalone", group_id: null, shareable: false },
  { id: "public-standalone", group_id: null, shareable: true }
]);
assert.deepEqual(publicSourceRows.map(item => item.id), ["group-member", "public-standalone"], "group members bypass request shareable while private standalone requests remain hidden");

for (const rows of [boardMembers, [...boardMembers].reverse()]) {
  const result = boardTest.dedupeGroupedBoardItems(rows.map(item => ({
    id: item.request_id,
    group_id: boardGroup.group_id,
    join_target_request_id: boardStats.join_target_request_id
  })));
  assert.equal(result.length, 1);
  assert.equal(result[0].id, boardStats.join_target_request_id, "member order cannot change the board target");
}

for (const status of ["closed", "cancelled", "full"]) {
  assert.equal(boardTest.isPublicJoinableGroup({ ...boardSource, group_status: status }, 2), false, `${status} board group must not be joinable`);
}
assert.equal(boardTest.isPublicJoinableGroup({ ...boardSource, group_visible_on_frontend: false }, 2), false, "hidden board group must not be joinable");
assert.equal(boardTest.isPublicJoinableGroup({ ...boardSource, flight_time_reference: new Date(Date.now() - 60_000).toISOString() }, 2), false, "expired board group must not be joinable");
assert.equal(boardTest.isPublicJoinableGroup(boardSource, 0), false, "full board group must not be joinable");

for (const maxPassengers of [4, 5, 6]) {
  const capacityStats = buildGroupStats(group(maxPassengers), boardMembers);
  const capacityItem = boardTest.mapBoardItem(boardSource, new Map([[boardGroup.group_id, boardMembers]]), capacityStats);
  assert.equal(capacityItem.current_passenger_count, 3);
  assert.equal(capacityItem.remaining_passenger_count, maxPassengers - 3, `board capacity ${maxPassengers} must stay exact`);
}

console.log("transport join P0 regression checks passed");
