const nodemailer = require("nodemailer");
const { buildStorageOrderWebhookPayload, getStorageServiceLabel } = require("./storage-orders");
const { sendStorageOrderWebhook } = require("./storage-order-webhook");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_STORAGE_EMAIL_FROM = "NGN Storage <login@auth.ngn.best>";

let cachedTransporter = null;
let cachedTransportKey = "";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getStorageStudentEmailFrom() {
  return getOptionalEnv("STORAGE_STUDENT_EMAIL_FROM")
    || getOptionalEnv("STORAGE_EMAIL_FROM")
    || getOptionalEnv("AUTH_EMAIL_FROM")
    || getOptionalEnv("SMTP_FROM")
    || DEFAULT_STORAGE_EMAIL_FROM;
}

function hasResendConfig() {
  return Boolean(getOptionalEnv("RESEND_API_KEY") && getStorageStudentEmailFrom());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBaseUrl(req) {
  const configured = getOptionalEnv("PUBLIC_SITE_URL") || getOptionalEnv("SITE_URL") || getOptionalEnv("VERCEL_URL");
  if (configured) {
    return configured.startsWith("http") ? configured.replace(/\/+$/, "") : `https://${configured.replace(/\/+$/, "")}`;
  }

  const host = req?.headers?.host;
  if (!host) {
    return "";
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function getSmtpConfig() {
  const host = getOptionalEnv("SMTP_HOST");
  const port = Number.parseInt(getOptionalEnv("SMTP_PORT") || "0", 10);
  const user = getOptionalEnv("SMTP_USER");
  const pass = getOptionalEnv("SMTP_PASS");
  const from = getOptionalEnv("SMTP_FROM");
  const secureEnv = getOptionalEnv("SMTP_SECURE");
  const secure = secureEnv ? secureEnv === "true" || secureEnv === "1" : port === 465;

  return {
    host,
    port,
    user,
    pass,
    from,
    secure
  };
}

function hasSmtpConfig() {
  const { host, port, user, pass, from } = getSmtpConfig();
  return Boolean(host && port && user && pass && from);
}

function hasNotificationEmailConfig() {
  return Boolean(getOptionalEnv("STORAGE_ORDER_NOTIFY_EMAIL") && hasSmtpConfig());
}

function getTransporter() {
  const config = getSmtpConfig();
  const cacheKey = JSON.stringify(config);
  if (cachedTransporter && cachedTransportKey === cacheKey) {
    return cachedTransporter;
  }

  cachedTransportKey = cacheKey;
  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  return cachedTransporter;
}

function formatBoolean(value) {
  if (value === true) {
    return "是";
  }
  if (value === false) {
    return "否";
  }
  return "--";
}

function formatMoney(value) {
  return Number.isFinite(Number(value)) ? `£${Number(value).toFixed(2)}` : "--";
}

function getOrderAddress(orderRecord) {
  return orderRecord.address_full || [
    orderRecord.room_or_building,
    orderRecord.postcode
  ].filter(Boolean).join(" / ") || "--";
}

function getStorageCustomerForm(orderRecord) {
  const form = orderRecord && orderRecord.customer_form_json;
  return form && typeof form === "object" && !Array.isArray(form) ? form : {};
}

function getStorageServiceDetails(orderRecord) {
  const form = getStorageCustomerForm(orderRecord);
  const details = form.serviceDetails;
  return details && typeof details === "object" && !Array.isArray(details) ? details : {};
}

function getStorageEstimateSummary(orderRecord) {
  const estimate = orderRecord && orderRecord.estimate_summary_json;
  return estimate && typeof estimate === "object" && !Array.isArray(estimate) ? estimate : {};
}

function firstFilled(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }
  return "";
}

function formatStudentEmailRows(rows) {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => `${label}：${value}`)
    .join("\n");
}

function renderStudentEmailRows(rows) {
  return rows
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
    .map(([label, value]) => `
      <tr>
        <td style="width:34%;padding:12px 14px;border-bottom:1px solid #f1e2d6;color:#9a4b18;font-weight:700;background:#fffaf3;">${escapeHtml(label)}</td>
        <td style="padding:12px 14px;border-bottom:1px solid #f1e2d6;color:#172033;font-weight:700;">${escapeHtml(value)}</td>
      </tr>
    `)
    .join("");
}

function formatPickupMethod(value) {
  if (value === "home") {
    return "上门取件";
  }
  if (value === "self") {
    return "自行送至仓库";
  }
  return "";
}

function formatDeliveryMethod(value) {
  if (value === "home") {
    return "上门送件";
  }
  if (value === "self") {
    return "自行到仓库取件";
  }
  return "";
}

function formatReturnType(value) {
  if (value === "local") {
    return "诺丁汉当地寄存送还";
  }
  if (value === "england") {
    return "送往英国其他城市（英格兰）";
  }
  if (value === "scotland") {
    return "送往苏格兰地区";
  }
  return "";
}

function formatAccessMethod(value) {
  if (value === "ground") {
    return "楼下交接";
  }
  if (value === "elevator") {
    return "电梯上楼";
  }
  if (value === "stairs") {
    return "楼梯上楼";
  }
  return "";
}

function buildStorageOrderEmail(orderRecord) {
  const notifyEmail = getOptionalEnv("STORAGE_ORDER_NOTIFY_EMAIL");
  const adminUrl = getOptionalEnv("STORAGE_ORDER_ADMIN_URL");
  const from = getOptionalEnv("SMTP_FROM");
  const serviceTimeSlot = orderRecord.service_time_slot || orderRecord.service_time || "--";
  const serviceLabel = orderRecord.service_label || getStorageServiceLabel(orderRecord.order_type);

  const subject = `【新寄存服务单】${orderRecord.order_no}`;
  const textParts = [
    `订单编号：${orderRecord.order_no}`,
    `服务类型：${serviceLabel}`,
    `客户姓名：${orderRecord.customer_name || "--"}`,
    `学生邮箱：${orderRecord.student_email || "--"}`,
    `联系电话：${orderRecord.phone || "--"}`,
    `联系账号：${orderRecord.wechat_id || "--"}`,
    `服务日期：${orderRecord.service_date || "--"}`,
    `服务时间段：${serviceTimeSlot}`,
    `服务地址：${getOrderAddress(orderRecord)}`,
    `原寄存订单号：${orderRecord.related_order_no || "--"}`,
    `电梯：${formatBoolean(orderRecord.has_lift)}`,
    `上楼服务：${formatBoolean(orderRecord.needs_upstairs)}`,
    `预计总价：${formatMoney(orderRecord.estimated_total_price)}`,
    `订单状态：${orderRecord.status || "--"}`,
    adminUrl ? `后台查看入口：${adminUrl}` : "",
    "",
    "寄存信息摘要：",
    orderRecord.final_readable_message || "暂无",
    "",
    "学生邮件提示：订单已提交，需要等待客服人工确认后才算正式安排。"
  ].filter(Boolean);

  return {
    channel: "email",
    to: notifyEmail,
    from,
    subject,
    text: textParts.join("\n")
  };
}

function buildStorageStudentConfirmationEmail(req, orderRecord, recipientEmail) {
  const from = getStorageStudentEmailFrom();
  const requestBaseUrl = getBaseUrl(req);
  const baseUrl = requestBaseUrl && !/localhost|127\.0\.0\.1/i.test(requestBaseUrl)
    ? requestBaseUrl
    : "https://ngn.best";
  const qrPath = getOptionalEnv("STORAGE_SERVICE_QR_URL") || "/img/storage-service-qr.jpg";
  const qrUrl = qrPath.startsWith("http") ? qrPath : `${baseUrl}${qrPath.startsWith("/") ? "" : "/"}${qrPath}`;
  const serviceTimeSlot = orderRecord.service_time_slot || orderRecord.service_time || "--";
  const serviceLabel = orderRecord.service_label || getStorageServiceLabel(orderRecord.order_type);
  const customerForm = getStorageCustomerForm(orderRecord);
  const serviceDetails = getStorageServiceDetails(orderRecord);
  const estimateSummary = getStorageEstimateSummary(orderRecord);
  const serviceWechat = getOptionalEnv("STORAGE_CUSTOMER_SERVICE_WECHAT") || "Nottsngn";
  const contactText = getOptionalEnv("STORAGE_SERVICE_CONTACT") || "请添加客服微信确认订单";
  const confirmationRequiredText = "务必添加客服微信并发送订单编号完成确认；未添加客服并完成确认的订单，不算正式安排。";
  const address = firstFilled(
    orderRecord.address_full,
    serviceDetails.collectionAddress,
    serviceDetails.returnAddress,
    serviceDetails.serviceAddress,
    getOrderAddress(orderRecord)
  ) || "--";
  const customerName = firstFilled(
    orderRecord.customer_name,
    customerForm.customerName,
    serviceDetails.storageCustomerName,
    "同学"
  );
  const phone = firstFilled(orderRecord.phone, customerForm.phone, serviceDetails.storagePhone, "--");
  const contactHandle = firstFilled(orderRecord.wechat_id, customerForm.contactHandle, customerForm.wechatId, "--");
  const contactPreference = firstFilled(customerForm.contactPreferenceLabel, customerForm.contactPreference, "微信");
  const roomOrBuilding = firstFilled(orderRecord.room_or_building, serviceDetails.roomOrBuilding, "--");
  const postcode = firstFilled(orderRecord.postcode, serviceDetails.postcode, "--");
  const boxCount = firstFilled(orderRecord.estimated_box_count, serviceDetails.storageBoxCount, serviceDetails.itemCount, "--");
  const purchaseQuantity = firstFilled(serviceDetails.purchaseQuantity, serviceDetails.boxPurchaseTotal, "");
  const serviceDate = firstFilled(orderRecord.service_date, serviceDetails.serviceDate, "--");
  const expectedEndDate = firstFilled(orderRecord.expected_storage_end_date, serviceDetails.expectedStorageEndDate, "");
  const boxDeliveryDate = firstFilled(serviceDetails.boxDeliveryDate, "");
  const relatedOrderNo = firstFilled(orderRecord.related_order_no, serviceDetails.relatedOrderNo, "");
  const totalPrice = Number.isFinite(Number(orderRecord.estimated_total_price))
    ? `£${Number(orderRecord.estimated_total_price).toFixed(2)}`
    : "";
  const pickupMethod = firstFilled(estimateSummary.pickupMethod, serviceDetails.pickupMethod);
  const deliveryMethod = firstFilled(estimateSummary.deliveryMethod, serviceDetails.deliveryMethod);
  const returnType = firstFilled(estimateSummary.returnType, serviceDetails.returnType);
  const pickupAccessType = firstFilled(estimateSummary.pickupAccessType, serviceDetails.pickupAccessType);
  const returnAccessType = firstFilled(estimateSummary.returnAccessType, serviceDetails.returnAccessType);
  const pickupMethodText = formatPickupMethod(pickupMethod) || firstFilled(serviceDetails.pickupMethodLabel, "");
  const deliveryMethodText = formatDeliveryMethod(deliveryMethod) || firstFilled(serviceDetails.deliveryMethodLabel, "");
  const returnTypeText = formatReturnType(returnType) || firstFilled(serviceDetails.returnTypeLabel, "");
  const pickupAccessText = pickupMethod === "home"
    ? formatAccessMethod(pickupAccessType)
    : pickupMethodText;
  const returnAccessText = deliveryMethod === "home"
    ? formatAccessMethod(returnAccessType)
    : deliveryMethodText;
  const infoRows = [
    ["订单编号", orderRecord.order_no],
    ["服务类型", serviceLabel],
    ["客户姓名", customerName],
    ["联系电话", phone],
    ["联系方式", [contactPreference, contactHandle].filter(Boolean).join(" / ")],
    ["取件方式", pickupMethodText],
    ["取寄存交接方式", pickupAccessText],
    ["送还方式", returnTypeText],
    ["送回方式", deliveryMethodText],
    ["送回交接方式", returnAccessText],
    ["服务日期", serviceDate],
    ["服务时间段", serviceTimeSlot],
    ["地址 / 说明", address],
    ["房间 / 公寓", roomOrBuilding],
    ["邮编", postcode],
    ["箱数 / 物品数量", boxCount],
    ["需购买箱子", purchaseQuantity ? `${purchaseQuantity} 个` : ""],
    ["送箱日期", boxDeliveryDate],
    ["预计寄存结束日期", expectedEndDate],
    ["原寄存订单号", relatedOrderNo],
    ["预计费用", totalPrice]
  ];
  const subject = `【NGN寄存】订单已提交，务必添加客服确认：${orderRecord.order_no}`;

  const text = [
    `${customerName}同学，你好：`,
    "",
    "我们已经收到你的寄存预约，订单编号已经生成。",
    confirmationRequiredText,
    "未添加客服并完成确认的订单，不算正式安排。",
    "为了避免日期、地址或箱数安排出错，请你添加客服微信并发送订单编号。客服人工确认后，这单才算正式进入安排流程。",
    "",
    "你提交的信息：",
    formatStudentEmailRows(infoRows),
    "",
    `联系客服确认：${contactText}`,
    `客服微信号：${serviceWechat}`,
    qrUrl ? `客服二维码：${qrUrl}` : ""
  ].filter(Boolean).join("\n");

  const html = `
    <div style="margin:0;padding:0;background:#f6f1ea;font-family:Arial,'Noto Sans SC',sans-serif;color:#172033;line-height:1.7;">
      <div style="max-width:680px;margin:0 auto;padding:28px 14px;">
        <div style="overflow:hidden;border:1px solid #f0d7c1;border-radius:22px;background:#fffaf3;box-shadow:0 18px 45px rgba(124,45,18,0.12);">
          <div style="padding:26px 24px;background:linear-gradient(135deg,#ffb454 0%,#f97316 52%,#dc5a2f 100%);color:#fff;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:800;letter-spacing:.04em;">NGN Storage</p>
            <h2 style="margin:0;font-size:24px;line-height:1.3;color:#fff;">订单已提交，请联系客服确认</h2>
            <p style="margin:12px auto 0;max-width:520px;color:#fff7ed;">${escapeHtml(customerName)}同学，我们已经收到你的寄存预约啦。下面是你提交的信息，麻烦保存订单号并联系人工客服确认。</p>
          </div>
          <div style="padding:24px;">
            <div style="margin:0 0 18px;padding:16px 18px;border:1px solid #fecaca;border-radius:16px;background:#fff1f2;color:#991b1b;font-weight:900;text-align:center;">
              ${escapeHtml(confirmationRequiredText)}
            </div>
            <div style="margin:0 0 18px;padding:18px;border:1px dashed #f59e0b;border-radius:18px;background:#fff;">
              <div style="color:#9a4b18;font-weight:800;font-size:13px;">订单编号</div>
              <div style="margin-top:6px;color:#0f172a;font-size:24px;font-weight:900;letter-spacing:.02em;">${escapeHtml(orderRecord.order_no)}</div>
              <p style="margin:12px 0 0;color:#5f4a39;">这只是提交成功，不代表已经排上时间。请把订单编号发给客服，客服确认后才会正式安排。</p>
            </div>
            <table style="border-collapse:separate;border-spacing:0;width:100%;margin:0;border:1px solid #f1e2d6;border-radius:16px;overflow:hidden;background:#fff;">
        <tbody>
          ${renderStudentEmailRows(infoRows)}
        </tbody>
      </table>
            <div style="margin-top:20px;padding:18px;border-radius:18px;background:#eef7ff;border:1px solid #bfdbfe;text-align:center;">
              <h3 style="margin:0 0 8px;color:#102644;">下一步：联系人工客服确认</h3>
              <p style="margin:0 0 12px;color:#45556d;">请扫码添加客服，或直接搜索微信号 <strong style="color:#c2410c;">${escapeHtml(serviceWechat)}</strong>，发送你的订单编号。</p>
              ${qrUrl ? `<img src="${escapeHtml(qrUrl)}" alt="寄存客服二维码" width="320" height="320" style="display:block;width:320px;max-width:100%;height:auto;margin:0 auto 12px;border:12px solid #fff;border-radius:20px;box-shadow:0 12px 28px rgba(15,23,42,.12);" />` : ""}
              <p style="margin:0;color:#9a3412;font-weight:900;">客服微信号：${escapeHtml(serviceWechat)}</p>
              <p style="margin:10px 0 0;color:#991b1b;font-weight:900;">未添加客服并完成确认的订单，不算正式安排。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return {
    channel: "email",
    to: recipientEmail,
    from,
    subject,
    text,
    html
  };
}

async function sendSmtpEmail(mail) {
  const transporter = getTransporter();
  const { channel, ...mailOptions } = mail;
  const info = await transporter.sendMail(mailOptions);
  return {
    ok: true,
    channel: "email",
    provider: "smtp",
    payload: {
      channel: mail.channel || "email",
      to: mail.to,
      from: mail.from,
      subject: mail.subject,
      text: mail.text
    },
    messageId: info.messageId || ""
  };
}

async function sendResendEmail(mail) {
  const { channel, ...payload } = mail;
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOptionalEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (data && data.message) ||
      (data && data.error && data.error.message) ||
      "Resend delivery failed";
    throw new Error(message);
  }

  return {
    ok: true,
    channel: "email",
    provider: "resend",
    payload: mail,
    messageId: data && data.id ? data.id : ""
  };
}

async function sendStorageOrderEmail(orderRecord) {
  if (!hasNotificationEmailConfig()) {
    return {
      ok: false,
      error: "Missing email notification configuration"
    };
  }

  const mail = buildStorageOrderEmail(orderRecord);
  try {
    return await sendSmtpEmail(mail);
  } catch (error) {
    return {
      ok: false,
      channel: "email",
      payload: mail,
      error: error && error.message ? error.message : "Email delivery failed"
    };
  }
}

async function sendStorageStudentConfirmationEmail(req, { orderRecord, recipientEmail }) {
  if (!recipientEmail) {
    return {
      ok: true,
      skipped: true,
      error: null
    };
  }

  const mail = buildStorageStudentConfirmationEmail(req, orderRecord, recipientEmail);

  if (hasResendConfig()) {
    try {
      return await sendResendEmail(mail);
    } catch (error) {
      if (!hasSmtpConfig()) {
        return {
          ok: false,
          channel: "email",
          provider: "resend",
          payload: mail,
          error: error && error.message ? error.message : "Student confirmation email delivery failed"
        };
      }
    }
  }

  if (!hasSmtpConfig()) {
    return {
      ok: false,
      channel: "email",
      error: "Missing Resend or SMTP configuration"
    };
  }

  try {
    return await sendSmtpEmail(mail);
  } catch (error) {
    return {
      ok: false,
      channel: "email",
      provider: "smtp",
      payload: mail,
      error: error && error.message ? error.message : "Student confirmation email delivery failed"
    };
  }
}

async function sendStorageOrderNotification(orderRecord) {
  if (hasNotificationEmailConfig()) {
    return sendStorageOrderEmail(orderRecord);
  }

  const webhookPayload = buildStorageOrderWebhookPayload(orderRecord);
  const webhookResult = await sendStorageOrderWebhook(webhookPayload);
  return {
    ...webhookResult,
    channel: "webhook",
    payload: webhookPayload
  };
}

module.exports = {
  buildStorageOrderEmail,
  buildStorageStudentConfirmationEmail,
  sendStorageOrderNotification,
  sendStorageStudentConfirmationEmail
};
