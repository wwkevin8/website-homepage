const nodemailer = require("nodemailer");

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_NOTIFY_EMAIL = "songjunwang129@gmail.com";
const DEFAULT_FROM = "NGN Sync Audit <audit@ngn.best>";

let cachedTransporter = null;
let cachedTransportKey = "";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getNotifyEmail() {
  return getOptionalEnv("TRANSPORT_SYNC_AUDIT_NOTIFY_EMAIL") || DEFAULT_NOTIFY_EMAIL;
}

function getEmailFrom() {
  return getOptionalEnv("TRANSPORT_SYNC_AUDIT_EMAIL_FROM")
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
  const user = getOptionalEnv("SMTP_USER");
  const pass = getOptionalEnv("SMTP_PASS");
  const from = getEmailFrom();
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

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  return year && month && day ? `${year}/${month}/${day}` : "--";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAuditAdminUrl() {
  const baseUrl = getOptionalEnv("APP_BASE_URL") || "https://ngn.best";
  return `${baseUrl.replace(/\/+$/, "")}/transport-admin-sync-logs.html`;
}

function formatSkippedReason(item) {
  const reason = String(item?.reason || "").trim();
  if (reason === "no_site_user_linked_member") {
    return "该组没有可用于个人中心校验的注册用户成员";
  }
  if (reason === "order_not_in_recent_personal_center_list") {
    return "该组样本订单未出现在对应用户的个人中心最近记录里";
  }
  return reason || "--";
}

function buildMismatchLines(items) {
  return (items || []).slice(0, 20).map(item => {
    return `- ${item.group_id || "--"} / ${item.surface || "--"} / ${item.field || "--"} | 期望=${item.expected ?? "--"} | 实际=${item.actual ?? "--"}${item.order_no ? ` | 订单=${item.order_no}` : ""}`;
  });
}

function buildCriticalDuplicateLines(report) {
  return (report?.mismatches || [])
    .filter(item => item?.field === "future_duplicate_same_service_order")
    .slice(0, 20)
    .map(item => `- ${item.group_id || "--"} | 璁㈠崟=${item.order_no || "--"} | ${item.actual || "--"}`);
}

function buildSkippedLines(items) {
  return (items || []).slice(0, 20).map(item => {
    return `- ${item.group_id || "--"} / ${item.surface || "--"} / ${formatSkippedReason(item)}${item.order_no ? ` | 订单=${item.order_no}` : ""}`;
  });
}

function buildTransportSyncAuditEmail(report) {
  const to = getNotifyEmail();
  const from = getEmailFrom();
  const checkedAt = formatDateTime(report.checked_at);
  const adminUrl = getAuditAdminUrl();
  const mismatchLines = buildMismatchLines(report.mismatches);
  const skippedLines = buildSkippedLines(report.skipped_checks);
  const criticalDuplicateLines = buildCriticalDuplicateLines(report);
  const statusText = report.mismatch_count > 0
    ? `发现 ${report.mismatch_count} 处异常`
    : "本次巡检正常";

  const subject = `【接送机同步巡检】${statusText} - ${checkedAt}`;
  const text = [
    "接送机同步巡检已完成。",
    "",
    `巡检时间：${checkedAt}`,
    `抽查组数：${report.sampled_group_count || 0}`,
    `个人中心订单数：${report.checked_request_count || 0}`,
    `异常数：${report.mismatch_count || 0}`,
    `跳过数：${report.skipped_check_count || 0}`,
    "",
    `后台查看入口：${adminUrl}`,
    "",
    "异常明细：",
    ...(mismatchLines.length ? mismatchLines : ["- 无"]),
    "",
    "跳过明细：",
    ...(skippedLines.length ? skippedLines : ["- 无"])
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#1f2937;">
      <h2 style="margin:0 0 12px;">接送机同步巡检已完成</h2>
      <div style="padding:16px 18px;border-radius:16px;background:#f8fbff;border:1px solid rgba(19,74,169,0.1);margin-bottom:18px;">
        <p style="margin:0 0 6px;"><strong>巡检时间：</strong>${escapeHtml(checkedAt)}</p>
        <p style="margin:0 0 6px;"><strong>抽查组数：</strong>${escapeHtml(String(report.sampled_group_count || 0))}</p>
        <p style="margin:0 0 6px;"><strong>个人中心订单数：</strong>${escapeHtml(String(report.checked_request_count || 0))}</p>
        <p style="margin:0 0 6px;"><strong>异常数：</strong>${escapeHtml(String(report.mismatch_count || 0))}</p>
        <p style="margin:0;"><strong>跳过数：</strong>${escapeHtml(String(report.skipped_check_count || 0))}</p>
      </div>
      <p style="margin:0 0 16px;">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#134aa9;color:#fff;text-decoration:none;font-weight:700;">打开后台巡检日志</a>
      </p>
      <h3 style="margin:20px 0 8px;">异常明细</h3>
      <div style="padding:14px 16px;border-radius:14px;background:#fff7f7;border:1px solid rgba(214,48,49,0.12);">
        ${(mismatchLines.length ? mismatchLines : ["- 无"]).map(line => `<div style="margin:0 0 6px;">${escapeHtml(line)}</div>`).join("")}
      </div>
      <h3 style="margin:20px 0 8px;">跳过明细</h3>
      <div style="padding:14px 16px;border-radius:14px;background:#f8fbff;border:1px solid rgba(19,74,169,0.08);">
        ${(skippedLines.length ? skippedLines : ["- 无"]).map(line => `<div style="margin:0 0 6px;">${escapeHtml(line)}</div>`).join("")}
      </div>
    </div>
  `.trim();

  return { to, from, subject, text, html };
}

function buildTransportSyncDailyDigestEmail(summary) {
  const to = getNotifyEmail();
  const from = getEmailFrom();
  const adminUrl = getAuditAdminUrl();
  const mismatchLines = buildMismatchLines(summary.topMismatches);
  const skippedLines = buildSkippedLines(summary.topSkipped);
  const subject = `【接送机同步巡检晨报】${formatDate(summary.periodEnd)} 最近24小时汇总`;

  const text = [
    "接送机同步巡检晨报",
    "",
    `统计区间：${formatDateTime(summary.periodStart)} - ${formatDateTime(summary.periodEnd)}`,
    `巡检次数：${summary.runCount || 0}`,
    `抽查组总数：${summary.sampledGroupTotal || 0}`,
    `个人中心订单总数：${summary.checkedRequestTotal || 0}`,
    `累计异常数：${summary.mismatchTotal || 0}`,
    `出现异常的批次数：${summary.runsWithMismatches || 0}`,
    `累计跳过数：${summary.skippedTotal || 0}`,
    "",
    `后台查看入口：${adminUrl}`,
    "",
    "重点异常：",
    ...(mismatchLines.length ? mismatchLines : ["- 无"]),
    "",
    "重点跳过：",
    ...(skippedLines.length ? skippedLines : ["- 无"])
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#1f2937;">
      <h2 style="margin:0 0 12px;">接送机同步巡检晨报</h2>
      <div style="padding:16px 18px;border-radius:16px;background:#f8fbff;border:1px solid rgba(19,74,169,0.1);margin-bottom:18px;">
        <p style="margin:0 0 6px;"><strong>统计区间：</strong>${escapeHtml(formatDateTime(summary.periodStart))} - ${escapeHtml(formatDateTime(summary.periodEnd))}</p>
        <p style="margin:0 0 6px;"><strong>巡检次数：</strong>${escapeHtml(String(summary.runCount || 0))}</p>
        <p style="margin:0 0 6px;"><strong>抽查组总数：</strong>${escapeHtml(String(summary.sampledGroupTotal || 0))}</p>
        <p style="margin:0 0 6px;"><strong>个人中心订单总数：</strong>${escapeHtml(String(summary.checkedRequestTotal || 0))}</p>
        <p style="margin:0 0 6px;"><strong>累计异常数：</strong>${escapeHtml(String(summary.mismatchTotal || 0))}</p>
        <p style="margin:0 0 6px;"><strong>出现异常的批次数：</strong>${escapeHtml(String(summary.runsWithMismatches || 0))}</p>
        <p style="margin:0;"><strong>累计跳过数：</strong>${escapeHtml(String(summary.skippedTotal || 0))}</p>
      </div>
      <p style="margin:0 0 16px;">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#134aa9;color:#fff;text-decoration:none;font-weight:700;">打开后台巡检日志</a>
      </p>
      <h3 style="margin:20px 0 8px;">重点异常</h3>
      <div style="padding:14px 16px;border-radius:14px;background:#fff7f7;border:1px solid rgba(214,48,49,0.12);">
        ${(mismatchLines.length ? mismatchLines : ["- 无"]).map(line => `<div style="margin:0 0 6px;">${escapeHtml(line)}</div>`).join("")}
      </div>
      <h3 style="margin:20px 0 8px;">重点跳过</h3>
      <div style="padding:14px 16px;border-radius:14px;background:#f8fbff;border:1px solid rgba(19,74,169,0.08);">
        ${(skippedLines.length ? skippedLines : ["- 无"]).map(line => `<div style="margin:0 0 6px;">${escapeHtml(line)}</div>`).join("")}
      </div>
    </div>
  `.trim();

  return { to, from, subject, text, html };
}

function buildTransportDailyFlowTestEmail(report, cleanup = {}) {
  const to = getNotifyEmail();
  const from = getEmailFrom();
  const checkedAt = formatDateTime(report?.checked_at);
  const adminUrl = getAuditAdminUrl();
  const mismatchLines = buildMismatchLines(report?.mismatches);
  const skippedLines = buildSkippedLines(report?.skipped_checks);
  const passed = Number(report?.mismatch_count || 0) === 0;
  const statusText = passed ? "通过" : `失败（${Number(report?.mismatch_count || 0)} 项异常）`;
  const cleanupText = cleanup?.completed
    ? `已清理 ${Number(cleanup?.planned_user_count || 0)} 个测试账号`
    : `清理未完成：${cleanup?.error || "unknown"}`;
  const subject = `【每日测试】${statusText} - ${checkedAt}`;

  const text = [
    "接送机每日流程测试结果",
    "",
    `执行时间：${checkedAt}`,
    `结果：${statusText}`,
    `检查分组数：${Number(report?.sampled_group_count || 0)}`,
    `检查订单数：${Number(report?.checked_request_count || 0)}`,
    `异常数：${Number(report?.mismatch_count || 0)}`,
    `跳过数：${Number(report?.skipped_check_count || 0)}`,
    `清理结果：${cleanupText}`,
    "",
    `后台日志入口：${adminUrl}`,
    "",
    "异常明细：",
    ...(mismatchLines.length ? mismatchLines : ["- 无"]),
    "",
    "跳过明细：",
    ...(skippedLines.length ? skippedLines : ["- 无"])
  ].join("\n");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#1f2937;">
      <h2 style="margin:0 0 12px;">接送机每日流程测试结果</h2>
      <div style="padding:16px 18px;border-radius:16px;background:${passed ? "#f0fdf4" : "#fff7f7"};border:1px solid ${passed ? "rgba(34,197,94,0.16)" : "rgba(214,48,49,0.12)"};margin-bottom:18px;">
        <p style="margin:0 0 6px;"><strong>执行时间：</strong>${escapeHtml(checkedAt)}</p>
        <p style="margin:0 0 6px;"><strong>结果：</strong>${escapeHtml(statusText)}</p>
        <p style="margin:0 0 6px;"><strong>检查分组数：</strong>${escapeHtml(String(report?.sampled_group_count || 0))}</p>
        <p style="margin:0 0 6px;"><strong>检查订单数：</strong>${escapeHtml(String(report?.checked_request_count || 0))}</p>
        <p style="margin:0 0 6px;"><strong>异常数：</strong>${escapeHtml(String(report?.mismatch_count || 0))}</p>
        <p style="margin:0;"><strong>清理结果：</strong>${escapeHtml(cleanupText)}</p>
      </div>
      <p style="margin:0 0 16px;">
        <a href="${escapeHtml(adminUrl)}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#134aa9;color:#fff;text-decoration:none;font-weight:700;">打开后台巡检日志</a>
      </p>
      <h3 style="margin:20px 0 8px;">异常明细</h3>
      <div style="padding:14px 16px;border-radius:14px;background:#fff7f7;border:1px solid rgba(214,48,49,0.12);">
        ${(mismatchLines.length ? mismatchLines : ["- 无"]).map(line => `<div style="margin:0 0 6px;">${escapeHtml(line)}</div>`).join("")}
      </div>
      <h3 style="margin:20px 0 8px;">跳过明细</h3>
      <div style="padding:14px 16px;border-radius:14px;background:#f8fbff;border:1px solid rgba(19,74,169,0.08);">
        ${(skippedLines.length ? skippedLines : ["- 无"]).map(line => `<div style="margin:0 0 6px;">${escapeHtml(line)}</div>`).join("")}
      </div>
    </div>
  `.trim();

  return { to, from, subject, text, html };
}

async function sendWithResend(mail) {
  const apiKey = getOptionalEnv("RESEND_API_KEY");
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    const message =
      (data && data.message) ||
      (data && data.error && data.error.message) ||
      "Resend delivery failed";
    throw new Error(message);
  }

  return {
    id: data && data.id ? data.id : null
  };
}

async function sendWithSmtp(mail) {
  const transporter = getTransporter();
  const info = await transporter.sendMail(mail);
  return {
    id: info.messageId || ""
  };
}

async function deliverEmail(mail) {
  if (hasResendConfig()) {
    try {
      const result = await sendWithResend(mail);
      return {
        ok: true,
        skipped: false,
        provider: "resend",
        messageId: result.id || "",
        email: mail.to
      };
    } catch (error) {
      if (!hasSmtpConfig()) {
        return {
          ok: false,
          skipped: false,
          provider: "resend",
          error: error && error.message ? error.message : "Resend delivery failed",
          email: mail.to
        };
      }
    }
  }

  if (hasSmtpConfig()) {
    try {
      const result = await sendWithSmtp(mail);
      return {
        ok: true,
        skipped: false,
        provider: "smtp",
        messageId: result.id || "",
        email: mail.to
      };
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        provider: "smtp",
        error: error && error.message ? error.message : "SMTP delivery failed",
        email: mail.to
      };
    }
  }

  return {
    ok: false,
    skipped: true,
    reason: "missing resend or smtp configuration"
  };
}

async function sendTransportSyncAuditEmail(report) {
  return deliverEmail(buildTransportSyncAuditEmail(report));
}

async function sendTransportSyncDailyDigestEmail(summary) {
  return deliverEmail(buildTransportSyncDailyDigestEmail(summary));
}

async function sendTransportDailyFlowTestEmail(report, cleanup) {
  return deliverEmail(buildTransportDailyFlowTestEmail(report, cleanup));
}

module.exports = {
  sendTransportSyncAuditEmail,
  sendTransportSyncDailyDigestEmail,
  sendTransportDailyFlowTestEmail,
  formatSkippedReason
};
