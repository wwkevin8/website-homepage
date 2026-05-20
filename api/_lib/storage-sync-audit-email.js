const nodemailer = require("nodemailer");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "NGN Storage Sync Audit <audit@ngn.best>";

let cachedTransporter = null;
let cachedTransportKey = "";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getNotifyEmail() {
  return getOptionalEnv("STORAGE_SYNC_AUDIT_NOTIFY_EMAIL");
}

function getEmailFrom() {
  return getOptionalEnv("STORAGE_SYNC_AUDIT_EMAIL_FROM")
    || getOptionalEnv("AUTH_EMAIL_FROM")
    || getOptionalEnv("SMTP_FROM")
    || DEFAULT_FROM;
}

function hasResendConfig() {
  return Boolean(getOptionalEnv("RESEND_API_KEY") && getNotifyEmail() && getEmailFrom());
}

function getSmtpConfig() {
  const host = getOptionalEnv("SMTP_HOST");
  const port = Number.parseInt(getOptionalEnv("SMTP_PORT") || "0", 10);
  const secureEnv = getOptionalEnv("SMTP_SECURE");
  return {
    host,
    port,
    user: getOptionalEnv("SMTP_USER"),
    pass: getOptionalEnv("SMTP_PASS"),
    from: getEmailFrom(),
    secure: secureEnv ? secureEnv === "true" || secureEnv === "1" : port === 465
  };
}

function hasSmtpConfig() {
  const notifyEmail = getNotifyEmail();
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function getAuditAdminUrl() {
  const baseUrl = getOptionalEnv("APP_BASE_URL") || "https://ngn.best";
  return `${baseUrl.replace(/\/+$/, "")}/admin/storage/sync-logs`;
}

function safeMismatchLine(item) {
  return [
    item?.order_no || "--",
    item?.surface || "--",
    item?.field || "--",
    item?.reason || "",
    `expected=${item?.expected ?? "--"}`,
    `actual=${item?.actual ?? "--"}`
  ].filter(Boolean).join(" / ");
}

function safeSkippedLine(item) {
  return [
    item?.order_no || "--",
    item?.surface || "--",
    item?.reason || "--"
  ].filter(Boolean).join(" / ");
}

function buildStorageSyncDailyDigestEmail(report) {
  const adminUrl = getAuditAdminUrl();
  const mismatchLines = (report?.mismatches || []).slice(0, 10).map(safeMismatchLine);
  const skippedLines = (report?.skipped_checks || []).slice(0, 10).map(safeSkippedLine);
  const checkedAt = formatDateTime(report?.checked_at);
  const subject = `[NGN Storage Sync Audit] Daily summary - ${checkedAt}`;

  const text = [
    "Storage sync audit daily summary",
    "",
    `Run time: ${checkedAt}`,
    `Sampled orders: ${Number(report?.sampled_order_count || 0)}`,
    `Order center matched rows: ${Number(report?.checked_order_center_count || 0)}`,
    `Personal center visible rows: ${Number(report?.checked_user_order_count || 0)}`,
    `Mismatch count: ${Number(report?.mismatch_count || 0)}`,
    `Skipped count: ${Number(report?.skipped_check_count || 0)}`,
    `Cutover at: ${report?.cutover_at || "--"}`,
    "",
    `Admin log page: ${adminUrl}`,
    "",
    "Recent mismatches:",
    ...(mismatchLines.length ? mismatchLines.map(line => `- ${line}`) : ["- none"]),
    "",
    "Recent skipped checks:",
    ...(skippedLines.length ? skippedLines.map(line => `- ${line}`) : ["- none"])
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#1f2937;">
      <h2 style="margin:0 0 12px;">Storage sync audit daily summary</h2>
      <div style="padding:16px 18px;border-radius:12px;background:#f8fbff;border:1px solid rgba(19,74,169,0.12);margin-bottom:18px;">
        <p style="margin:0 0 6px;"><strong>Run time:</strong> ${escapeHtml(checkedAt)}</p>
        <p style="margin:0 0 6px;"><strong>Sampled orders:</strong> ${escapeHtml(String(Number(report?.sampled_order_count || 0)))}</p>
        <p style="margin:0 0 6px;"><strong>Order center matched rows:</strong> ${escapeHtml(String(Number(report?.checked_order_center_count || 0)))}</p>
        <p style="margin:0 0 6px;"><strong>Personal center visible rows:</strong> ${escapeHtml(String(Number(report?.checked_user_order_count || 0)))}</p>
        <p style="margin:0 0 6px;"><strong>Mismatch count:</strong> ${escapeHtml(String(Number(report?.mismatch_count || 0)))}</p>
        <p style="margin:0 0 6px;"><strong>Skipped count:</strong> ${escapeHtml(String(Number(report?.skipped_check_count || 0)))}</p>
        <p style="margin:0;"><strong>Cutover at:</strong> ${escapeHtml(report?.cutover_at || "--")}</p>
      </div>
      <p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 14px;border-radius:8px;background:#134aa9;color:#fff;text-decoration:none;font-weight:700;">Open storage sync audit logs</a></p>
      <h3>Recent mismatches</h3>
      <div>${(mismatchLines.length ? mismatchLines : ["none"]).map(line => `<div>${escapeHtml(line)}</div>`).join("")}</div>
      <h3>Recent skipped checks</h3>
      <div>${(skippedLines.length ? skippedLines : ["none"]).map(line => `<div>${escapeHtml(line)}</div>`).join("")}</div>
    </div>
  `.trim();

  return {
    to: getNotifyEmail(),
    from: getEmailFrom(),
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
    body: JSON.stringify({
      from: mail.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || "Resend delivery failed");
  }
  return { id: data?.id || "" };
}

async function sendWithSmtp(mail) {
  const info = await getTransporter().sendMail(mail);
  return { id: info.messageId || "" };
}

async function sendStorageSyncDailyDigestEmail(report) {
  const notifyEmail = getNotifyEmail();
  if (!notifyEmail) {
    return { ok: false, skipped: true, reason: "missing_notify_email" };
  }

  const mail = buildStorageSyncDailyDigestEmail(report);
  if (hasResendConfig()) {
    try {
      const result = await sendWithResend(mail);
      return { ok: true, skipped: false, provider: "resend", messageId: result.id, email: notifyEmail };
    } catch (error) {
      if (!hasSmtpConfig()) {
        return { ok: false, skipped: false, provider: "resend", error: error?.message || "Resend delivery failed", email: notifyEmail };
      }
    }
  }

  if (hasSmtpConfig()) {
    try {
      const result = await sendWithSmtp(mail);
      return { ok: true, skipped: false, provider: "smtp", messageId: result.id, email: notifyEmail };
    } catch (error) {
      return { ok: false, skipped: false, provider: "smtp", error: error?.message || "SMTP delivery failed", email: notifyEmail };
    }
  }

  return { ok: false, skipped: true, reason: "missing_email_provider_config", email: notifyEmail };
}

module.exports = {
  sendStorageSyncDailyDigestEmail
};
