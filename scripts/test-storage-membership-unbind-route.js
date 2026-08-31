"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  handleStorageMembershipUnbind,
  isUuid,
  sendStorageUnbindError
} = require("../api/_lib/storage-membership-unbind");
const {
  createStorageMembershipUnbindRoute
} = require("../api/admin/membership-claims/[claimId]/unbind-order");

const ids = {
  admin: "a8000000-0000-4000-8000-000000000001",
  claim: "b8000000-0000-4000-8000-000000000001",
  order: "c8000000-0000-4000-8000-000000000001",
  key: "d8000000-0000-4000-8000-000000000001"
};

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value) { this.body = value ? JSON.parse(String(value)) : null; }
  };
}

function request(method = "POST", query = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.query = query;
  req.headers = {};
  return req;
}

function database({ rpcError = null } = {}) {
  const calls = { rpc: [] };
  return {
    calls,
    from(table) {
      assert.equal(table, "membership_benefit_claims");
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        async maybeSingle() {
          return { data: { id: ids.claim, benefit_type: "storage", status: "selected", linked_order_table: null, linked_order_id: null }, error: null };
        }
      };
      return builder;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return rpcError
        ? { data: null, error: rpcError }
        : { data: { claim_id: ids.claim, storage_order_id: ids.order }, error: null };
    }
  };
}

async function main() {
  assert.equal(isUuid(ids.claim), true);
  assert.equal(isUuid("not-a-uuid"), false);

  let res = responseRecorder();
  await handleStorageMembershipUnbind(request("GET"), res, { supabase: database() });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "POST");

  res = responseRecorder();
  await handleStorageMembershipUnbind(request(), res, {
    supabase: database(), adminUser: { id: ids.admin, role: "operations_admin" }, claimId: "bad", body: {}
  });
  assert.equal(res.statusCode, 400);

  const db = database();
  res = responseRecorder();
  await handleStorageMembershipUnbind(request(), res, {
    supabase: db,
    adminUser: { id: ids.admin, role: "operations_admin" },
    claimId: ids.claim,
    body: { idempotency_key: ids.key, expected_storage_order_id: ids.order, expected_claim_status: "reserved", reason: "QA route handler" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(db.calls.rpc.length, 1);
  assert.equal(db.calls.rpc[0].name, "admin_unbind_storage_membership_claim_atomic");
  assert.equal(db.calls.rpc[0].args.p_admin_user_id, ids.admin);

  res = responseRecorder();
  await handleStorageMembershipUnbind(request(), res, {
    supabase: database({ rpcError: { code: "23514", message: "claim is not a linked storage membership claim" } }),
    adminUser: { id: ids.admin, role: "operations_admin" }, claimId: ids.claim,
    body: { idempotency_key: ids.key, expected_storage_order_id: ids.order, expected_claim_status: "reserved", reason: "reject transport" }
  });
  assert.equal(res.statusCode, 400);

  res = responseRecorder();
  sendStorageUnbindError(res, { code: "23505", message: `idempotency key was already used ${ids.claim}` });
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.stringify(res.body).includes(ids.claim), false);

  let captured = null;
  const route = createStorageMembershipUnbindRoute({
    getSupabaseAdmin: () => "trusted-client",
    handleStorageMembershipUnbind: async (req, routeRes, options) => {
      captured = options;
      routeRes.statusCode = 204;
      routeRes.end();
    }
  });
  res = responseRecorder();
  await route(request("POST", { claimId: ids.claim }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(captured.claimId, ids.claim);
  assert.equal(captured.supabase, "trusted-client");

  console.log(JSON.stringify({ handler: "pass", explicit_route: "pass", method_405: "pass", dynamic_claim_id: "pass", internal_error_redaction: "pass" }));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
