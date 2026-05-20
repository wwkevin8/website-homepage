<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchMemberships } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const CURRENT_CYCLE = "2026-27";

const route = useRoute();
const membership = ref(null);
const loading = ref(false);
const error = ref("");

const membershipId = computed(() => String(route.params.id || "").trim());
const user = computed(() => membership.value?.user || {});
const claim = computed(() => membership.value?.claim || {});
const metadata = computed(() => membership.value?.metadata || {});
const auditLogs = computed(() => Array.isArray(membership.value?.audit_logs) ? membership.value.audit_logs : []);
const lastOperation = computed(() => membership.value?.last_operation || auditLogs.value[0] || null);

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  } catch (err) {
    return displayValue(value);
  }
}

function formatBirthday(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
  if (!match) {
    return displayValue(value);
  }
  return `${Number(match[1])}月${Number(match[2])}日`;
}

function userLabel(record = user.value) {
  return record.nickname || record.name || record.public_user_id || record.email || record.phone || "--";
}

function adminLabel(admin) {
  if (!admin) {
    return "--";
  }
  return admin.name || admin.username || admin.email || "--";
}

function benefitLabel(type) {
  const labels = {
    storage: "寄存",
    pickup: "接机",
    moving: "搬家",
    welcome_pack: "新生礼包",
    cashback: "返现/人工备注",
    manual: "人工记录"
  };
  return labels[type] || displayValue(type);
}

function membershipStatusLabel(status) {
  const labels = {
    active: "有效",
    revoked: "已作废",
    expired: "已过期"
  };
  return labels[status] || displayValue(status);
}

function benefitStatusLabel(status) {
  const labels = {
    redeemed: "已兑换",
    revoked: "已作废",
    expired: "已过期",
    selected: "已选择权益",
    reserved: "已登记权益",
    used: "权益已使用",
    cancelled: "已作废",
    manual: "人工记录"
  };
  return labels[status] || displayValue(status);
}

function actionLabel(action) {
  const labels = {
    membership_entitlement_granted: "创建会员",
    membership_entitlement_deleted: "更新会员信息",
    membership_manual_claim_recorded: "登记权益",
    membership_claim_marked_used: "修改权益",
    membership_claim_cancelled: "修改权益",
    membership_claim_reset: "修改权益",
    membership_claim_order_bound: "更新会员信息",
    membership_claim_order_unbound: "更新会员信息",
    membership_activation_code_created: "生成激活码",
    membership_activation_codes_batch_created: "批量生成激活码",
    membership_activation_code_deleted: "更新会员信息",
    membership_activation_code_revoked: "更新会员信息",
    membership_activation_code_redeemed: "使用激活码兑换"
  };
  return labels[action] || displayValue(action);
}

function statusTone(status) {
  if (status === "active" || status === "used" || status === "redeemed") {
    return "success";
  }
  if (status === "selected" || status === "reserved" || status === "manual") {
    return "warning";
  }
  if (status === "cancelled" || status === "revoked" || status === "expired") {
    return "danger";
  }
  return "neutral";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin/memberships") ? returnTo : "/admin/memberships";
}

const userFields = computed(() => [
  field("姓名", userLabel()),
  field("邮箱", user.value.email),
  field("手机号", user.value.phone),
  field("微信号", user.value.wechat_id),
  field("用户 ID", firstValue(user.value.public_user_id, membership.value?.site_user_id)),
  field("系统用户 ID", membership.value?.site_user_id)
]);

const membershipFields = computed(() => [
  field("会员周期", membership.value?.membership_cycle),
  field("会员状态", membershipStatusLabel(membership.value?.status)),
  field("权益状态", benefitStatusLabel(claim.value?.status)),
  field("权益类型", benefitLabel(claim.value?.benefit_type)),
  field("所属顾问", adminLabel(membership.value?.advisor)),
  field("创建时间", formatDateTime(membership.value?.created_at)),
  field("兑换码来源", activationCodeSource()),
  field("会员生日", formatBirthday(firstValue(membership.value?.member_birthday, metadata.value.member_birthday))),
  field("生日提醒", membership.value?.birthday_reminder_enabled === false ? "已关闭" : "已开启"),
  field("提醒顾问", adminLabel(membership.value?.advisor)),
  field("上次提醒时间", formatDateTime(membership.value?.last_birthday_reminder?.created_at)),
  field("备注", firstValue(claim.value?.admin_note, membership.value?.notes, metadata.value.notes), true)
]);

const operationFields = computed(() => [
  field("最后操作人", adminLabel(lastOperation.value?.admin_user)),
  field("最后操作时间", formatDateTime(lastOperation.value?.created_at)),
  field("最后操作内容", actionLabel(lastOperation.value?.action), true)
]);

function activationCodeSource() {
  const activationCode = membership.value?.activation_code || {};
  const codePrefix = firstValue(activationCode.code_prefix, metadata.value.code_prefix, metadata.value.activation_code_prefix);
  if (!firstValue(metadata.value.activation_code_id, activationCode.id, codePrefix)) {
    return "--";
  }
  return [codePrefix, metadata.value.activation_code_id || activationCode.id].filter(Boolean).join(" / ");
}

function cachedMembership() {
  if (!membershipId.value || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(`admin:membership:${membershipId.value}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

async function fetchMembershipDetail() {
  const cycle = String(route.query.cycle || CURRENT_CYCLE);
  const payload = await fetchMemberships({
    id: membershipId.value,
    cycle,
    page: 1,
    page_size: 1
  });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.find(item => String(item.id) === membershipId.value) || null;
}

async function loadMembership() {
  if (!membershipId.value) {
    membership.value = null;
    error.value = "缺少会员 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    membership.value = await fetchMembershipDetail() || cachedMembership();
    if (!membership.value) {
      error.value = "未找到该会员记录，请从会员列表重新进入。";
    }
  } catch (err) {
    membership.value = cachedMembership();
    error.value = membership.value ? "" : (err.message || "会员详情加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(loadMembership);
</script>

<template>
  <section class="membership-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Membership detail</p>
        <h2>会员权益详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回会员列表" />
      </div>
    </div>

    <LoadingState v-if="loading">正在加载会员详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!membership" title="未找到会员记录" description="请从会员列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>会员用户</span>
          <strong>{{ userLabel() }}</strong>
        </div>
        <StatusBadge :tone="statusTone(membership.status)">
          {{ membershipStatusLabel(membership.status) }}
        </StatusBadge>
      </div>

      <DetailSection title="用户基本信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in userFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="会员信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in membershipFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="操作信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in operationFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="操作记录">
        <ul v-if="auditLogs.length" class="community-detail-list">
          <li v-for="log in auditLogs" :key="log.id || `${log.action}-${log.created_at}`">
            <strong>{{ actionLabel(log.action) }}</strong>
            <span>{{ adminLabel(log.admin_user) }} / {{ formatDateTime(log.created_at) }}</span>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无操作记录。</p>
      </DetailSection>
    </template>
  </section>
</template>
