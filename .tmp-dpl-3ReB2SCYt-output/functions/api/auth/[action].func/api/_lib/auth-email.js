const { getEnv } = require("./supabase");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_AUTH_SUBJECT = "Your NGN verification code";
const DEFAULT_RESET_SUBJECT = "Reset your NGN password";
const DEFAULT_FROM = "NGN Login <login@auth.ngn.best>";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getAuthEmailFrom() {
  return getOptionalEnv("AUTH_EMAIL_FROM") || DEFAULT_FROM;
}

function maskEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const [localPart, domainPart] = normalized.split("@");
  if (!localPart || !domainPart) {
    return normalized;
  }

  const visibleLocal = localPart.length <= 2
    ? `${localPart[0] || "*"}*`
    : `${localPart.slice(0, 2)}${"*".repeat(Math.max(localPart.length - 2, 1))}`;
  const [domainName, ...domainRest] = domainPart.split(".");
  const visibleDomain = domainName.length <= 2
    ? `${domainName[0] || "*"}*`
    : `${domainName.slice(0, 2)}${"*".repeat(Math.max(domainName.length - 2, 1))}`;

  return `${visibleLocal}@${[visibleDomain, ...domainRest].filter(Boolean).join(".")}`;
}

function buildAuthCodeEmail({ email, code, expiresInMinutes }) {
  const maskedEmail = maskEmail(email);
  const text = [
    "Your Nottingham Good Neighbor verification code is below.",
    "",
    `Code: ${code}`,
    `Expires in: ${expiresInMinutes} minutes`,
    "",
    `This code was requested for ${maskedEmail}. If this was not you, you can ignore this email.`
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2937;">
      <p>Your Nottingham Good Neighbor verification code is below.</p>
      <p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:6px;">${code}</p>
      <p>Expires in ${expiresInMinutes} minutes.</p>
      <p style="color:#6b7280;">This code was requested for ${maskedEmail}. If this was not you, you can ignore this email.</p>
    </div>
  `.trim();

  return {
    from: getAuthEmailFrom(),
    to: email,
    subject: DEFAULT_AUTH_SUBJECT,
    text,
    html
  };
}

function buildPasswordResetEmail({ email, resetUrl, expiresInMinutes }) {
  const maskedEmail = maskEmail(email);
  const text = [
    "We received a request to reset your Nottingham Good Neighbor password.",
    "",
    `Reset link: ${resetUrl}`,
    `Expires in: ${expiresInMinutes} minutes`,
    "",
    `This link was requested for ${maskedEmail}. If this was not you, you can ignore this email.`
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#1f2937;">
      <p>We received a request to reset your Nottingham Good Neighbor password.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#244e9c;color:#ffffff;text-decoration:none;font-weight:700;">Reset password</a>
      </p>
      <p>If the button does not open, copy and paste this link into your browser:</p>
      <p style="word-break:break-all;color:#244e9c;">${resetUrl}</p>
      <p>Expires in ${expiresInMinutes} minutes.</p>
      <p style="color:#6b7280;">This link was requested for ${maskedEmail}. If this was not you, you can ignore this email.</p>
    </div>
  `.trim();

  return {
    from: getAuthEmailFrom(),
    to: email,
    subject: DEFAULT_RESET_SUBJECT,
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
      "Failed to send auth email with Resend";
    throw new Error(message);
  }

  return {
    id: data && data.id ? data.id : null,
    payload
  };
}

async function sendAuthCodeEmail(params) {
  return sendWithResend(buildAuthCodeEmail(params));
}

async function sendPasswordResetEmail(params) {
  return sendWithResend(buildPasswordResetEmail(params));
}

module.exports = {
  getAuthEmailFrom,
  buildAuthCodeEmail,
  buildPasswordResetEmail,
  sendAuthCodeEmail,
  sendPasswordResetEmail
};
