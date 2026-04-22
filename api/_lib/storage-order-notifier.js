const nodemailer = require("nodemailer");
const { sendStorageOrderWebhook } = require("./storage-order-webhook");

let cachedTransporter = null;
let cachedTransportKey = "";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
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

function hasEmailConfig() {
  const notifyEmail = getOptionalEnv("STORAGE_ORDER_NOTIFY_EMAIL");
  const { host, port, user, pass, from } = getSmtpConfig();
  return Boolean(notifyEmail && host && port && user && pass && from);
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

function buildStorageOrderEmail(orderRecord) {
  const notifyEmail = getOptionalEnv("STORAGE_ORDER_NOTIFY_EMAIL");
  const adminUrl = getOptionalEnv("STORAGE_ORDER_ADMIN_URL");
  const from = getOptionalEnv("SMTP_FROM");
  const totalPrice = Number.isFinite(Number(orderRecord.estimated_total_price))
    ? `£${Number(orderRecord.estimated_total_price).toFixed(2)}`
    : "--";

  const subject = `【新寄存预约】${orderRecord.order_no}`;
  const textParts = [
    `订单编号：${orderRecord.order_no}`,
    `客户姓名：${orderRecord.customer_name || "--"}`,
    `服务日期：${orderRecord.service_date || "--"}`,
    `预计总价：${totalPrice}`,
    `订单状态：${orderRecord.status || "--"}`,
    adminUrl ? `后台查看入口：${adminUrl}` : "",
    "",
    orderRecord.final_readable_message || "无客服摘要"
  ].filter(Boolean);

  return {
    channel: "email",
    to: notifyEmail,
    from,
    subject,
    text: textParts.join("\n")
  };
}

async function sendStorageOrderEmail(orderRecord) {
  if (!hasEmailConfig()) {
    return {
      ok: false,
      error: "Missing email notification configuration"
    };
  }

  const transporter = getTransporter();
  const mail = buildStorageOrderEmail(orderRecord);
  try {
    const info = await transporter.sendMail({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text
    });

    return {
      ok: true,
      channel: "email",
      payload: mail,
      messageId: info.messageId || ""
    };
  } catch (error) {
    return {
      ok: false,
      channel: "email",
      payload: mail,
      error: error && error.message ? error.message : "Email delivery failed"
    };
  }
}

async function sendStorageOrderNotification(orderRecord) {
  if (hasEmailConfig()) {
    return sendStorageOrderEmail(orderRecord);
  }

  const webhookPayload = {
    channel: "webhook",
    event: "storage_order.created",
    orderNo: orderRecord.order_no,
    finalReadableMessage: orderRecord.final_readable_message
  };
  const webhookResult = await sendStorageOrderWebhook(webhookPayload);
  return {
    ...webhookResult,
    channel: "webhook",
    payload: webhookPayload
  };
}

module.exports = {
  buildStorageOrderEmail,
  sendStorageOrderNotification
};
