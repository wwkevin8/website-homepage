const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { created, badRequest, parseJsonBody, methodNotAllowed, serverError, unauthorized } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");
const { buildJoinDraft, evaluateJoin } = require("../api/_lib/transport-join");
const { createRequestRecord, addRequestToGroup, getGroupByBusinessId, getGroupMembersWithRequests } = require("../api/_lib/transport-group-lifecycle");
const { sendTransportOrderSubmissionEmail } = require("../api/_lib/transport-order-submission-email");

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

    const { request: targetRequest, group, members } = await getTargetRequestContext(supabase, body.target_request_id);
    const joinDraft = buildJoinDraft({
      ...body,
      service_type: targetRequest.service_type,
      location_from: body.location_from || targetRequest.location_from,
      location_to: body.location_to || targetRequest.location_to
    }, siteUser);
    const activeTransportRequests = await listActiveFutureTransportRequests(supabase, siteUser.id);

    const evaluation = evaluateJoin({
      targetRequest,
      group,
      activeMembers: members.filter(item => item.transport_requests?.status !== "closed"),
      joinPayload: joinDraft,
      activeFutureRequests: activeTransportRequests
    });

    if (!evaluation.joinable) {
      badRequest(res, evaluation.reason, evaluation);
      return;
    }

    const request = await createRequestRecord(supabase, {
      ...joinDraft,
      site_user_id: siteUser.id,
      email_verified_snapshot: true,
      profile_verified_snapshot: true
    });

    try {
      await addRequestToGroup(supabase, group.group_id, request);
    } catch (error) {
      await supabase.from("transport_requests").delete().eq("id", request.id);
      throw error;
    }

    let submissionEmail = null;
    try {
      submissionEmail = await sendTransportOrderSubmissionEmail(req, {
        recipientEmail: siteUser.email || request.email,
        studentName: request.student_name || siteUser.nickname || "",
        orderNo: request.order_no,
        groupId: group.group_id,
        serviceType: request.service_type,
        airportName: request.airport_name,
        terminal: request.terminal,
        flightNo: request.flight_no,
        flightDatetime: request.flight_datetime,
        pickupDatetime: request.preferred_time_start || request.flight_datetime,
        destination: request.service_type === "dropoff" ? request.location_from : request.location_to
      });
    } catch (emailError) {
      submissionEmail = {
        skipped: false,
        error: emailError && emailError.message ? emailError.message : "Failed to send join confirmation email"
      };
    }

    created(res, {
      requestId: request.id,
      orderNo: request.order_no,
      groupId: group.group_id,
      surchargeGbp: evaluation.surchargeGbp,
      nextPassengerCount: evaluation.nextPassengerCount,
      status: "matched",
      submissionEmail
    });
  } catch (error) {
    serverError(res, error);
  }
};
