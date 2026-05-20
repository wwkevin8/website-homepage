const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "NGN Membership <members@ngn.best>";

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

function getEmailFrom() {
  return getOptionalEnv("MEMBERSHIP_BIRTHDAY_EMAIL_FROM")
    || getOptionalEnv("AUTH_EMAIL_FROM")
    || getOptionalEnv("SMTP_FROM")
    || DEFAULT_FROM;
}

function getDefaultAdvisorEmail() {
  return getOptionalEnv("MEMBERSHIP_BIRTHDAY_REMINDER_DEFAULT_EMAIL")
    || getOptionalEnv("MEMBERSHIP_BIRTHDAY_NOTIFY_EMAIL")
    || getOptionalEnv("STORAGE_SYNC_AUDIT_NOTIFY_EMAIL");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return normalizeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getUkDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    reminderDate: `${values.year}-${values.month}-${values.day}`,
    label: `${Number(values.month)}月${Number(values.day)}日`
  };
}

function benefitLabel(type) {
  const labels = {
    pickup: "接机",
    storage: "寄存",
    moving: "搬家",
    welcome_pack: "新生礼包",
    cashback: "返现/人工备注"
  };
  return labels[type] || normalizeText(type) || "--";
}

function memberName(user) {
  return user?.nickname || user?.name || user?.public_user_id || user?.email || user?.phone || "--";
}

function adminName(admin) {
  return admin?.name || admin?.username || admin?.email || "顾问";
}

function memberBirthdayLabel(member) {
  const month = Number(member?.birthday_month);
  const day = Number(member?.birthday_day);
  if (Number.isFinite(month) && Number.isFinite(day)) {
    return `${month}月${day}日`;
  }
  return "--";
}

function buildBirthdayEmail(advisor, members, dateLabel, toEmail) {
  const subject = `今日会员生日提醒 | ${dateLabel}`;
  const lines = members.map((member, index) => {
    const user = member.user || {};
    return [
      `${index + 1}. ${memberName(user)}`,
      `   她/他登记的生日日期为：${memberBirthdayLabel(member)}`,
      `   微信：${user.wechat_id || "--"}`,
      `   手机号：${user.phone || "--"}`,
      `   会员周期：${member.membership_cycle || "--"}`,
      `   权益类型：${benefitLabel(member.claim?.benefit_type)}`
    ].join("\n");
  });

  const text = [
    `Hi ${adminName(advisor)},`,
    "",
    "今天有以下会员过生日：",
    "",
    ...lines,
    "",
    "请记得给同学发送生日祝福，并根据实际情况提醒会员权益或安排小福利。",
    "",
    "NGN 会员系统"
  ].join("\n");

  const htmlItems = members.map((member, index) => {
    const user = member.user || {};
    return `
      <li style="margin:0 0 14px;">
        <strong>${index + 1}. ${escapeHtml(memberName(user))}</strong>
        <div>她/他登记的生日日期为：${escapeHtml(memberBirthdayLabel(member))}</div>
        <div>微信：${escapeHtml(user.wechat_id || "--")}</div>
        <div>手机号：${escapeHtml(user.phone || "--")}</div>
        <div>会员周期：${escapeHtml(member.membership_cycle || "--")}</div>
        <div>权益类型：${escapeHtml(benefitLabel(member.claim?.benefit_type))}</div>
      </li>
    `.trim();
  }).join("");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.7;color:#17202a;">
      <p>Hi ${escapeHtml(adminName(advisor))},</p>
      <p>今天有以下会员过生日：</p>
      <ol style="padding-left:22px;">${htmlItems}</ol>
      <p>请记得给同学发送生日祝福，并根据实际情况提醒会员权益或安排小福利。</p>
      <p>NGN 会员系统</p>
    </div>
  `.trim();

  return {
    from: getEmailFrom(),
    to: toEmail,
    subject,
    text,
    html
  };
}

async function sendWithResend(mail) {
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

async function queryByIds(supabase, table, columns, ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean).map(String)));
  if (!uniqueIds.length) {
    return [];
  }
  const { data, error } = await supabase.from(table).select(columns).in("id", uniqueIds);
  if (error) {
    throw error;
  }
  return data || [];
}

async function runMembershipBirthdayReminders(supabase, options = {}) {
  const today = getUkDateParts(options.now ? new Date(options.now) : new Date());
  const { data: memberships, error } = await supabase
    .from("membership_entitlements")
    .select("*")
    .eq("status", "active")
    .eq("birthday_month", today.month)
    .eq("birthday_day", today.day)
    .or("birthday_reminder_enabled.is.null,birthday_reminder_enabled.eq.true")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const allMemberships = memberships || [];
  if (!allMemberships.length) {
    return {
      ok: true,
      reminder_date: today.reminderDate,
      matched_count: 0,
      sent_count: 0,
      failed_count: 0,
      skipped_count: 0,
      groups: []
    };
  }

  const { data: sentRows, error: sentError } = await supabase
    .from("membership_birthday_reminders")
    .select("membership_id")
    .eq("reminder_date", today.reminderDate)
    .eq("status", "sent");
  if (sentError) {
    throw sentError;
  }
  const alreadySentIds = new Set((sentRows || []).map(row => String(row.membership_id)));
  const pendingMemberships = allMemberships.filter(item => !alreadySentIds.has(String(item.id)));

  const membershipIds = pendingMemberships.map(item => item.id);
  const userIds = pendingMemberships.map(item => item.site_user_id).filter(Boolean);
  const activationCodeIds = pendingMemberships
    .map(item => item.metadata?.activation_code_id)
    .filter(Boolean);

  const [users, claims, activationCodes] = await Promise.all([
    queryByIds(supabase, "site_users", "id, public_user_id, email, phone, nickname, wechat_id", userIds),
    membershipIds.length
      ? supabase
        .from("membership_benefit_claims")
        .select("*")
        .in("entitlement_id", membershipIds)
        .order("created_at", { ascending: false })
        .then(result => {
          if (result.error) throw result.error;
          return result.data || [];
        })
      : [],
    queryByIds(supabase, "membership_activation_codes", "id, generated_by_admin_id", activationCodeIds)
  ]);

  const userById = new Map(users.map(user => [String(user.id), user]));
  const activationCodeById = new Map(activationCodes.map(code => [String(code.id), code]));
  const claimByEntitlement = new Map();
  claims.forEach(claim => {
    if (!claimByEntitlement.has(String(claim.entitlement_id))) {
      claimByEntitlement.set(String(claim.entitlement_id), claim);
    }
  });

  const advisorIds = pendingMemberships
    .flatMap(item => {
      const activationCode = item.metadata?.activation_code_id
        ? activationCodeById.get(String(item.metadata.activation_code_id))
        : null;
      return [
        item.advisor_admin_id,
        item.created_by_admin_id,
        item.granted_by_admin_id,
        activationCode?.generated_by_admin_id
      ];
    })
    .filter(Boolean);
  const admins = await queryByIds(supabase, "admin_users", "id, name, username, email", advisorIds);
  const adminById = new Map(admins.map(admin => [String(admin.id), admin]));
  const fallbackEmail = getDefaultAdvisorEmail();

  const groups = new Map();
  pendingMemberships.forEach(membership => {
    const activationCode = membership.metadata?.activation_code_id
      ? activationCodeById.get(String(membership.metadata.activation_code_id))
      : null;
    const advisorId = membership.advisor_admin_id
      || membership.created_by_admin_id
      || membership.granted_by_admin_id
      || activationCode?.generated_by_admin_id
      || null;
    const advisor = advisorId ? adminById.get(String(advisorId)) || null : null;
    const email = advisor?.email || fallbackEmail || "";
    const key = advisorId ? `admin:${advisorId}` : `default:${email || "missing"}`;
    if (!groups.has(key)) {
      groups.set(key, {
        advisorId,
        advisor,
        email,
        members: []
      });
    }
    groups.get(key).members.push({
      ...membership,
      user: userById.get(String(membership.site_user_id)) || null,
      claim: claimByEntitlement.get(String(membership.id)) || null
    });
  });

  const results = [];
  for (const group of groups.values()) {
    if (!group.email) {
      const message = "Missing advisor email and default membership birthday reminder email";
      await writeReminderRows(supabase, group.members, {
        advisorId: group.advisorId,
        reminderDate: today.reminderDate,
        email: "",
        status: "failed",
        errorMessage: message
      });
      results.push({ ok: false, email: "", count: group.members.length, error: message });
      continue;
    }

    try {
      const mail = buildBirthdayEmail(group.advisor, group.members, today.label, group.email);
      const sendResult = await sendWithResend(mail);
      await writeReminderRows(supabase, group.members, {
        advisorId: group.advisorId,
        reminderDate: today.reminderDate,
        email: group.email,
        status: "sent",
        resendMessageId: sendResult.id
      });
      results.push({ ok: true, email: group.email, count: group.members.length, messageId: sendResult.id });
    } catch (sendError) {
      const message = sendError?.message || "Failed to send birthday reminder";
      await writeReminderRows(supabase, group.members, {
        advisorId: group.advisorId,
        reminderDate: today.reminderDate,
        email: group.email,
        status: "failed",
        errorMessage: message
      });
      results.push({ ok: false, email: group.email, count: group.members.length, error: message });
    }
  }

  const sentCount = results.filter(item => item.ok).reduce((sum, item) => sum + item.count, 0);
  const failedCount = results.filter(item => !item.ok).reduce((sum, item) => sum + item.count, 0);

  return {
    ok: failedCount === 0,
    reminder_date: today.reminderDate,
    matched_count: allMemberships.length,
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: allMemberships.length - pendingMemberships.length,
    groups: results
  };
}

async function writeReminderRows(supabase, members, options = {}) {
  const rows = (members || []).map(member => ({
    membership_id: member.id,
    advisor_admin_id: options.advisorId || null,
    reminder_date: options.reminderDate,
    sent_to_email: options.email || null,
    resend_message_id: options.resendMessageId || null,
    status: options.status || "pending",
    error_message: options.errorMessage || null
  }));
  if (!rows.length) {
    return;
  }
  const { error } = await supabase
    .from("membership_birthday_reminders")
    .upsert(rows, { onConflict: "membership_id,reminder_date" });
  if (error) {
    throw error;
  }
}

module.exports = {
  getUkDateParts,
  runMembershipBirthdayReminders
};
