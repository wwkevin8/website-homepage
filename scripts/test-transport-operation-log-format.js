"use strict";

const assert = require("assert/strict");
const { formatTransportOperationLogs } = require("../api/_lib/transport-operation-logs");

const ids = {
  userA: "11000000-0000-4000-8000-000000000001",
  userB: "11000000-0000-4000-8000-000000000002",
  entitlementA: "22000000-0000-4000-8000-000000000001",
  entitlementB: "22000000-0000-4000-8000-000000000002",
  entitlementC: "22000000-0000-4000-8000-000000000003",
  claimA: "33000000-0000-4000-8000-000000000001",
  claimB: "33000000-0000-4000-8000-000000000002",
  claimC: "33000000-0000-4000-8000-000000000003",
  advisor: "44000000-0000-4000-8000-000000000001",
  operator: "55000000-0000-4000-8000-000000000001"
};

const tables = {
  membership_benefit_claims: [
    { id: ids.claimA, entitlement_id: ids.entitlementA, site_user_id: ids.userA, membership_cycle: "2026-27", status: "selected", linked_order_no: null },
    { id: ids.claimB, entitlement_id: ids.entitlementB, site_user_id: ids.userB, membership_cycle: "2027-28", status: "reserved", linked_order_no: "PU-OLD" },
    { id: ids.claimC, entitlement_id: ids.entitlementC, site_user_id: ids.userA, membership_cycle: "2028-29", status: "reserved", linked_order_no: null }
  ],
  membership_entitlements: [
    { id: ids.entitlementA, site_user_id: ids.userA, membership_cycle: "2026-27", advisor_admin_id: ids.advisor },
    { id: ids.entitlementB, site_user_id: ids.userB, membership_cycle: "2027-28", advisor_admin_id: ids.advisor },
    { id: ids.entitlementC, site_user_id: ids.userA, membership_cycle: "2028-29", advisor_admin_id: ids.advisor }
  ],
  site_users: [
    { id: ids.userA, public_user_id: "MEM-A", nickname: "会员甲" },
    { id: ids.userB, public_user_id: "MEM-B", nickname: "会员乙" }
  ],
  admin_users: [
    { id: ids.advisor, name: "顾问王", username: "advisor_wang" }
  ]
};

const supabase = {
  from(table) {
    return {
      select() {
        return {
          async in(field, values) {
            return { data: (tables[table] || []).filter(row => values.includes(row[field])), error: null };
          }
        };
      }
    };
  }
};

function log(action, metadata = {}, beforeData = {}, afterData = {}) {
  return {
    id: `${action}-${Math.random()}`,
    action,
    before_data: beforeData,
    after_data: afterData,
    metadata,
    created_at: "2026-08-30T12:00:00Z",
    admin_user_id: ids.operator,
    admin_user: { id: ids.operator, name: "运营李" }
  };
}

async function main() {
  const source = [
    log("transport_membership_link", { new_claim_id: ids.claimA, entitlement_id: ids.entitlementA, advisor_snapshot_id: ids.advisor, reason: "忘记使用权益" }),
    log("transport_membership_unlink", { old_claim_id: ids.claimA, reason: "原会员关联错误" }, { claim: tables.membership_benefit_claims[0] }),
    log("transport_membership_replace", { old_claim_id: ids.claimA, new_claim_id: ids.claimC, entitlement_id: ids.entitlementC, advisor_snapshot_id: ids.advisor, reason: "更换周期" }),
    log("transport_membership_replace", { old_claim_id: ids.claimA, new_claim_id: ids.claimB, entitlement_id: ids.entitlementB, advisor_snapshot_id: ids.advisor, reason: "原会员选择错误" }),
    log("transport_membership_unlink", { old_claim_id: ids.claimB, confirmed_used: true, reason: "已使用权益关联纠错", historical_usage: { claim_id: ids.claimB, site_user_id: ids.userB, entitlement_id: ids.entitlementB, order_no: "PU-OLD" } }),
    log("transport_membership_unlink", { old_claim_id: ids.claimA, forced: true, reason: "解决关联冲突" }),
    log("transport_membership_future_action", { reason: "未来操作" }),
    log("update_transport_request", { changed_fields: [{ field: "admin_note", before: "旧", after: "新" }] })
  ];

  const formatted = await formatTransportOperationLogs(supabase, source);
  assert.match(formatted[0].display_summary, /已关联会员权益.*会员甲（MEM-A）.*2026-27.*顾问王/);
  assert.match(formatted[1].display_summary, /已解除会员权益关联.*会员甲（MEM-A）.*2026-27/);
  assert.match(formatted[2].display_summary, /已更换会员权益.*会员甲（MEM-A）.*2026-27 → 2028-29/);
  assert.match(formatted[3].display_summary, /已更换会员权益.*会员甲（MEM-A） → 会员乙（MEM-B）/);
  assert.equal(formatted[4].action_label, "已纠正已使用会员权益关联");
  assert.deepEqual(formatted[4].display_details.filter(item => ["原会员", "原订单", "原因"].includes(item.label)).map(item => item.label), ["原会员", "原订单", "原因"]);
  assert.equal(formatted[5].action_label, "已强制处理会员权益关联冲突");
  assert.equal(formatted[6].action_label, "会员权益信息已更新");
  assert.equal(formatted[7], source[7], "non-membership operation log was changed");
  assert.equal(formatted[0].action_code, "transport_membership_link");
  assert.equal(formatted[0].admin_user.name, "运营李");
  assert.equal(formatted[0].created_at, "2026-08-30T12:00:00Z");
  assert.equal(formatted[0].metadata.reason, "忘记使用权益");
  assert.equal(Object.prototype.hasOwnProperty.call(formatted[0], "before_data"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(formatted[0], "after_data"), false);
  const customerText = JSON.stringify(formatted);
  assert.equal(customerText.includes("[object Object]"), false);
  for (const uuid of [ids.claimA, ids.claimB, ids.claimC, ids.entitlementA, ids.entitlementB, ids.entitlementC]) {
    assert.equal(customerText.includes(uuid), false, `customer payload leaked ${uuid}`);
  }
  console.log("transport operation-log business formatting assertions passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
