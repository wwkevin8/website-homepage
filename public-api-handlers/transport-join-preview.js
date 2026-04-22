const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError, unauthorized } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");
const { buildJoinDraft, evaluateJoin } = require("../api/_lib/transport-join");
const { getGroupByBusinessId, getGroupMembersWithRequests } = require("../api/_lib/transport-group-lifecycle");

async function getTargetRequestContext(supabase, requestId) {
  const { data: request, error } = await supabase
    .from("transport_requests")
    .select("*, transport_group_members(*)")
    .eq("id", requestId)
    .single();

  if (error) {
    throw error;
  }

  const memberRelation = Array.isArray(request.transport_group_members)
    ? request.transport_group_members[0] || null
    : request.transport_group_members || null;
  const groupId = memberRelation?.group_id;
  if (!groupId) {
    throw new Error("Target transport order is missing a group.");
  }

  const group = await getGroupByBusinessId(supabase, groupId);
  const members = await getGroupMembersWithRequests(supabase, groupId);
  return { request, group, members };
}

async function listActiveFutureTransportRequests(supabase, siteUserId) {
  const { data, error } = await supabase
    .from("transport_requests")
    .select("id, service_type, order_no, flight_datetime")
    .eq("site_user_id", siteUserId)
    .in("status", ["published", "matched"])
    .gt("flight_datetime", new Date().toISOString())
    .order("flight_datetime", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录后再加入拼车。");
      return;
    }

    const profileState = getProfileCompletionState(siteUser);
    if (!profileState.isComplete) {
      badRequest(res, `资料未完善，请先补全${profileState.missingFields.join("、")}。`);
      return;
    }

    const body = await parseJsonBody(req);
    if (!body.target_request_id) {
      badRequest(res, "缺少目标订单。");
      return;
    }

    const { request, group, members } = await getTargetRequestContext(supabase, body.target_request_id);
    const joinDraft = buildJoinDraft({
      ...body,
      service_type: request.service_type,
      location_from: body.location_from || request.location_from,
      location_to: body.location_to || request.location_to
    }, siteUser);
    const activeTransportRequests = await listActiveFutureTransportRequests(supabase, siteUser.id);

    const evaluation = evaluateJoin({
      targetRequest: request,
      group,
      activeMembers: members.filter(item => item.transport_requests?.status !== "closed"),
      joinPayload: joinDraft,
      activeFutureRequests: activeTransportRequests
    });

    ok(res, {
      target: {
        requestId: request.id,
        groupId: group.group_id,
        airportCode: request.airport_code,
        airportName: request.airport_name,
        terminal: request.terminal,
        flightDatetime: request.flight_datetime,
        destinationCity: request.location_to,
        currentPassengerCount: evaluation.currentPassengerCount,
        remainingPassengerCount: evaluation.remainingPassengerCount
      },
      evaluation
    });
  } catch (error) {
    serverError(res, error);
  }
};
