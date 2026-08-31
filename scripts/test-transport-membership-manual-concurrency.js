"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
function loadEnv() {
  for (const raw of fs.readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("="); if (at < 1) continue;
    const key = line.slice(0, at).trim(); const value = line.slice(at + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
  const url = new URL(process.env.LOCAL_SUPABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname));
}
loadEnv();

function client() {
  return createClient(process.env.LOCAL_SUPABASE_URL, process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

if (process.argv[2] === "worker") {
  client().rpc("admin_create_membership_transport_request_atomic", JSON.parse(process.env.QA_RPC_ARGS))
    .then(({ data, error }) => process.stdout.write(JSON.stringify({ data, error })))
    .catch(error => process.stdout.write(JSON.stringify({ error: { message: error.message } })));
  return;
}

const ids = {
  admins: ["a3000000-0000-4000-8000-000000000001", "a3000000-0000-4000-8000-000000000002"],
  advisor: "a3000000-0000-4000-8000-000000000003",
  members: ["b3000000-0000-4000-8000-000000000001", "b3000000-0000-4000-8000-000000000002", "b3000000-0000-4000-8000-000000000003"],
  entitlements: ["c3000000-0000-4000-8000-000000000001", "c3000000-0000-4000-8000-000000000002", "c3000000-0000-4000-8000-000000000003"],
  claims: ["d3000000-0000-4000-8000-000000000001", "d3000000-0000-4000-8000-000000000002", "d3000000-0000-4000-8000-000000000003"],
  existingRequest: "e3000000-0000-4000-8000-000000000001",
  group: "GRP-QAMANUAL-LAST"
};

function runWorker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [__filename, "worker"], { cwd: root, env: { ...process.env, QA_RPC_ARGS: JSON.stringify(args) }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", chunk => { out += chunk; }); child.stderr.on("data", chunk => { err += chunk; });
    child.on("exit", code => code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err || `worker ${code}`)));
  });
}

function args({ admin, key, member, entitlement, claim, flight, groupAction = "create_single", target = null }) {
  return {
    p_admin_user_id: admin, p_idempotency_key: key, p_payload_hash: `hash-${key}`, p_site_user_id: member,
    p_entitlement_id: entitlement, p_claim_id: claim,
    p_request: { service_type: "pickup", student_name: `QA ${member.slice(-1)}`, email: `qa${member.slice(-1)}@example.invalid`, phone: `+44700040000${member.slice(-1)}`, wechat: `qa_${member.slice(-1)}`, passenger_count: 1, luggage_count: 1, airport_code: "LHR", airport_name: "Heathrow Airport", terminal: "T2", flight_no: flight, flight_datetime: "2037-09-10T10:00:00Z", preferred_time_start: "2037-09-10T11:00:00Z", location_from: "Heathrow Airport", location_to: "Nottingham" },
    p_pricing: { membership_discount_amount: 0, extra_charge_amount: 0, final_price: 0, breakdown: {} },
    p_group_action: groupAction, p_target_group_id: target, p_reason: "concurrency test", p_confirm_contact_mismatch: true, p_confirm_duplicate: false
  };
}

async function main() {
  const db = client();
  const allAdmins = [...ids.admins, ids.advisor];
  async function cleanup() {
    const { data: qaOrders } = await db.from("transport_requests").select("id").or(`created_by_admin_id.in.(${ids.admins.join(",")}),id.eq.${ids.existingRequest}`);
    const requestIds = (qaOrders || []).map(row => row.id);
    let dynamicGroupIds = [];
    if (requestIds.length) {
      const { data: memberships } = await db.from("transport_group_members").select("group_id").in("request_id", requestIds);
      dynamicGroupIds = [...new Set((memberships || []).map(row => row.group_id).filter(Boolean))];
      await db.from("transport_group_members").delete().in("request_id", requestIds);
      await db.from("admin_operation_logs").delete().in("target_id", requestIds);
      await db.from("transport_membership_manual_operations").delete().in("request_id", requestIds);
      await db.from("transport_requests").delete().in("id", requestIds);
    }
    for (const groupId of dynamicGroupIds) {
      const { count } = await db.from("transport_group_members").select("id", { count: "exact", head: true }).eq("group_id", groupId);
      if (count === 0) await db.from("transport_groups").delete().eq("group_id", groupId);
    }
    await db.from("membership_audit_logs").delete().in("claim_id", ids.claims);
    await db.from("transport_groups").delete().eq("group_id", ids.group);
    await db.from("membership_benefit_claims").delete().in("id", ids.claims);
    await db.from("membership_entitlements").delete().in("id", ids.entitlements);
    await db.from("site_users").delete().in("id", ids.members);
    await db.from("admin_users").delete().in("id", allAdmins);
  }
  try {
    await cleanup();
    let result = await db.from("admin_users").insert(allAdmins.map((id, index) => ({ id, username: `qa_manual_conc_${index}`, name: `QA Manual Conc ${index}`, role: index === 2 ? "super_admin" : "operations_admin", status: "active", password_hash: "test" }))); if (result.error) throw result.error;
    result = await db.from("site_users").insert(ids.members.map((id, index) => ({ id, public_user_id: `QA-MAN-CONC-${index}`, nickname: `QA ${id.slice(-1)}`, email: `qa${id.slice(-1)}@example.invalid`, phone: `+44700040000${id.slice(-1)}`, wechat_id: `qa_${id.slice(-1)}` }))); if (result.error) throw result.error;
    result = await db.from("membership_entitlements").insert(ids.entitlements.map((id, index) => ({ id, site_user_id: ids.members[index], membership_cycle: `204${index}-4${index + 1}`, status: "active", valid_from: "2026-01-01", valid_until: "2049-12-31", advisor_admin_id: ids.advisor, created_by_admin_id: ids.admins[0], granted_by_admin_id: ids.admins[0] }))); if (result.error) throw result.error;
    result = await db.from("membership_benefit_claims").insert(ids.claims.map((id, index) => ({ id, entitlement_id: ids.entitlements[index], benefit_type: "pickup", status: "selected", selected_at: new Date().toISOString() }))); if (result.error) throw result.error;

    const sameClaim = await Promise.all([
      runWorker(args({ admin: ids.admins[0], key: "f3000000-0000-4000-8000-000000000001", member: ids.members[0], entitlement: ids.entitlements[0], claim: ids.claims[0], flight: "QA-CONC-CLAIM" })),
      runWorker(args({ admin: ids.admins[1], key: "f3000000-0000-4000-8000-000000000002", member: ids.members[0], entitlement: ids.entitlements[0], claim: ids.claims[0], flight: "QA-CONC-CLAIM" }))
    ]);
    assert.equal(sameClaim.filter(item => item.data).length, 1, JSON.stringify(sameClaim));

    result = await db.from("transport_requests").insert({ id: ids.existingRequest, order_no: "QA-MAN-LAST-SEAT", order_type: "pickup", business_date: "2037-09-10", site_user_id: null, service_type: "pickup", student_name: "Existing", phone: "+447000499999", passenger_count: 1, luggage_count: 0, airport_code: "LHR", airport_name: "Heathrow Airport", terminal: "T2", flight_no: "QA-EXIST", flight_datetime: "2037-09-10T10:00:00Z", location_from: "Heathrow Airport", location_to: "Nottingham", preferred_time_start: "2037-09-10T11:00:00Z", shareable: false, status: "matched", source: "admin_manual" }); if (result.error) throw result.error;
    result = await db.from("transport_groups").insert({ group_id: ids.group, service_type: "pickup", group_date: "2037-09-10", airport_code: "LHR", airport_name: "Heathrow Airport", terminal: "T2", location_from: "Heathrow Airport", location_to: "Nottingham", flight_time_reference: "2037-09-10T10:00:00Z", preferred_time_start: "2037-09-10T11:00:00Z", max_passengers: 2, visible_on_frontend: true, status: "single_member" }); if (result.error) throw result.error;
    result = await db.from("transport_group_members").insert({ group_id: ids.group, request_id: ids.existingRequest, passenger_count_snapshot: 1, luggage_count_snapshot: 0, is_initiator: true }); if (result.error) throw result.error;

    const finalSeat = await Promise.all([
      runWorker(args({ admin: ids.admins[0], key: "f3000000-0000-4000-8000-000000000003", member: ids.members[1], entitlement: ids.entitlements[1], claim: ids.claims[1], flight: "QA-LAST-A", groupAction: "join_existing", target: ids.group })),
      runWorker(args({ admin: ids.admins[1], key: "f3000000-0000-4000-8000-000000000004", member: ids.members[2], entitlement: ids.entitlements[2], claim: ids.claims[2], flight: "QA-LAST-B", groupAction: "join_existing", target: ids.group }))
    ]);
    assert.equal(finalSeat.filter(item => item.data).length, 1, JSON.stringify(finalSeat));
    const { data: members } = await db.from("transport_group_members").select("passenger_count_snapshot").eq("group_id", ids.group);
    assert.equal(members.reduce((sum, row) => sum + row.passenger_count_snapshot, 0), 2);
    console.log(JSON.stringify({ ok: true, same_claim: sameClaim.map(item => item.data ? "created" : item.error.code), final_seat: finalSeat.map(item => item.data ? "joined" : item.error.code), final_passengers: 2 }, null, 2));
  } finally { await cleanup(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
