const { getEnv } = require("./supabase");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "左邻右里接送机 <login@auth.ngn.best>";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PICKUP_PRICING = {
  normal: {
    LHR: { perPerson: { 1: 185, 2: 100, 3: 75, 4: 60, 5: 55 } },
    LGW: { perPerson: { 1: 235, 2: 125, 3: 95, 4: 80, 5: 70 } },
    MAN: { perPerson: { 1: 165, 2: 90, 3: 65, 4: 55, 5: 50 } },
    LTN: { perPerson: { 1: 180, 2: 95, 3: 70, 4: 55, 5: 50 } },
    LCY: { perPerson: { 1: 190, 2: 105, 3: 80, 4: 75, 5: 60 } },
    BHX: { perPerson: { 1: 100, 2: 60, 3: 50, 4: 45, 5: 40 } },
    STN: { perPerson: { 1: 185, 2: 100, 3: 75, 4: 60, 5: 55 } }
  },
  peak: {
    LHR: { perPerson: { 1: 190, 2: 105, 3: 80, 4: 65, 5: 60 } },
    LGW: { perPerson: { 1: 240, 2: 130, 3: 100, 4: 85, 5: 75 } },
    MAN: { perPerson: { 1: 170, 2: 95, 3: 70, 4: 60, 5: 55 } },
    LTN: { perPerson: { 1: 185, 2: 100, 3: 75, 4: 60, 5: 55 } },
    LCY: { perPerson: { 1: 195, 2: 110, 3: 85, 4: 80, 5: 65 } },
    BHX: { perPerson: { 1: 105, 2: 65, 3: 55, 4: 50, 5: 45 } },
    STN: { perPerson: { 1: 190, 2: 105, 3: 80, 4: 65, 5: 60 } }
  }
};

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getTransportEmailFrom() {
  return getOptionalEnv("TRANSPORT_EMAIL_FROM") || getOptionalEnv("AUTH_EMAIL_FROM") || DEFAULT_FROM;
}

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  const hour = parts.find(part => part.type === "hour")?.value;
  const minute = parts.find(part => part.type === "minute")?.value;
  return year && month && day && hour && minute ? `${year}/${month}/${day} ${hour}:${minute}` : "--";
}

function getPricingSeason(referenceDate) {
  const date = new Date(referenceDate || Date.now());
  if (Number.isNaN(date.getTime())) return "normal";
  return date.getUTCMonth() === 8 ? "peak" : "normal";
}

function uniqueNonEmpty(values) {
  return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean)));
}

function serviceLabel(serviceType) {
  return serviceType === "dropoff" ? "送机" : "接机";
}

function timingLabel(serviceType) {
  return serviceType === "dropoff" ? "起飞时间" : "落地时间";
}

function pickupLabel(serviceType) {
  return serviceType === "dropoff" ? "送机时间" : "接机时间";
}

function formatCurrency(value) {
  return `£${Number(value || 0).toFixed(2)}`;
}

function buildTransportPaymentConfirmationEmail(context) {
  const {
    email,
    studentName,
    serviceType,
    orderNo,
    groupId,
    airportName,
    terminal,
    flightNo,
    flightDatetime,
    pickupDatetime,
    destination,
    amountGbp
  } = context;

  const service = serviceLabel(serviceType);
  const amountText = formatCurrency(amountGbp);
  const flightTimeText = formatDateTime(flightDatetime);
  const pickupTimeText = formatDateTime(pickupDatetime || flightDatetime);
  const greetingName = studentName || "同学";
  const subject = `【左邻右里】我们已收到您的${service}付款 - ${orderNo}`;

  const text = [
    `亲爱的${greetingName}，`,
    "",
    `感谢您选择左邻右里的${service}服务，也谢谢您的配合。`,
    `我们已经收到您本次订单的付款 ${amountText}，订单已确认。`,
    "",
    "以下是您的行程信息：",
    `订单编号：${orderNo || "--"}`,
    `拼车组号：${groupId || "--"}`,
    `服务类型：${service}`,
    `机场：${airportName || "--"} / ${terminal || "--"}`,
    `航班号：${flightNo || "--"}`,
    `${timingLabel(serviceType)}：${flightTimeText}`,
    `${pickupLabel(serviceType)}：${pickupTimeText}`,
    `目的地：${destination || "--"}`,
    `已收款项：${amountText}`,
    "",
    "如果您的航班时间、航站楼或目的地之后有变化，请尽快联系我们，我们会及时帮您调整安排。",
    "出发当天也请留意手机消息，方便我们与您保持联系。",
    "",
    "再次感谢您的支持，祝您一路顺利，平安抵达。",
    "",
    "左邻右里接送机服务",
    "Kevin"
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#1f2937;">
      <p>亲爱的${escapeHtml(greetingName)}，</p>
      <p>感谢您选择左邻右里的${escapeHtml(service)}服务，也谢谢您的配合。我们已经收到您本次订单的付款 <strong>${escapeHtml(amountText)}</strong>，订单已确认。</p>
      <div style="margin:20px 0;padding:18px 20px;border-radius:16px;background:#f7faff;border:1px solid rgba(19,74,169,0.1);">
        <p style="margin:0 0 8px;"><strong>订单编号：</strong>${escapeHtml(orderNo || "--")}</p>
        <p style="margin:0 0 8px;"><strong>拼车组号：</strong>${escapeHtml(groupId || "--")}</p>
        <p style="margin:0 0 8px;"><strong>服务类型：</strong>${escapeHtml(service)}</p>
        <p style="margin:0 0 8px;"><strong>机场：</strong>${escapeHtml(airportName || "--")} / ${escapeHtml(terminal || "--")}</p>
        <p style="margin:0 0 8px;"><strong>航班号：</strong>${escapeHtml(flightNo || "--")}</p>
        <p style="margin:0 0 8px;"><strong>${escapeHtml(timingLabel(serviceType))}：</strong>${escapeHtml(flightTimeText)}</p>
        <p style="margin:0 0 8px;"><strong>${escapeHtml(pickupLabel(serviceType))}：</strong>${escapeHtml(pickupTimeText)}</p>
        <p style="margin:0 0 8px;"><strong>目的地：</strong>${escapeHtml(destination || "--")}</p>
        <p style="margin:0;"><strong>已收款项：</strong>${escapeHtml(amountText)}</p>
      </div>
      <p>如果您的航班时间、航站楼或目的地之后有变化，请尽快联系我们，我们会及时帮您调整安排。</p>
      <p>出发当天也请留意手机消息，方便我们与您保持联系。</p>
      <p>再次感谢您的支持，祝您一路顺利，平安抵达。</p>
      <p style="margin-top:20px;margin-bottom:4px;">左邻右里接送机服务</p>
      <p style="margin:0;">Kevin</p>
    </div>
  `.trim();

  return {
    from: getTransportEmailFrom(),
    to: email,
    subject,
    text,
    html
  };
}

async function sendWithResend(payload) {
  const apiKey = getEnv("RESEND_API_KEY");
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && data.message) ||
      (data && data.error && data.error.message) ||
      "Failed to send transport payment email";
    throw new Error(message);
  }

  return {
    id: data && data.id ? data.id : null,
    payload
  };
}

async function fetchGroupByRef(supabase, groupRef) {
  if (!groupRef) return null;

  if (isUuid(groupRef)) {
    const byId = await supabase
      .from("transport_groups_public_view")
      .select("*")
      .eq("id", groupRef)
      .limit(1);
    if (byId.error) {
      throw byId.error;
    }
    const group = Array.isArray(byId.data) ? (byId.data[0] || null) : (byId.data || null);
    if (group) return group;
  }

  const byBusinessId = await supabase
    .from("transport_groups_public_view")
    .select("*")
    .eq("group_id", groupRef)
    .limit(1);

  if (byBusinessId.error) {
    throw byBusinessId.error;
  }

  return Array.isArray(byBusinessId.data) ? (byBusinessId.data[0] || null) : (byBusinessId.data || null);
}

async function buildTransportPaymentEmailContext(supabase, requestRecord) {
  let siteUser = null;
  if (requestRecord?.site_user_id) {
    const { data, error: userError } = await supabase
      .from("site_users")
      .select("id, email, nickname")
      .eq("id", requestRecord.site_user_id)
      .maybeSingle();

    if (userError) {
      throw userError;
    }
    siteUser = data || null;
  }

  const recipientEmail = String(requestRecord?.email || siteUser?.email || "").trim();
  if (!recipientEmail) {
    return null;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("transport_group_members")
    .select("group_id")
    .eq("request_id", requestRecord.id)
    .limit(1);

  if (membershipError) {
    throw membershipError;
  }

  const membershipGroupRef = Array.isArray(memberships) ? memberships[0]?.group_id : memberships?.group_id;
  const fallbackGroupRef = requestRecord.group_ref || requestRecord.group_id || null;
  const groupLookupRef = membershipGroupRef || fallbackGroupRef;
  const group = await fetchGroupByRef(supabase, groupLookupRef);
  const memberGroupRef = group?.id || membershipGroupRef || (isUuid(fallbackGroupRef) ? fallbackGroupRef : null);

  let memberRows = [];
  if (memberGroupRef) {
    const { data: rows, error: rowsError } = await supabase
      .from("transport_group_members")
      .select("group_id, transport_requests(*)")
      .eq("group_id", memberGroupRef);

    if (rowsError) {
      throw rowsError;
    }

    memberRows = rows || [];
  }

  const displayRequests = memberRows.map(item => item.transport_requests).filter(Boolean);
  const currentPassengerCount = displayRequests.reduce((sum, item) => sum + Number(item.passenger_count || 0), 0);
  const terminals = uniqueNonEmpty(displayRequests.map(item => item.terminal));
  const primaryTerminal = (group && group.terminal) || terminals[0] || requestRecord.terminal || null;
  const pricingSeason = getPricingSeason((group && group.group_date) || requestRecord.flight_datetime || requestRecord.created_at);
  const airportCode = (group && group.airport_code) || requestRecord.airport_code || "";
  const airportPricing = PICKUP_PRICING[pricingSeason]?.[airportCode] || null;
  const pricingSeatCount = Math.min(Math.max(currentPassengerCount, 1), 5);
  const basePerPersonGbp = airportPricing?.perPerson?.[pricingSeatCount] || 0;
  const surchargeGbp = terminals.length > 1 ? 15 : 0;
  const amountGbp = basePerPersonGbp + surchargeGbp;

  return {
    email: recipientEmail,
    studentName: requestRecord.student_name || siteUser?.nickname || "",
    serviceType: requestRecord.service_type || "pickup",
    orderNo: requestRecord.order_no,
    groupId: group?.group_id || requestRecord.group_id || fallbackGroupRef || "--",
    airportName: group?.airport_name || requestRecord.airport_name,
    terminal: requestRecord.terminal || group?.terminal,
    flightNo: requestRecord.flight_no,
    flightDatetime: requestRecord.flight_datetime,
    pickupDatetime: requestRecord.preferred_time_start || group?.preferred_time_start || requestRecord.flight_datetime,
    destination: requestRecord.location_to,
    amountGbp
  };
}

async function sendTransportPaymentConfirmationEmail(supabase, requestRecord) {
  const context = await buildTransportPaymentEmailContext(supabase, requestRecord);
  if (!context) {
    return {
      skipped: true,
      reason: "missing email context"
    };
  }

  const payload = buildTransportPaymentConfirmationEmail(context);
  const result = await sendWithResend(payload);
  return {
    skipped: false,
    email: context.email,
    id: result.id,
    payload
  };
}

module.exports = {
  buildTransportPaymentConfirmationEmail,
  sendTransportPaymentConfirmationEmail
};
