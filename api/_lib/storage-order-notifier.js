const nodemailer = require("nodemailer");
const { buildStorageOrderWebhookPayload, getStorageServiceLabel } = require("./storage-orders");
const { sendStorageOrderWebhook } = require("./storage-order-webhook");

let cachedTransporter = null;
let cachedTransportKey = "";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
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

function getOrderAddress(orderRecord) {
  return orderRecord.address_full || [
    orderRecord.room_or_building,
    orderRecord.postcode
  ].filter(Boolean).join(" / ") || "--";
}

function buildStorageOrderEmail(orderRecord) {
  const notifyEmail = getOptionalEnv("STORAGE_ORDER_NOTIFY_EMAIL");
  const adminUrl = getOptionalEnv("STORAGE_ORDER_ADMIN_URL");
  const from = getOptionalEnv("SMTP_FROM");
  const totalPrice = Number.isFinite(Number(orderRecord.estimated_total_price))
    ? `£${Number(orderRecord.estimated_total_price).toFixed(2)}`
    : "--";
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
    `预计总价：${totalPrice}`,
    `订单状态：${orderRecord.status || "--"}`,
    adminUrl ? `后台查看入口：${adminUrl}` : "",
    "",
    "寄存信息摘要：",
    orderRecord.final_readable_message || "无",
    "",
    "学生邮件提示：订单已提交，需等待客服人工确认后才算正式安排。"
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
  const from = getOptionalEnv("SMTP_FROM");
  const baseUrl = getBaseUrl(req);
  const qrPath = getOptionalEnv("STORAGE_SERVICE_QR_URL") || "/img/storage-service-qr.jpg";
  const qrUrl = qrPath.startsWith("http") ? qrPath : `${baseUrl}${qrPath}`;
  const serviceTimeSlot = orderRecord.service_time_slot || orderRecord.service_time || "--";
  const serviceLabel = orderRecord.service_label || getStorageServiceLabel(orderRecord.order_type);
  const contactText = getOptionalEnv("STORAGE_SERVICE_CONTACT") || getOptionalEnv("STORAGE_CUSTOMER_SERVICE_WECHAT") || "请通过页面客服二维码联系人工客服";
  const address = getOrderAddress(orderRecord);
  const subject = `【NGN寄存】订单已提交：${orderRecord.order_no}`;

  const text = [
    `${orderRecord.customer_name || "同学"}，你好：`,
    "",
    "你的寄存服务订单已提交，需等待客服人工确认后才算正式安排。",
    "",
    `订单编号：${orderRecord.order_no}`,
    `服务类型：${serviceLabel}`,
    `服务日期：${orderRecord.service_date || "--"}`,
    `服务时间段：${serviceTimeSlot}`,
    `服务地址：${address}`,
    orderRecord.related_order_no ? `原寄存订单号：${orderRecord.related_order_no}` : "",
    "",
    "寄存信息摘要：",
    orderRecord.final_readable_message || "无",
    "",
    `客服联系方式：${contactText}`,
    qrUrl ? `客服二维码：${qrUrl}` : ""
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family:Arial,'Noto Sans SC',sans-serif;line-height:1.7;color:#1f2933;">
      <h2 style="margin:0 0 12px;">订单已提交，等待客服确认</h2>
      <p>${escapeHtml(orderRecord.customer_name || "同学")}，你好：</p>
      <p><strong>你的寄存服务订单已提交，需等待客服人工确认后才算正式安排。</strong></p>
      <table style="border-collapse:collapse;width:100%;max-width:620px;margin:16px 0;">
        <tbody>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;">订单编号</td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(orderRecord.order_no)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;">服务类型</td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(serviceLabel)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;">服务日期</td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(orderRecord.service_date || "--")}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;">服务时间段</td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(serviceTimeSlot)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;">服务地址</td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(address)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb;">原寄存订单号</td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(orderRecord.related_order_no || "--")}</td></tr>
        </tbody>
      </table>
      <h3 style="margin:20px 0 8px;">寄存信息摘要</h3>
      <pre style="white-space:pre-wrap;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">${escapeHtml(orderRecord.final_readable_message || "无")}</pre>
      <p>客服联系方式：${escapeHtml(contactText)}</p>
      ${qrUrl ? `<p><img src="${escapeHtml(qrUrl)}" alt="客服二维码" style="max-width:180px;height:auto;"></p>` : ""}
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

async function sendEmail(mail) {
  const transporter = getTransporter();
  const { channel, ...mailOptions } = mail;
  const info = await transporter.sendMail(mailOptions);
  return {
    ok: true,
    channel: "email",
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

async function sendStorageOrderEmail(orderRecord) {
  if (!hasNotificationEmailConfig()) {
    return {
      ok: false,
      error: "Missing email notification configuration"
    };
  }

  const mail = buildStorageOrderEmail(orderRecord);
  try {
    return await sendEmail(mail);
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
  if (!hasSmtpConfig()) {
    return {
      ok: false,
      channel: "email",
      error: "Missing SMTP configuration"
    };
  }

  const mail = buildStorageStudentConfirmationEmail(req, orderRecord, recipientEmail);
  try {
    return await sendEmail(mail);
  } catch (error) {
    return {
      ok: false,
      channel: "email",
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
