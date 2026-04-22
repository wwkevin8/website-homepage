const { getEnv } = require("./supabase");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "NGN Transport <login@auth.ngn.best>";
const DEFAULT_QR_PATH = "/img/pickup-service-qr.jpg";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getTransportEmailFrom() {
  return getOptionalEnv("TRANSPORT_EMAIL_FROM") || getOptionalEnv("AUTH_EMAIL_FROM") || DEFAULT_FROM;
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

function getBaseUrl(req) {
  const configured = getOptionalEnv("APP_BASE_URL");
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = req?.headers?.host;
  if (!host) {
    return "http://localhost:3000";
  }

  const isLocalhost = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host);
  const protocol = isLocalhost ? "http" : "https";
  return `${protocol}://${host}`;
}

function getTransportQrCodeUrl(req) {
  const explicitUrl = getOptionalEnv("TRANSPORT_QR_CODE_URL");
  if (explicitUrl) {
    return explicitUrl;
  }

  return `${getBaseUrl(req)}${DEFAULT_QR_PATH}`;
}

function serviceLabel(serviceType) {
  return serviceType === "dropoff" ? "送机" : "接机";
}

function buildTransportOrderSubmissionEmail(context) {
  const {
    recipientEmail,
    studentName,
    orderNo,
    groupId,
    serviceType,
    airportName,
    terminal,
    flightNo,
    flightDatetime,
    pickupDatetime,
    destination,
    qrCodeUrl
  } = context;

  const service = serviceLabel(serviceType);
  const greetingName = String(studentName || "").trim() || "同学";
  const flightTimeText = formatDateTime(flightDatetime);
  const pickupTimeText = formatDateTime(pickupDatetime || flightDatetime);
  const reviewMessage = [
    `姓名：${greetingName}`,
    `Group ID：${groupId || "--"}`,
    `订单编号：${orderNo || "--"}`
  ].join("\n");

  const subject = `【左邻右里】订单已提交，请立即添加微信客服完成审核 - ${orderNo}`;
  const text = [
    `亲爱的 ${greetingName}：`,
    "",
    "我们已经收到您的订单提交。",
    "",
    "重要提醒：未添加微信客服并完成人工审核的订单，视为无效订单，系统不会继续安排。",
    "",
    "请立即扫码添加微信客服，并把以下信息发送给客服审核：",
    `二维码链接：${qrCodeUrl}`,
    "客服微信号：Nottsngn",
    "",
    reviewMessage,
    "",
    "您的订单信息：",
    `订单编号：${orderNo || "--"}`,
    `Group ID：${groupId || "--"}`,
    `服务类型：${service}`,
    `机场 / 航站楼：${airportName || "--"} / ${terminal || "--"}`,
    `航班号：${flightNo || "--"}`,
    `航班时间：${flightTimeText}`,
    `预计接送时间：${pickupTimeText}`,
    `目的地：${destination || "--"}`,
    "",
    "只有客服审核通过后，订单才会进入正式安排流程。",
    "如未及时添加客服并发送信息，此订单将不生效。",
    "",
    "左邻右里服务团队"
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#1f2937;">
      <p>亲爱的 ${escapeHtml(greetingName)}：</p>
      <p>我们已经收到您的订单提交。</p>
      <div style="margin:20px 0;padding:18px 20px;border-radius:16px;border:2px solid #ef4444;background:#fff5f5;">
        <p style="margin:0;color:#dc2626;font-size:18px;font-weight:800;">
          重要提醒：未添加微信客服并完成人工审核的订单，视为无效订单。
        </p>
      </div>
      <p style="margin-bottom:12px;font-weight:700;">请立即扫码添加微信客服，并把以下信息发送给客服审核：</p>
      <div style="margin:0 0 20px;padding:20px;border-radius:18px;background:#f8fafc;border:1px solid #e5e7eb;text-align:center;">
        <img src="${escapeHtml(qrCodeUrl)}" alt="接机客服二维码" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto 14px;border-radius:16px;" />
        <p style="margin:0 0 8px;color:#111827;font-weight:700;">添加后请把姓名、Group ID、订单编号发给客服审核</p>
        <p style="margin:0;color:#b93822;font-weight:800;">客服微信号：Nottsngn</p>
      </div>
      <div style="margin:20px 0;padding:18px 20px;border-radius:16px;background:#f7faff;border:1px solid rgba(19,74,169,0.1);">
        <p style="margin:0 0 8px;"><strong>订单编号：</strong>${escapeHtml(orderNo || "--")}</p>
        <p style="margin:0 0 8px;"><strong>Group ID：</strong>${escapeHtml(groupId || "--")}</p>
        <p style="margin:0 0 8px;"><strong>服务类型：</strong>${escapeHtml(service)}</p>
        <p style="margin:0 0 8px;"><strong>机场 / 航站楼：</strong>${escapeHtml(airportName || "--")} / ${escapeHtml(terminal || "--")}</p>
        <p style="margin:0 0 8px;"><strong>航班号：</strong>${escapeHtml(flightNo || "--")}</p>
        <p style="margin:0 0 8px;"><strong>航班时间：</strong>${escapeHtml(flightTimeText)}</p>
        <p style="margin:0 0 8px;"><strong>预计接送时间：</strong>${escapeHtml(pickupTimeText)}</p>
        <p style="margin:0;"><strong>目的地：</strong>${escapeHtml(destination || "--")}</p>
      </div>
      <div style="margin:20px 0;padding:18px 20px;border-radius:16px;background:#111827;color:#f9fafb;">
        <p style="margin:0 0 10px;font-weight:700;">发给客服时，请直接复制这段：</p>
        <pre style="margin:0;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#f9fafb;">${escapeHtml(reviewMessage)}</pre>
      </div>
      <p>只有客服审核通过后，订单才会进入正式安排流程。</p>
      <p>如未及时添加客服并发送信息，此订单将不生效。</p>
      <p style="margin-top:20px;">左邻右里服务团队</p>
    </div>
  `.trim();

  return {
    from: getTransportEmailFrom(),
    to: recipientEmail,
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
      "Failed to send transport order submission email";
    throw new Error(message);
  }

  return {
    id: data && data.id ? data.id : null,
    payload
  };
}

async function sendTransportOrderSubmissionEmail(req, context) {
  const recipientEmail = String(context?.recipientEmail || "").trim();
  if (!recipientEmail) {
    return {
      skipped: true,
      reason: "missing recipient email"
    };
  }

  const payload = buildTransportOrderSubmissionEmail({
    ...context,
    recipientEmail,
    qrCodeUrl: getTransportQrCodeUrl(req)
  });
  const result = await sendWithResend(payload);

  return {
    skipped: false,
    email: recipientEmail,
    id: result.id,
    payload
  };
}

module.exports = {
  buildTransportOrderSubmissionEmail,
  sendTransportOrderSubmissionEmail
};
