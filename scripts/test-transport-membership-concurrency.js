const { spawn, spawnSync } = require("node:child_process");

const DB_CONTAINER = process.env.QA_DB_CONTAINER || "supabase_db_webside";
const requestIds = [
  "e2000000-0000-4000-8000-000000000001",
  "e2000000-0000-4000-8000-000000000002",
  "e2000000-0000-4000-8000-000000000003"
];
const userIds = [
  "b2000000-0000-4000-8000-000000000001",
  "b2000000-0000-4000-8000-000000000002"
];
const entitlementIds = [
  "c2000000-0000-4000-8000-000000000001",
  "c2000000-0000-4000-8000-000000000002"
];
const claimIds = [
  "d2000000-0000-4000-8000-000000000001",
  "d2000000-0000-4000-8000-000000000002"
];
const adminIds = [
  "a2000000-0000-4000-8000-000000000001",
  "a2000000-0000-4000-8000-000000000002",
  "a2000000-0000-4000-8000-000000000003"
];

function runSql(sql, allowFailure = false) {
  const result = spawnSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At"], {
    input: sql,
    encoding: "utf8"
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "local PostgreSQL command failed");
  }
  return result;
}

function runSqlConcurrent(sql) {
  return new Promise(resolve => {
    const child = spawn("docker", ["exec", "-i", DB_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At"]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(sql);
  });
}

function cleanup() {
  runSql(`
    delete from public.transport_membership_admin_operations where admin_user_id = any(array[${adminIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.admin_operation_logs where target_type = 'transport_request' and target_id = any(array[${requestIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.membership_audit_logs where site_user_id = any(array[${userIds.map(id => `'${id}'::uuid`).join(",")}]);
    update public.transport_requests set membership_benefit_claim_id = null where id = any(array[${requestIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.membership_benefit_claims where id = any(array[${claimIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.transport_requests where id = any(array[${requestIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.membership_entitlements where id = any(array[${entitlementIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.site_users where id = any(array[${userIds.map(id => `'${id}'::uuid`).join(",")}]);
    delete from public.admin_users where id = any(array[${adminIds.map(id => `'${id}'::uuid`).join(",")}]);
  `, true);
}

function rpcSql({ adminId, key, requestId, entitlementId, claimId, reason }) {
  return `select public.admin_manage_transport_membership_link(
    '${adminId}'::uuid, '${key}'::uuid, 'link', '${requestId}'::uuid,
    '${entitlementId}'::uuid, '${claimId}'::uuid, null, '${reason}', false, false
  );`;
}

async function main() {
  const container = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", DB_CONTAINER], { encoding: "utf8" });
  if (container.status !== 0 || container.stdout.trim() !== "true") {
    throw new Error(`Refusing to run: ${DB_CONTAINER} is not the confirmed local Supabase database container`);
  }
  cleanup();
  try {
    runSql(`
      insert into public.admin_users (id, username, name, role, status, password_hash) values
        ('${adminIds[0]}', 'qa_tm_conc_1', 'QA concurrency 1', 'operations_admin', 'active', 'not-a-login-hash'),
        ('${adminIds[1]}', 'qa_tm_conc_2', 'QA concurrency 2', 'operations_admin', 'active', 'not-a-login-hash'),
        ('${adminIds[2]}', 'qa_tm_conc_advisor', 'QA concurrency advisor', 'operations_admin', 'active', 'not-a-login-hash');
      insert into public.site_users (id, email, nickname) values
        ('${userIds[0]}', 'qa-tm-conc-a@example.invalid', 'QA concurrency A'),
        ('${userIds[1]}', 'qa-tm-conc-b@example.invalid', 'QA concurrency B');
      insert into public.membership_entitlements
        (id, site_user_id, membership_cycle, status, advisor_admin_id, valid_from, valid_until) values
        ('${entitlementIds[0]}', '${userIds[0]}', '2026-27', 'active', '${adminIds[2]}', current_date - 1, current_date + 30),
        ('${entitlementIds[1]}', '${userIds[1]}', '2027-28', 'active', '${adminIds[2]}', current_date - 1, current_date + 30);
      insert into public.membership_benefit_claims (id, entitlement_id, benefit_type, status, selected_at) values
        ('${claimIds[0]}', '${entitlementIds[0]}', 'pickup', 'selected', now()),
        ('${claimIds[1]}', '${entitlementIds[1]}', 'pickup', 'selected', now());
      insert into public.transport_requests
        (id, order_no, order_type, business_date, service_type, student_name, passenger_count, luggage_count,
         airport_code, airport_name, flight_datetime, location_from, location_to, shareable, status, source) values
        ('${requestIds[0]}', 'QA-TM-CONC-1', 'pickup', current_date, 'pickup', 'Concurrent claim A', 1, 0,
          'LHR', 'Heathrow', now() + interval '3 days', 'LHR', 'London', false, 'published', 'admin_manual'),
        ('${requestIds[1]}', 'QA-TM-CONC-2', 'pickup', current_date, 'pickup', 'Concurrent claim B', 1, 0,
          'LHR', 'Heathrow', now() + interval '4 days', 'LHR', 'London', false, 'published', 'admin_manual'),
        ('${requestIds[2]}', 'QA-TM-CONC-3', 'pickup', current_date, 'pickup', 'Concurrent order', 1, 0,
          'LHR', 'Heathrow', now() + interval '5 days', 'LHR', 'London', false, 'published', 'admin_manual');
    `);

    const sameClaim = await Promise.all([
      runSqlConcurrent(rpcSql({ adminId: adminIds[0], key: "f2000000-0000-4000-8000-000000000001", requestId: requestIds[0], entitlementId: entitlementIds[0], claimId: claimIds[0], reason: "concurrent same claim A" })),
      runSqlConcurrent(rpcSql({ adminId: adminIds[1], key: "f2000000-0000-4000-8000-000000000002", requestId: requestIds[1], entitlementId: entitlementIds[0], claimId: claimIds[0], reason: "concurrent same claim B" }))
    ]);
    if (sameClaim.filter(item => item.code === 0).length !== 1) {
      throw new Error(`same-claim race expected one winner: ${JSON.stringify(sameClaim)}`);
    }
    const claimReferenceCount = Number(runSql(`select count(*) from public.transport_requests where membership_benefit_claim_id = '${claimIds[0]}';`).stdout.trim());
    if (claimReferenceCount !== 1) throw new Error(`same claim was referenced by ${claimReferenceCount} orders`);

    runSql(`
      select public.admin_manage_transport_membership_link(
        '${adminIds[0]}', 'f2000000-0000-4000-8000-000000000003', 'unlink',
        (select id from public.transport_requests where membership_benefit_claim_id = '${claimIds[0]}'),
        null, null, '${claimIds[0]}', 'reset between concurrency cases', false, false
      );
    `);

    const sameOrder = await Promise.all([
      runSqlConcurrent(rpcSql({ adminId: adminIds[0], key: "f2000000-0000-4000-8000-000000000004", requestId: requestIds[2], entitlementId: entitlementIds[0], claimId: claimIds[0], reason: "concurrent same order A" })),
      runSqlConcurrent(rpcSql({ adminId: adminIds[1], key: "f2000000-0000-4000-8000-000000000005", requestId: requestIds[2], entitlementId: entitlementIds[1], claimId: claimIds[1], reason: "concurrent same order B" }))
    ]);
    if (sameOrder.filter(item => item.code === 0).length !== 1) {
      throw new Error(`same-order race expected one winner: ${JSON.stringify(sameOrder)}`);
    }
    const orderLinkCount = Number(runSql(`select count(*) from public.transport_requests where id = '${requestIds[2]}' and membership_benefit_claim_id is not null;`).stdout.trim());
    if (orderLinkCount !== 1) throw new Error("same-order race did not leave exactly one link");

    process.stdout.write("transport membership concurrency assertions passed\n");
  } finally {
    cleanup();
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
});
