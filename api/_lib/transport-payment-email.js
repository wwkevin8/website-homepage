const nodemailer = require("nodemailer");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "NGN Transport <login@auth.ngn.best>";

let cachedTransporter = null;
let cachedTransportKey = "";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getTransportPaymentEmailFrom() {
  return getOptionalEnv("TRANSPORT_PAYMENT_EMAIL_FROM")
    || getOptionalEnv("TRANSPORT_EMAIL_FROM")
    || getOptionalEnv("AUTH_EMAIL_FROM")
    || getOptionalEnv("SMTP_FROM")
    || DEFAULT_FROM;
}

function getSmtpConfig() {
  const host = getOptionalEnv("SMTP_HOST");
  const port = Number.parseInt(getOptionalEnv("SMTP_PORT") || "0", 10);
  const user = getOptionalEnv("SMTP_USER");
  const pass = getOptionalEnv("SMTP_PASS");
  const from = getTransportPaymentEmailFrom();
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

function hasResendConfig() {
  return Boolean(getOptionalEnv("RESEND_API_KEY") && getTransportPaymentEmailFrom());
}

function hasSmtpConfig() {
  const { host, port, user, pass, from } = getSmtpConfig();
  return Boolean(host && port && user && pass && from);
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRelation(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value && typeof value === "object" ? value : null;
}

function getRecipientEmail(request) {
  const siteUser = normalizeRelation(request?.site_users);
  return String(request?.email || siteUser?.email || "").trim();
}

function serviceLabel(serviceType) {
  if (serviceType === "dropoff") {
    return "Airport dropoff";
  }
  if (serviceType === "pickup") {
    return "Airport pickup";
  }
  return "Transport service";
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("en-GB", {
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

function buildTransportPaymentConfirmationEmail(request) {
  const recipientEmail = getRecipientEmail(request);
  const orderNo = request?.order_no || "--";
  const groupId = request?.group_id || request?.group_ref || "--";
  const studentName = String(request?.student_name || "").trim() || "student";
  const service = serviceLabel(request?.service_type);
  const from = getTransportPaymentEmailFrom();
  const subject = `[NGN Transport] Payment confirmed for order ${orderNo}`;
  const rows = [
    ["Order number", orderNo],
    ["Group ID", groupId],
    ["Service", service],
    ["Airport", [request?.airport_name, request?.terminal].filter(Boolean).join(" / ") || "--"],
    ["Flight number", request?.flight_no || "--"],
    ["Flight time", formatDateTime(request?.flight_datetime)],
    ["Pickup/dropoff time", formatDateTime(request?.preferred_time_start || request?.flight_datetime)],
    ["Route", [request?.location_from, request?.location_to].filter(Boolean).join(" -> ") || "--"]
  ];
  const text = [
    `Hi ${studentName},`,
    "",
    "Your transport payment has been marked as received.",
    "Our operations team will continue arranging your transport order.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "If any order details look incorrect, please contact customer service as soon as possible.",
    "",
    "NGN Transport Team"
  ].join("\n");
  const htmlRows = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:700;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(value)}</td>
    </tr>
  `).join("");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#111827;">
      <h2 style="margin:0 0 12px;">Payment confirmed</h2>
      <p>Hi ${escapeHtml(studentName)},</p>
      <p>Your transport payment has been marked as received. Our operations team will continue arranging your transport order.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <tbody>${htmlRows}</tbody>
      </table>
      <p style="margin-top:18px;">If any order details look incorrect, please contact customer service as soon as possible.</p>
      <p>NGN Transport Team</p>
    </div>
  `.trim();

  return {
    from,
    to: recipientEmail,
    subject,
    text,
    html
  };
}

async function sendWithResend(mail) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOptionalEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(mail)
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
    id: data && data.id ? data.id : ""
  };
}

async function sendWithSmtp(mail) {
  const transporter = getTransporter();
  const info = await transporter.sendMail(mail);
  return {
    id: info.messageId || ""
  };
}

async function deliverTransportPaymentEmail(mail) {
  if (!mail.to) {
    return {
      skipped: true,
      reason: "missing email context"
    };
  }

  if (hasResendConfig()) {
    try {
      const result = await sendWithResend(mail);
      return {
        skipped: false,
        provider: "resend",
        email: mail.to,
        id: result.id
      };
    } catch (error) {
      if (!hasSmtpConfig()) {
        console.warn("[transport-payment-email] Resend delivery failed and SMTP fallback is not configured", {
          message: error && error.message ? error.message : "Resend delivery failed"
        });
        return {
          skipped: false,
          provider: "resend",
          email: mail.to,
          error: error && error.message ? error.message : "Resend delivery failed"
        };
      }
    }
  }

  if (hasSmtpConfig()) {
    try {
      const result = await sendWithSmtp(mail);
      return {
        skipped: false,
        provider: "smtp",
        email: mail.to,
        id: result.id
      };
    } catch (error) {
      console.warn("[transport-payment-email] SMTP delivery failed", {
        message: error && error.message ? error.message : "SMTP delivery failed"
      });
      return {
        skipped: false,
        provider: "smtp",
        email: mail.to,
        error: error && error.message ? error.message : "SMTP delivery failed"
      };
    }
  }

  console.warn("[transport-payment-email] Missing email configuration");
  return {
    skipped: true,
    reason: "missing email configuration",
    email: mail.to
  };
}

async function sendTransportPaymentConfirmationEmail(supabase, request) {
  const mail = buildTransportPaymentConfirmationEmail(request);
  return deliverTransportPaymentEmail(mail);
}

module.exports = {
  buildTransportPaymentConfirmationEmail,
  sendTransportPaymentConfirmationEmail
};
