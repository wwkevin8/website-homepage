"use strict";

const { getSupabaseAdmin } = require("./_lib/supabase");
const { requireAdminUser } = require("./_lib/admin-auth");
const { ok, badRequest, methodNotAllowed, serverError } = require("./_lib/http");
const { searchTransportMembershipMembers } = require("./_lib/transport-membership-admin");

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase, { roles: ["operations_admin", "super_admin"] });
  if (!adminUser) return;
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }
  try {
    ok(res, await searchTransportMembershipMembers(supabase, {
      search: req.query?.search,
      requestId: req.query?.request_id,
      purpose: req.query?.purpose === "manual_create" ? "manual_create" : "existing_order",
      page: req.query?.page,
      pageSize: req.query?.page_size
    }));
  } catch (error) {
    if (error?.code === "INVALID_MEMBER_SEARCH") {
      badRequest(res, error.message);
      return;
    }
    serverError(res, error);
  }
};
