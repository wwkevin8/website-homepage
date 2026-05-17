<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchMemberships } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import JsonPreview from "@/components/JsonPreview.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const CURRENT_CYCLE = "2026-27";

const route = useRoute();
const membership = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const membershipId = computed(() => String(route.params.id || "").trim());
const user = computed(() => membership.value?.user || {});
const claim = computed(() => membership.value?.claim || {});
const auditLogs = computed(() => Array.isArray(membership.value?.audit_logs) ? membership.value.audit_logs : []);
const metadata = computed(() => membership.value?.metadata || {});

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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? `GBP ${amount.toFixed(2)}` : displayValue(value);
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
    welcome_pack: "新生大礼包",
    cashback: "返现 / 人工备注",
    manual: "人工记录"
  };
  return labels[type] || displayValue(type);
}

function statusLabel(status) {
  const labels = {
    active: "有效 / 未使用",
    redeemed: "已兑换",
    revoked: "已作废",
    expired: "已过期",
    selected: "已选择",
    reserved: "已绑定订单",
    used: "已使用",
    cancelled: "已作废",
    manual: "人工记录"
  };
  return labels[status] || displayValue(status);
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

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/memberships") ? returnTo : "/admin-vue/memberships";
}

function oldMembershipHref() {
  return "/admin-memberships.html";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

const userFields = computed(() => [
  field("姓名", userLabel()),
  field("邮箱", user.value.email),
  field("手机号", user.value.phone),
  field("微信", user.value.wechat_id),
  field("User ID", firstValue(user.value.public_user_id, membership.value?.site_user_id)),
  field("站内用户 ID", membership.value?.site_user_id)
]);

const membershipFields = computed(() => [
  field("会员周期", membership.value?.membership_cycle),
  field("会员状态", statusLabel(claim.value?.status || membership.value?.status)),
  field("权益类型", benefitLabel(claim.value?.benefit_type)),
  field("关联订单号", claim.value?.linked_order_no),
  field("所属顾问", adminLabel(membership.value?.advisor)),
  field("会员生日信息", firstValue(membership.value?.member_birthday, metadata.value.member_birthday)),
  field("创建时间", formatDateTime(membership.value?.created_at)),
  field("更新时间", formatDateTime(membership.value?.updated_at))
]);

const activationFields = computed(() => [
  field("已使用激活码", metadata.value.activation_code_id ? "是" : "--"),
  field("激活码 ID", metadata.value.activation_code_id),
  field("激活码前缀", firstValue(metadata.value.code_prefix, metadata.value.activation_code_prefix)),
  field("兑换时间", formatDateTime(firstValue(metadata.value.redeemed_at, membership.value?.redeemed_at))),
  field("创建管理员", adminLabel(membership.value?.advisor))
]);

const benefitFields = computed(() => [
  field("权益名称", benefitLabel(claim.value?.benefit_type)),
  field("使用状态", statusLabel(claim.value?.status)),
  field("登记时间", formatDateTime(claim.value?.created_at)),
  field("更新时间", formatDateTime(claim.value?.updated_at)),
  field("操作人", adminLabel(membership.value?.advisor)),
  field("会员抵扣", formatMoney(claim.value?.membership_discount_amount)),
  field("关联订单号", claim.value?.linked_order_no),
  field("备注", firstValue(claim.value?.notes, metadata.value.notes), true)
]);

function auditTitle(log) {
  const labels = {
    membership_entitlement_granted: "开通会员",
    membership_manual_claim_recorded: "登记权益",
    membership_claim_marked_used: "标记已使用",
    membership_claim_cancelled: "作废权益",
    membership_claim_reset: "重置权益",
    membership_claim_order_bound: "绑定订单",
    membership_activation_code_created: "生成激活码",
    membership_activation_code_deleted: "删除激活码",
    membership_activation_code_revoked: "作废激活码",
    membership_activation_code_redeemed: "兑换激活码"
  };
  return labels[log?.action] || displayValue(log?.action);
}

function cachedMembership() {
  if (!membershipId.value || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(`admin-vue:membership:${membershipId.value}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

async function fetchMembershipFallback() {
  const cycle = String(route.query.cycle || CURRENT_CYCLE);
  const payload = await fetchMemberships({
    cycle,
    page: 1,
    page_size: 50
  });
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.find(item => String(item.id) === membershipId.value) || null;
}

function showPlaceholder(action) {
  notice.value = `${action}会在后续迁移阶段实现；当前 Vue 会员详情页不会发起修改请求。`;
}

async function loadMembership() {
  if (!membershipId.value) {
    membership.value = null;
    error.value = "缺少会员权益 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    membership.value = cachedMembership() || await fetchMembershipFallback();
    if (!membership.value) {
      error.value = "未从当前会员周期列表中找到该会员权益记录，请从会员权益列表重新进入。";
    }
  } catch (err) {
    membership.value = null;
    error.value = err.message || "会员权益详情加载失败";
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
        <p class="view-heading__eyebrow">Membership readonly detail</p>
        <h2>会员权益详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回会员权益列表" />
        <a class="secondary-button" :href="oldMembershipHref()">打开旧会员权益后台</a>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载会员权益详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!membership" title="未找到会员权益记录" description="请从会员权益列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>会员用户</span>
          <strong>{{ userLabel() }}</strong>
        </div>
        <StatusBadge :tone="statusTone(claim.status || membership.status)">
          {{ statusLabel(claim.status || membership.status) }}
        </StatusBadge>
      </div>

      <DetailSection title="用户基础信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in userFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="会员资格信息" description="展示会员周期、状态、权益选择、关联订单、顾问和生日信息。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in membershipFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="激活码信息" description="现有会员列表接口仅返回与权益关联的激活码摘要字段；完整激活码管理仍在列表页只读展示。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in activationFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="权益记录 / 操作记录">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in benefitFields" :key="item.label" v-bind="item" />
        </div>
        <ul v-if="auditLogs.length" class="community-detail-list">
          <li v-for="log in auditLogs" :key="log.id || `${log.action}-${log.created_at}`">
            <strong>{{ auditTitle(log) }}</strong>
            <span>{{ formatDateTime(log.created_at) }} / {{ displayValue(log.admin_user_id) }}</span>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无操作记录。</p>
      </DetailSection>

      <DetailSection title="原始 / 补充字段" description="复杂字段默认折叠展示，避免撑开页面。">
        <div class="json-preview-grid">
          <JsonPreview title="membership entitlement" :value="membership" />
          <JsonPreview title="claim" :value="claim" />
          <JsonPreview title="audit_logs" :value="auditLogs" />
        </div>
      </DetailSection>

      <DetailSection title="操作区" description="第一轮只读详情不执行开通、生成、删除、登记、重置等写操作。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" @click="showPlaceholder('开通会员')">开通会员</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('生成激活码')">生成激活码</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('登记权益')">登记权益</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('重置权益')">重置权益</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除激活码')">删除激活码</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除会员资格')">删除会员资格</button>
        </div>
      </DetailSection>
    </template>
  </section>
</template>
