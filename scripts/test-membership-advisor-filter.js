const assert = require("assert");
const { __membershipListTest } = require("../api/admin/[...action].js");

const {
  resolveMembershipEffectiveAdvisorId,
  filterMembershipEntitlements,
  paginateMembershipItems,
  loadAllMembershipAdvisorRows
} = __membershipListTest;

const activationCodes = new Map([
  ["code-d", { generated_by_admin_id: "advisor-d" }],
  ["code-empty", { generated_by_admin_id: null }]
]);

const entitlements = [
  { id: "direct", status: "active", advisor_admin_id: "advisor-a", created_by_admin_id: "advisor-b", granted_by_admin_id: "advisor-c", metadata: { activation_code_id: "code-d" } },
  { id: "created", status: "active", advisor_admin_id: null, created_by_admin_id: "advisor-b", granted_by_admin_id: "advisor-c", metadata: { activation_code_id: "code-d" } },
  { id: "granted", status: "active", advisor_admin_id: null, created_by_admin_id: null, granted_by_admin_id: "advisor-c", metadata: { activation_code_id: "code-d" } },
  { id: "activation", status: "active", advisor_admin_id: null, created_by_admin_id: null, granted_by_admin_id: null, metadata: { activation_code_id: "code-d" } },
  { id: "unassigned", status: "active", advisor_admin_id: null, created_by_admin_id: null, granted_by_admin_id: null, metadata: { activation_code_id: "code-empty" } },
  { id: "unused", status: "active", advisor_admin_id: "advisor-a", created_by_admin_id: null, granted_by_admin_id: null, metadata: {} }
];

const claims = [
  { id: "claim-direct", entitlement_id: "direct", benefit_type: "pickup", status: "selected" },
  { id: "claim-created", entitlement_id: "created", benefit_type: "storage", status: "used" },
  { id: "claim-granted", entitlement_id: "granted", benefit_type: "pickup", status: "reserved" },
  { id: "claim-activation", entitlement_id: "activation", benefit_type: "pickup", status: "used" },
  { id: "claim-unassigned", entitlement_id: "unassigned", benefit_type: "moving", status: "manual" }
];

assert.strictEqual(resolveMembershipEffectiveAdvisorId(entitlements[0], activationCodes), "advisor-a");
assert.strictEqual(resolveMembershipEffectiveAdvisorId(entitlements[1], activationCodes), "advisor-b");
assert.strictEqual(resolveMembershipEffectiveAdvisorId(entitlements[2], activationCodes), "advisor-c");
assert.strictEqual(resolveMembershipEffectiveAdvisorId(entitlements[3], activationCodes), "advisor-d");
assert.strictEqual(resolveMembershipEffectiveAdvisorId(entitlements[4], activationCodes), "");

const advisorA = filterMembershipEntitlements(entitlements, claims, activationCodes, { advisorFilter: "advisor-a" });
assert.deepStrictEqual(advisorA.items.map(item => item.id), ["direct", "unused"]);

const advisorB = filterMembershipEntitlements(entitlements, claims, activationCodes, { advisorFilter: "advisor-b" });
assert.deepStrictEqual(advisorB.items.map(item => item.id), ["created"]);

const unassigned = filterMembershipEntitlements(entitlements, claims, activationCodes, { advisorFilter: "unassigned" });
assert.deepStrictEqual(unassigned.items.map(item => item.id), ["unassigned"]);

const combined = filterMembershipEntitlements(entitlements, claims, activationCodes, {
  advisorFilter: "advisor-a",
  benefitType: "pickup",
  claimStatus: "selected"
});
assert.deepStrictEqual(combined.items.map(item => item.id), ["direct"]);

const unused = filterMembershipEntitlements(entitlements, claims, activationCodes, {
  advisorFilter: "advisor-a",
  displayStatus: "unused"
});
assert.deepStrictEqual(unused.items.map(item => item.id), ["unused"]);

assert.deepStrictEqual(paginateMembershipItems(entitlements, 99, 2).pagination, {
  page: 3,
  page_size: 2,
  total: 6,
  total_pages: 3
});
assert.deepStrictEqual(paginateMembershipItems([], 99, 20).pagination, {
  page: 1,
  page_size: 20,
  total: 0,
  total_pages: 0
});

async function verifyServerCapPagination() {
  const source = Array.from({ length: 2500 }, (_, index) => ({ id: index + 1 }));
  let requests = 0;
  const rows = await loadAllMembershipAdvisorRows(() => ({
    async range(from, to) {
      requests += 1;
      const serverCappedTo = Math.min(to, from + 399);
      return { data: source.slice(from, serverCappedTo + 1), error: null, count: source.length };
    }
  }), 1000);
  assert.strictEqual(rows.length, 2500);
  assert.strictEqual(new Set(rows.map(item => item.id)).size, 2500);
  assert.strictEqual(requests, 7);
}

verifyServerCapPagination()
  .then(() => console.log("Membership advisor filter checks passed."))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
