const { getSupabaseAdmin } = require("../api/_lib/supabase");
const crypto = require("node:crypto");
const { created, ok, badRequest, parseJsonBody, methodNotAllowed, serverError, unauthorized, sendJson } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");
const { buildJoinDraft, evaluateJoin } = require("../api/_lib/transport-join");
const { getGroupByBusinessId, getGroupMembersWithRequests } = require("../api/_lib/transport-group-lifecycle");
const { sendTransportOrderSubmissionEmail } = require("../api/_lib/transport-order-submission-email");
const { logAdminOperation } = require("../api/_lib/orders");
const {
  calculateMembershipDiscount,
  getActiveClaim,
  getCurrentMembershipCycle
} = require("../api/_lib/membership");

function buildSubmissionHash(siteUserId, groupId, targetRequestId, joinDraft) {
  const normalized = {
    site_user_id: siteUserId,
    group_id: groupId,
    target_request_id: targetRequestId,
    service_type: joinDraft.service_type,
    airport_code: joinDraft.airport_code,
    airport_name: joinDraft.airport_name,
    terminal: joinDraft.terminal,
    location_from: joinDraft.location_from,
    location_to: joinDraft.location_to,
    flight_datetime: joinDraft.flight_datetime,
    passenger_count: joinDraft.passenger_count,
    luggage_count: joinDraft.luggage_count,
    student_name: joinDraft.student_name,
    email: joinDraft.email,
    phone: joinDraft.phone,
    wechat: joinDraft.wechat,
    flight_no: joinDraft.flight_no,
    notes: joinDraft.notes
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function sendJoinRpcError(res, error) {
  const message = String(error?.message || "");
  const conflicts = {
    transport_join_submission_conflict: "本次提交内容已发生变化，请重新开始提交。",
    transport_join_existing_future_request: "您已有同类型的未来有效订单。",
    transport_join_group_full: "当前拼车组已满。",
    transport_group_capacity_exceeded: "当前拼车组已满。",
    transport_join_group_not_open: "当前拼车组不可加入。",
    transport_join_group_hidden: "当前拼车组不可加入。",
    transport_join_group_expired: "当前拼车组服务时间已过。",
    transport_join_membership_claim_unavailable: "会员权益当前不可用。"
  };
  const conflictCode = Object.keys(conflicts).find(code => message.includes(code));
  if (conflictCode) {
    sendJson(res, 409, { data: null, error: { message: conflicts[conflictCode], code: conflictCode } });
    return;
  }
  if (message.includes("transport_join_invalid_") || message.includes("transport_join_target_not_found") || message.includes("transport_join_service_mismatch") || message.includes("transport_join_airport_mismatch")) {
    badRequest(res, "提交信息无效，请重新核对。", { code: message });
    return;
  }
  serverError(res, error);
}

function sendJoinEvaluationError(res, evaluation) {
  const inputErrorCodes = new Set([
    "transport_join_service_mismatch",
    "transport_join_airport_mismatch",
    "transport_join_invalid_date"
  ]);
  const payload = {
    data: null,
    error: {
      message: evaluation.reason,
      code: evaluation.errorCode || "transport_join_invalid_request"
    }
  };
  sendJson(res, inputErrorCodes.has(evaluation.errorCode) ? 400 : 409, payload);
}

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
    const evaluation = evaluateJoin({
      targetRequest,
      group,
      activeMembers: members,
      joinPayload: joinDraft,
      activeFutureRequests: []
    });

    if (!evaluation.joinable) {
      sendJoinEvaluationError(res, evaluation);
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
    const submissionId = String(body.submission_id || "").trim() || crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
      badRequest(res, "submission_id 格式无效。");
      return;
    }
    const payloadHash = buildSubmissionHash(siteUser.id, group.group_id, targetRequest.id, joinDraft);
    const rpcResult = await supabase.rpc("join_transport_group_atomic", {
      p_site_user_id: siteUser.id,
      p_submission_id: submissionId,
      p_payload_hash: payloadHash,
      p_target_request_id: targetRequest.id,
      p_request: joinDraft,
      p_membership_claim_id: membershipDiscount?.eligible ? membershipClaim.id : null,
      p_membership: membershipPatch
    });
    if (rpcResult.error) {
      sendJoinRpcError(res, rpcResult.error);
      return;
    }
    const atomicResult = rpcResult.data || {};
    const request = { ...joinDraft, id: atomicResult.request_id, order_no: atomicResult.order_no };

    await logFrontendJoinTimeRisk(supabase, {
      siteUser,
      request,
      targetRequest,
      group,
      evaluation
    });

    let submissionEmail = null;
    try {
      if (atomicResult.replayed) throw Object.assign(new Error("idempotent replay"), { skipEmail: true });
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
        skipped: Boolean(emailError?.skipEmail),
        error: emailError && emailError.message ? emailError.message : "Failed to send join confirmation email"
      };
    }

    const responsePayload = {
      requestId: request.id,
      orderNo: request.order_no,
      groupId: group.group_id,
      submissionId,
      idempotentReplay: Boolean(atomicResult.replayed),
      surchargeGbp: evaluation.surchargeGbp,
      nextPassengerCount: evaluation.nextPassengerCount,
      warnings: evaluation.warnings || [],
      timeDistanceMinutes: evaluation.timeDistanceMinutes ?? null,
      status: "matched",
      membershipBenefitClaimId: membershipDiscount?.eligible ? membershipClaim.id : null,
      membershipDiscountAmount: membershipDiscount?.membershipDiscountAmount || 0,
      extraChargeAmount: membershipDiscount?.extraChargeAmount || 0,
      finalPrice: membershipDiscount?.finalPrice ?? null,
      submissionEmail
    };
    if (atomicResult.replayed) ok(res, responsePayload);
    else created(res, responsePayload);
  } catch (error) {
    serverError(res, error);
  }
};
