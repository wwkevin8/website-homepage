const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { created, badRequest, parseJsonBody, methodNotAllowed, serverError, unauthorized } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");
const { buildJoinDraft, evaluateJoin } = require("../api/_lib/transport-join");
const { createRequestRecord, addRequestToGroup, getGroupByBusinessId, getGroupMembersWithRequests } = require("../api/_lib/transport-group-lifecycle");
const { sendTransportOrderSubmissionEmail } = require("../api/_lib/transport-order-submission-email");
const { logAdminOperation } = require("../api/_lib/orders");
const {
  bindClaimToOrder,
  calculateMembershipDiscount,
  getActiveClaim,
  getCurrentMembershipCycle
} = require("../api/_lib/membership");

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

function hasTimeRiskWarning(evaluation) {
  return (evaluation?.warnings || []).some(warning => {
    return ["large_time_gap", "cross_midnight_date_mismatch"].includes(String(warning?.code || ""));
  });
}

function formatTimeDistance(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return null;
  return `${Math.round((value / 60) * 10) / 10} 小时`;
}

function formatContactSummary(request, siteUser) {
  return [
    request.student_name || siteUser?.nickname,
    request.phone || siteUser?.phone,
    request.wechat || siteUser?.wechat_id,
    request.email || siteUser?.email
  ].filter(Boolean).join(" / ");
}

async function logFrontendJoinTimeRisk(supabase, { siteUser, request, targetRequest, group, evaluation }) {
  if (!hasTimeRiskWarning(evaluation)) {
    return;
  }

  try {
    const orderTime = evaluation.orderTime || request.flight_datetime;
    const targetGroupTime = evaluation.targetGroupTime || group.flight_time_reference || targetRequest.flight_datetime;
    const distanceText = formatTimeDistance(evaluation.timeDistanceMinutes) || "未知";
    await logAdminOperation(supabase, {
      admin_user_id: null,
      target_type: "transport_request",
      target_id: request.id,
      action: "transport_frontend_join_time_risk_confirmed",
      before_data: {
        order_time: orderTime,
        target_group_time: targetGroupTime
      },
      after_data: {
        group_id: group.group_id,
        risk_confirmed: true
      },
      metadata: {
        operation_type: "前台加入",
        risk_confirmed: true,
        order_no: request.order_no,
        request_id: request.id,
        target_order_no: targetRequest.order_no || null,
        target_group_id: group.group_id,
        site_user_id: siteUser?.id || null,
        site_user_email: siteUser?.email || null,
        contact_summary: formatContactSummary(request, siteUser),
        original_order_time: orderTime,
        target_group_time: targetGroupTime,
        time_distance_minutes: evaluation.timeDistanceMinutes,
        time_distance_text: distanceText,
        warnings: evaluation.warnings || [],
        summary: `前台加入：订单时间 ${orderTime}，目标组时间 ${targetGroupTime}，时间差 ${distanceText}，风险提示已确认。`
      }
    });
  } catch (error) {
    console.warn("transport frontend join time-risk log failed", error?.message || error);
  }
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

    const membershipClaim = joinDraft.service_type === "pickup"
      ? await getActiveClaim(supabase, siteUser.id, getCurrentMembershipCycle())
      : null;
    const membershipDiscount = membershipClaim?.benefit_type === "pickup" && ["selected", "reserved"].includes(membershipClaim.status)
      ? calculateMembershipDiscount(joinDraft, membershipClaim)
      : null;
    const membershipPatch = membershipDiscount?.eligible
      ? {
          membership_benefit_claim_id: membershipClaim.id,
          membership_discount_amount: membershipDiscount.membershipDiscountAmount,
          extra_charge_amount: membershipDiscount.extraChargeAmount,
          final_price: membershipDiscount.finalPrice,
          membership_discount_breakdown_json: membershipDiscount.breakdown
        }
      : {};

    const request = await createRequestRecord(supabase, {
      ...joinDraft,
      ...membershipPatch,
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

    await logFrontendJoinTimeRisk(supabase, {
      siteUser,
      request,
      targetRequest,
      group,
      evaluation
    });

    let boundMembershipClaim = null;
    if (membershipDiscount?.eligible && membershipClaim?.id) {
      try {
        boundMembershipClaim = await bindClaimToOrder(
          supabase,
          membershipClaim.id,
          "transport_requests",
          request.id,
          request.order_no,
          membershipDiscount
        );
      } catch (bindError) {
        await supabase.from("transport_requests").delete().eq("id", request.id);
        badRequest(res, bindError.message || "Membership benefit is no longer available for this order");
        return;
      }
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
        pickupDatetime: request.flight_datetime,
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
      warnings: evaluation.warnings || [],
      timeDistanceMinutes: evaluation.timeDistanceMinutes ?? null,
      status: "matched",
      membershipBenefitClaimId: boundMembershipClaim?.id || null,
      membershipDiscountAmount: membershipDiscount?.membershipDiscountAmount || 0,
      extraChargeAmount: membershipDiscount?.extraChargeAmount || 0,
      finalPrice: membershipDiscount?.finalPrice ?? null,
      submissionEmail
    });
  } catch (error) {
    serverError(res, error);
  }
};
