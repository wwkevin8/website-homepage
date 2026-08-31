const assert = require("node:assert/strict");
const { releaseClaimOrderBinding } = require("../api/_lib/membership");
const membershipRoute = require("../api/transport-requests/[id]/membership");

function transportClaimReadMock() {
  let updateCalled = false;
  const result = {
    data: [{
      id: "d3000000-0000-4000-8000-000000000001",
      status: "reserved",
      linked_order_table: "transport_requests",
      linked_order_id: "e3000000-0000-4000-8000-000000000001"
    }],
    error: null
  };
  const builder = {
    select() { return this; },
    limit() { return this; },
    eq() { return this; },
    update() { updateCalled = true; return this; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return {
    client: { from() { return builder; } },
    wasUpdateCalled() { return updateCalled; }
  };
}

async function main() {
  const mock = transportClaimReadMock();
  await assert.rejects(
    () => releaseClaimOrderBinding(mock.client, {
      claim_id: "d3000000-0000-4000-8000-000000000001",
      order_table: "transport_requests"
    }),
    error => error?.code === "TRANSPORT_MEMBERSHIP_ATOMIC_UNLINK_REQUIRED"
  );
  assert.equal(mock.wasUpdateCalled(), false, "legacy transport unbind must not perform a one-sided update");

  const normalize = membershipRoute.__test.normalizeMembershipOperation;
  const normalized = normalize("e3000000-0000-4000-8000-000000000001", {
    action: "link",
    idempotency_key: "f3000000-0000-4000-8000-000000000001",
    entitlement_id: "c3000000-0000-4000-8000-000000000001",
    claim_id: "d3000000-0000-4000-8000-000000000001",
    expected_current_claim_id: null,
    reason: "explicit administrator confirmation",
    admin_user_id: "a3000000-0000-4000-8000-000000000098",
    membership_advisor_admin_id: "a3000000-0000-4000-8000-000000000099"
  });
  assert.equal(normalized.p_reason, "explicit administrator confirmation");
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "membership_advisor_admin_id"), false, "client advisor must be ignored");
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "admin_user_id"), false, "client administrator identity must be ignored");
  assert.throws(
    () => normalize("e3000000-0000-4000-8000-000000000001", {
      action: "unlink",
      idempotency_key: "f3000000-0000-4000-8000-000000000002",
      reason: ""
    }),
    /operation reason is required/
  );

  process.stdout.write("transport membership server guard assertions passed\n");
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
