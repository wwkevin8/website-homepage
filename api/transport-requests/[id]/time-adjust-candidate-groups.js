const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, methodNotAllowed, serverError, sendJson } = require("../../_lib/http");
const { findTimeAdjustCandidateGroups } = require("../../_lib/transport-group-lifecycle");

function isInvalidUuidError(error) {
  return Boolean(error?.message && error.message.includes("invalid input syntax for type uuid"));
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCandidateDateTime(value, fallback, field) {
  const source = firstQueryValue(value) || fallback;
  if (!source) {
    throw new Error(`${field} is required`);
  }
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} is invalid`);
  }
  return parsed.toISOString();
}

async function getRequestWithMemberships(supabase, id) {
  let result = await supabase
    .from("transport_requests")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (result.error && !isInvalidUuidError(result.error)) {
    throw result.error;
  }

  let data = result.error ? null : (Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null));

  if (!data) {
    result = await supabase
      .from("transport_requests")
      .select("*")
      .eq("order_no", id)
      .limit(1);

    if (result.error) {
      throw result.error;
    }

    data = Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  if (!data) {
    const error = new Error("request not found");
    error.statusCode = 404;
    throw error;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("transport_group_members")
    .select("id,group_id,request_id,is_initiator")
    .eq("request_id", data.id);

  if (membershipError) {
    throw membershipError;
  }

  return {
    ...data,
    transport_group_members: memberships || []
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";

  try {
    const request = await getRequestWithMemberships(supabase, id);
    const times = {
      flight_datetime: normalizeCandidateDateTime(req.query?.flight_datetime, request.flight_datetime, "flight_datetime"),
      preferred_time_start: normalizeCandidateDateTime(
        req.query?.preferred_time_start,
        request.preferred_time_start || request.flight_datetime,
        "preferred_time_start"
      )
    };
    const memberships = Array.isArray(request.transport_group_members) ? request.transport_group_members : [];
    const currentGroupIds = memberships.map(member => member.group_id).filter(Boolean);
    const candidateGroups = await findTimeAdjustCandidateGroups(supabase, request, times, {
      currentGroupIds
    });

    ok(res, {
      request_id: request.id,
      candidate_groups: candidateGroups
    });
  } catch (error) {
    if (error?.statusCode >= 400 && error.statusCode < 500) {
      sendJson(res, error.statusCode, {
        data: null,
        error: {
          message: error.message,
          details: error.details || null
        }
      });
      return;
    }
    if (["flight_datetime is required", "preferred_time_start is required", "flight_datetime is invalid", "preferred_time_start is invalid"].includes(error?.message)) {
      badRequest(res, error.message);
      return;
    }
    serverError(res, error);
  }
};
