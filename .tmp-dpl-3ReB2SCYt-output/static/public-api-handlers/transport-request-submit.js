const { getSupabaseAdmin } = require("../api/_lib/supabase");
const {
  created,
  badRequest,
  parseJsonBody,
  methodNotAllowed,
  serverError,
  unauthorized
} = require("../api/_lib/http");
const { mapRequestPayload } = require("../api/_lib/transport");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");
const { createPickupRequestWithGroup } = require("../api/_lib/transport-group-lifecycle");
const { sendTransportOrderSubmissionEmail } = require("../api/_lib/transport-order-submission-email");

const FLIGHT_NO_PATTERN = /^[A-Z0-9]{2,4}(?:[\s-]+)?\d{1,4}[A-Z]?$/i;
const ACTIVE_REQUEST_STATUSES = ["published", "matched"];

function validateFlightNumber(value) {
  const flightNo = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-");

  if (!flightNo) {
    throw new Error("请填写航班号。");
  }

  if (!FLIGHT_NO_PATTERN.test(flightNo)) {
    throw new Error("航班号格式不正确。");
  }

  return flightNo;
}

async function listActiveFutureTransportRequests(supabase, siteUserId) {
  const { data, error } = await supabase
    .from("transport_requests")
    .select("id, service_type, order_no, flight_datetime, airport_code, terminal, location_from, location_to")
    .eq("site_user_id", siteUserId)
    .in("status", ACTIVE_REQUEST_STATUSES)
    .gt("flight_datetime", new Date().toISOString())
    .order("flight_datetime", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function getServiceLabel(serviceType) {
  return serviceType === "dropoff" ? "送机" : "接机";
}

function isDuplicateActiveRequest(existing, payload) {
  const existingFlightTime = new Date(existing.flight_datetime).getTime();
  const nextFlightTime = new Date(payload.flight_datetime).getTime();

  return String(existing.service_type || "") === String(payload.service_type || "")
    && String(existing.airport_code || "").toUpperCase() === String(payload.airport_code || "").toUpperCase()
    && normalizeComparableText(existing.terminal) === normalizeComparableText(payload.terminal)
    && !Number.isNaN(existingFlightTime)
    && !Number.isNaN(nextFlightTime)
    && existingFlightTime === nextFlightTime
    && normalizeComparableText(existing.location_from) === normalizeComparableText(payload.location_from)
    && normalizeComparableText(existing.location_to) === normalizeComparableText(payload.location_to);
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
      unauthorized(res, "请先登录，再提交接送机表单。");
      return;
    }

    const profileState = getProfileCompletionState(siteUser);
    if (!profileState.isComplete) {
      badRequest(res, `资料未完善，请先补全：${profileState.missingFields.join("、")}。`);
      return;
    }

    const body = await parseJsonBody(req);
    let payload;

    try {
      payload = mapRequestPayload({
        ...body,
        flight_no: validateFlightNumber(body.flight_no),
        status: "published"
      });
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    const activeTransportRequests = await listActiveFutureTransportRequests(supabase, siteUser.id);
    const duplicateRequest = activeTransportRequests.find(item => isDuplicateActiveRequest(item, payload));

    if (duplicateRequest) {
      badRequest(
        res,
        `当前账号已存在相同的未来有效${getServiceLabel(payload.service_type)}单（${duplicateRequest.order_no}），请不要重复提交。`
      );
      return;
    }

    const sameTypeRequest = activeTransportRequests.find(item => item.service_type === payload.service_type);
    if (sameTypeRequest) {
      badRequest(
        res,
        `当前账号已存在一张未来有效${getServiceLabel(payload.service_type)}单（${sameTypeRequest.order_no}），同一账号同类服务一次只保留一张有效单。如需修改，请联系客服处理原订单。`
      );
      return;
    }

    if (activeTransportRequests.length >= 3) {
      badRequest(res, "当前账号最多只能同时保留 3 张未来有效订单（含接机和送机）。如需继续下单，请先取消或调整现有订单。");
      return;
    }

    if (!payload.phone || !siteUser.phone || !siteUser.wechat_id) {
      badRequest(res, "请先在个人资料里补全姓名、联系电话和微信号后再提交。");
      return;
    }

    const { request, group } = await createPickupRequestWithGroup(supabase, {
      ...payload,
      site_user_id: siteUser.id,
      email_verified_snapshot: true,
      profile_verified_snapshot: true
    });

    let submissionEmail = null;
    try {
      submissionEmail = await sendTransportOrderSubmissionEmail(req, {
        recipientEmail: siteUser.email,
        studentName: request.student_name || siteUser.nickname || "",
        orderNo: request.order_no,
        groupId: group.group_id,
        serviceType: request.service_type,
        airportName: request.airport_name,
        terminal: request.terminal,
        flightNo: request.flight_no,
        flightDatetime: request.flight_datetime,
        pickupDatetime: request.preferred_time_start || request.flight_datetime,
        destination: request.location_to
      });
    } catch (emailError) {
      submissionEmail = {
        skipped: false,
        error: emailError && emailError.message ? emailError.message : "Failed to send order submission email"
      };
    }

    created(res, {
      id: request.id,
      orderNo: request.order_no,
      groupId: group.group_id,
      orderType: request.order_type,
      businessDate: request.business_date,
      createdAt: request.created_at,
      status: request.status,
      submissionEmail
    });
  } catch (error) {
    serverError(res, error);
  }
};
