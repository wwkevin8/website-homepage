const RESEND_API_URL = "https://api.resend.com/emails";

const DEFAULT_FROM = "NGN Postage <login@auth.ngn.best>";
const SUPPORT_WECHAT = "NOTTINGHAMNGN";
const SUPPORT_PHONE = "07941 008555";
const SAFE_NOTICE = "邮寄需求已提交，客服会联系你确认路线、送箱、取件和最终价格。最终费用以实际称重和客服确认为准。";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
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
  if (!host) return "https://ngn.best";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const base = `${proto}://${host}`;
  return /localhost|127\.0\.0\.1/i.test(base) ? "https://ngn.best" : base;
}

function getFrom() {
  return getOptionalEnv("POSTAGE_EMAIL_FROM")
    || getOptionalEnv("AUTH_EMAIL_FROM")
    || getOptionalEnv("SMTP_FROM")
    || DEFAULT_FROM;
}

function buildPostageStudentEmail(req, order, recipientEmail) {
  const baseUrl = getBaseUrl(req);
  const qrUrl = `${baseUrl}/img/storage-service-qr.jpg`;
  const submittedAt = order.created_at
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(order.created_at))
    : "";

  const text = [
    `订单编号：${order.order_no}`,
    `服务类型：${order.service_type || "--"}`,
    submittedAt ? `提交时间：${submittedAt}` : "",
    "当前状态：新提交",
    "",
    SAFE_NOTICE,
    "",
    `请添加客服微信：${SUPPORT_WECHAT}`,
    `客服电话：${SUPPORT_PHONE}`,
    `客服二维码：${qrUrl}`,
    "",
    "如果邮件客户端没有显示二维码图片，请直接搜索上面的微信号添加客服。"
  ].filter(Boolean).join("\n");

  const rows = [
    ["订单编号", order.order_no],
    ["服务类型", order.service_type || "--"],
    ["提交时间", submittedAt || "--"],
    ["当前状态", "新提交"],
    ["客服微信", SUPPORT_WECHAT],
    ["客服电话", SUPPORT_PHONE]
  ].map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e7edf5;color:#516070;background:#f8fafc;font-weight:700;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e7edf5;color:#14213d;font-weight:700;">${escapeHtml(value)}</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:Arial,'Noto Sans SC',sans-serif;line-height:1.7;color:#172033;max-width:680px;margin:0 auto;">
      <h1 style="margin:0 0 14px;font-size:24px;color:#12345b;">邮寄需求已提交</h1>
      <p style="margin:0 0 18px;">${escapeHtml(SAFE_NOTICE)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e7edf5;border-radius:10px;overflow:hidden;margin:18px 0;">${rows}</table>
      <div style="margin:20px 0;padding:18px;border:1px solid #d8e6f5;background:#f7fbff;border-radius:12px;">
        <p style="margin:0 0 12px;font-weight:700;">请扫码添加 Stella-诺丁汉 NGN 总客服微信。</p>
        <p style="margin:0 0 14px;color:#516070;">如果二维码没有显示，请直接搜索微信号 ${escapeHtml(SUPPORT_WECHAT)}，或致电 ${escapeHtml(SUPPORT_PHONE)}。</p>
        <img src="${escapeHtml(qrUrl)}" alt="Stella-诺丁汉 NGN 总客服微信二维码" style="display:block;width:220px;max-width:100%;height:auto;border:1px solid #dbe5ef;border-radius:8px;background:#fff;">
      </div>
      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">风险提示：最终费用以实际称重和客服确认为准。</p>
    </div>
  `.trim();

  return {
    from: getFrom(),
    to: recipientEmail,
    subject: `邮寄需求已提交：${order.order_no}`,
    text,
    html
  };
}

async function sendWithResend(payload) {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
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
    throw new Error(data?.message || data?.error?.message || "Failed to send postage confirmation email");
  }
  return { provider: "resend", id: data?.id || null };
}

async function sendPostageStudentConfirmationEmail(req, { order, recipientEmail }) {
  const email = String(recipientEmail || "").trim();
  if (!email) {
    return { ok: false, skipped: true, reason: "missing_recipient_email" };
  }
  const payload = buildPostageStudentEmail(req, order, email);
  const result = await sendWithResend(payload);
  return { ok: true, skipped: false, ...result, email };
}

module.exports = {
  SUPPORT_WECHAT,
  SUPPORT_PHONE,
  SAFE_NOTICE,
  buildPostageStudentEmail,
  sendPostageStudentConfirmationEmail
};
