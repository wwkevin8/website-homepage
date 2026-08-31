"use strict";

const MEMBERSHIP_ACTION_PREFIX = "transport_membership_";

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textValue(...values) {
  const value = values.find(item => item !== null && item !== undefined && String(item).trim());
  return value === undefined ? "" : String(value).trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function memberText(member) {
  if (!member) return "会员信息未记录";
  const name = textValue(member.nickname, member.full_name, member.public_user_id, "会员");
  return member.public_user_id && member.public_user_id !== name
    ? `${name}（${member.public_user_id}）`
    : name;
}

function advisorText(admin) {
  return admin ? textValue(admin.name, admin.username, "未记录") : "未记录";
}

function benefitContext({ claim, entitlement, member, advisor, fallbackClaim = {} }) {
  const sourceClaim = claim || fallbackClaim || {};
  return {
    claim: sourceClaim,
    siteUserId: textValue(sourceClaim.site_user_id, entitlement?.site_user_id),
    member,
    memberText: memberText(member),
    cycle: textValue(sourceClaim.membership_cycle, entitlement?.membership_cycle, "周期未记录"),
    advisor,
    advisorText: advisorText(advisor),
    orderNo: textValue(sourceClaim.linked_order_no)
  };
}

function membershipActionLabel(action, metadata) {
  if (metadata.forced === true) return "已强制处理会员权益关联冲突";
  if (metadata.confirmed_used === true) return "已纠正已使用会员权益关联";
  if (action === "transport_membership_link") return "已关联会员权益";
  if (action === "transport_membership_unlink") return "已解除会员权益关联";
  if (action === "transport_membership_replace") return "已更换会员权益";
  if (action === "transport_membership_manual_create") return "已代会员补录接机订单";
  return "会员权益信息已更新";
}

function membershipDisplay(log, contexts) {
  const metadata = objectValue(log.metadata);
  const beforeData = objectValue(log.before_data);
  const afterData = objectValue(log.after_data);
  const historical = objectValue(metadata.historical_usage);
  const oldFallback = objectValue(beforeData.claim);
  const previousFallback = objectValue(afterData.previous_claim);
  const oldContext = contexts.old || benefitContext({ fallbackClaim: oldFallback.id ? oldFallback : previousFallback });
  const newContext = contexts.next || null;
  const actionLabel = membershipActionLabel(log.action, metadata);
  const reason = textValue(metadata.reason, historical.reason);
  const details = [];
  let summary = actionLabel;

  if (log.action === "transport_membership_link" && newContext) {
    summary = `${actionLabel}：${newContext.memberText}｜${newContext.cycle}｜所属顾问：${newContext.advisorText}`;
  } else if (log.action === "transport_membership_unlink" && oldContext) {
    summary = `${actionLabel}：${oldContext.memberText}｜${oldContext.cycle}`;
  } else if (log.action === "transport_membership_manual_create" && newContext) {
    summary = `${actionLabel}：${newContext.memberText}｜${newContext.cycle}｜所属顾问：${newContext.advisorText}`;
    if (afterData.group_id) details.push({ label: "拼车组", value: textValue(afterData.group_id) });
    if (afterData.group_action) details.push({ label: "分组方式", value: afterData.group_action === "join_existing" ? "加入已有拼车组" : "创建新单人拼车组" });
  } else if (log.action === "transport_membership_replace" && (oldContext || newContext)) {
    if (oldContext?.siteUserId && newContext?.siteUserId && oldContext.siteUserId === newContext.siteUserId) {
      summary = `${actionLabel}：${newContext.memberText}｜会员周期：${oldContext.cycle} → ${newContext.cycle}`;
    } else {
      summary = `${actionLabel}：${oldContext?.memberText || "原会员未记录"} → ${newContext?.memberText || "新会员未记录"}`;
    }
    if (newContext) details.push({ label: "所属顾问", value: newContext.advisorText });
  }

  if (metadata.confirmed_used === true) {
    const historicalOrderNo = textValue(historical.order_no, oldContext?.orderNo, beforeData.request?.order_no);
    if (oldContext) details.push({ label: "原会员", value: oldContext.memberText });
    if (historicalOrderNo) details.push({ label: "原订单", value: historicalOrderNo });
  } else if (metadata.forced === true && oldContext) {
    details.push({ label: "原会员", value: oldContext.memberText });
  }
  if (reason) details.push({ label: "原因", value: reason });

  return {
    id: log.id,
    action: log.action,
    action_code: log.action,
    action_label: actionLabel,
    display_summary: summary,
    display_details: details,
    created_at: log.created_at,
    admin_user_id: log.admin_user_id,
    admin_user: log.admin_user || null,
    metadata: reason ? { reason } : {}
  };
}

async function formatTransportOperationLogs(supabase, logs = []) {
  const membershipLogs = logs.filter(log => String(log?.action || "").startsWith(MEMBERSHIP_ACTION_PREFIX));
  if (!membershipLogs.length) return logs;

  const claimIds = unique(membershipLogs.flatMap(log => {
    const metadata = objectValue(log.metadata);
    const beforeData = objectValue(log.before_data);
    const afterData = objectValue(log.after_data);
    return [
      metadata.old_claim_id,
      metadata.new_claim_id,
      beforeData.claim?.id,
      afterData.previous_claim?.id,
      metadata.historical_usage?.claim_id,
      afterData.claim_id
    ];
  }));

  let claims = [];
  if (claimIds.length) {
    const result = await supabase.from("membership_benefit_claims")
      .select("id,entitlement_id,site_user_id,membership_cycle,status,linked_order_no")
      .in("id", claimIds);
    if (result.error) console.warn("transport_membership_log_claim_context_failed", result.error);
    else claims = result.data || [];
  }
  const claimById = new Map(claims.map(item => [item.id, item]));
  const entitlementIds = unique([
    ...claims.map(item => item.entitlement_id),
    ...membershipLogs.map(log => log?.metadata?.entitlement_id),
    ...membershipLogs.map(log => log?.metadata?.historical_usage?.entitlement_id),
    ...membershipLogs.map(log => log?.after_data?.entitlement_id)
  ]);
  let entitlements = [];
  if (entitlementIds.length) {
    const result = await supabase.from("membership_entitlements")
      .select("id,site_user_id,membership_cycle,advisor_admin_id,created_by_admin_id,granted_by_admin_id")
      .in("id", entitlementIds);
    if (result.error) console.warn("transport_membership_log_entitlement_context_failed", result.error);
    else entitlements = result.data || [];
  }
  const entitlementById = new Map(entitlements.map(item => [item.id, item]));
  const siteUserIds = unique([
    ...claims.map(item => item.site_user_id),
    ...entitlements.map(item => item.site_user_id),
    ...membershipLogs.map(log => log?.before_data?.claim?.site_user_id),
    ...membershipLogs.map(log => log?.after_data?.previous_claim?.site_user_id),
    ...membershipLogs.map(log => log?.metadata?.historical_usage?.site_user_id),
    ...membershipLogs.map(log => log?.after_data?.site_user_id)
  ]);
  let members = [];
  if (siteUserIds.length) {
    const result = await supabase.from("site_users").select("id,public_user_id,nickname").in("id", siteUserIds);
    if (result.error) console.warn("transport_membership_log_member_context_failed", result.error);
    else members = result.data || [];
  }
  const memberById = new Map(members.map(item => [item.id, item]));
  const advisorIds = unique([
    ...entitlements.flatMap(item => [item.advisor_admin_id, item.created_by_admin_id, item.granted_by_admin_id]),
    ...membershipLogs.flatMap(log => [log?.metadata?.advisor_snapshot_id, log?.before_data?.request?.membership_advisor_admin_id])
    ,...membershipLogs.map(log => log?.after_data?.advisor_admin_id)
  ]);
  let advisors = [];
  if (advisorIds.length) {
    const result = await supabase.from("admin_users").select("id,name,username").in("id", advisorIds);
    if (result.error) console.warn("transport_membership_log_advisor_context_failed", result.error);
    else advisors = result.data || [];
  }
  const advisorById = new Map(advisors.map(item => [item.id, item]));

  function contextFor(claimId, fallbackClaim = {}, fallbackEntitlementId = null, fallbackAdvisorId = null) {
    const claim = claimById.get(claimId) || (fallbackClaim?.id ? fallbackClaim : null);
    const entitlementId = textValue(claim?.entitlement_id, fallbackEntitlementId);
    const entitlement = entitlementById.get(entitlementId) || null;
    const siteUserId = textValue(claim?.site_user_id, entitlement?.site_user_id, fallbackClaim?.site_user_id);
    const advisorId = textValue(fallbackAdvisorId, entitlement?.advisor_admin_id, entitlement?.created_by_admin_id, entitlement?.granted_by_admin_id);
    if (!claim && !entitlement && !siteUserId) return null;
    return benefitContext({
      claim,
      entitlement,
      member: memberById.get(siteUserId) || null,
      advisor: advisorById.get(advisorId) || null,
      fallbackClaim
    });
  }

  return logs.map(log => {
    if (!String(log?.action || "").startsWith(MEMBERSHIP_ACTION_PREFIX)) return log;
    const metadata = objectValue(log.metadata);
    const beforeData = objectValue(log.before_data);
    const afterData = objectValue(log.after_data);
    const oldFallback = objectValue(beforeData.claim).id ? objectValue(beforeData.claim) : objectValue(afterData.previous_claim);
    const oldClaimId = textValue(metadata.old_claim_id, oldFallback.id, metadata.historical_usage?.claim_id);
    const newClaimId = textValue(metadata.new_claim_id, afterData.target_claim_id, afterData.claim_id);
    return membershipDisplay(log, {
      old: contextFor(oldClaimId, oldFallback, metadata.historical_usage?.entitlement_id, beforeData.request?.membership_advisor_admin_id),
      next: contextFor(newClaimId, {}, textValue(metadata.entitlement_id, afterData.entitlement_id), textValue(metadata.advisor_snapshot_id, afterData.advisor_admin_id))
    });
  });
}

module.exports = { formatTransportOperationLogs, membershipActionLabel };
