<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchOrder } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import JsonPreview from "@/components/JsonPreview.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const detail = ref(null);
const order = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const orderId = computed(() => String(route.params.id || "").trim());
const statusLogs = computed(() => Array.isArray(detail.value?.status_logs) ? detail.value.status_logs : []);
const notes = computed(() => Array.isArray(detail.value?.notes) ? detail.value.notes : []);
const operationLogs = computed(() => Array.isArray(detail.value?.operation_logs) ? detail.value.operation_logs : []);
const attachments = computed(() => Array.isArray(detail.value?.attachments) ? detail.value.attachments : []);
const legacyPayload = computed(() => parseJson(order.value?.legacy_payload) || null);

function parseJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
}

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!text) {
    return "--";
  }
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${text}T00:00:00`));
  } catch (err) {
    return text;
  }
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

function serviceLabel(serviceType) {
  const labels = {
    pickup: "接机",
    dropoff: "送机",
    storage: "寄存",
    box_order: "买箱订单",
    storage_collection: "取寄存订单",
    storage_return: "送寄存订单"
  };
  return labels[serviceType] || displayValue(serviceType);
}

function sourceLabel(sourceTable) {
  const labels = {
    storage_orders: "寄存订单",
    transport_requests: "接送机订单"
  };
  return labels[sourceTable] || displayValue(sourceTable);
}

function statusLabel(status) {
  const labels = {
    pending: "待处理",
    pending_confirmation: "待确认",
    confirmed: "已确认",
    grouped: "已拼车",
    open: "进行中",
    closed: "已关闭",
    completed: "已完成",
    cancelled: "已取消",
    canceled: "已取消",
    draft: "草稿"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "confirmed" || status === "grouped" || status === "completed") {
    return "success";
  }
  if (status === "cancelled" || status === "canceled" || status === "closed") {
    return "neutral";
  }
  return "warning";
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/orders") ? returnTo : "/admin-vue/orders";
}

function oldOrderHref() {
  return "/admin-orders.html";
}

function professionalHref() {
  const sourceId = firstValue(order.value?.source_id, order.value?.legacy_id);
  if (!sourceId) {
    return "";
  }
  if (order.value?.source_table === "storage_orders") {
    return `/admin-vue/storage/${encodeURIComponent(sourceId)}?return_to=${encodeURIComponent(`/admin-vue/orders/${orderId.value}`)}`;
  }
  if (order.value?.source_table === "transport_requests") {
    return `/admin-vue/transport/requests/${encodeURIComponent(sourceId)}?return_to=${encodeURIComponent(`/admin-vue/orders/${orderId.value}`)}`;
  }
  return "";
}

function professionalLabel() {
  if (order.value?.source_table === "storage_orders") {
    return "打开寄存专业详情";
  }
  if (order.value?.source_table === "transport_requests") {
    return "打开接送机专业详情";
  }
  return "暂无专业详情入口";
}

function archivedLabel(record = order.value || {}) {
  return record.archived ? `已归档${record.archived_at ? `（${formatDateTime(record.archived_at)}）` : ""}` : "活跃";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

const baseFields = computed(() => [
  field("订单编号", order.value?.order_no),
  field("服务类型", serviceLabel(order.value?.service_type)),
  field("来源", sourceLabel(order.value?.source_table)),
  field("状态", statusLabel(order.value?.status)),
  field("归档状态", archivedLabel()),
  field("创建时间", formatDateTime(order.value?.created_at)),
  field("最近更新时间", formatDateTime(order.value?.updated_at)),
  field("完成时间", formatDateTime(order.value?.completed_at))
]);

const customerFields = computed(() => [
  field("姓名", order.value?.customer_name),
  field("手机", order.value?.phone),
  field("邮箱", firstValue(order.value?.email, order.value?.student_email, legacyPayload.value?.email)),
  field("微信 / WhatsApp", order.value?.wechat_or_whatsapp)
]);

const serviceFields = computed(() => [
  field("服务日期", formatDate(firstValue(order.value?.pickup_date, order.value?.storage_start_date, order.value?.storage_end_date))),
  field("服务地点", firstValue(order.value?.location_to, order.value?.address_full, order.value?.postcode, legacyPayload.value?.address), true),
  field("服务时间", firstValue(order.value?.preferred_time_start, order.value?.service_time_slot, legacyPayload.value?.serviceTime)),
  field("航班号", order.value?.flight_no),
  field("业务摘要", firstValue(order.value?.summary, order.value?.final_readable_message, legacyPayload.value?.summary), true)
]);

const noteFields = computed(() => [
  field("用户备注", firstValue(order.value?.notes, legacyPayload.value?.notes), true),
  field("内部备注", firstValue(order.value?.admin_note, order.value?.internal_note), true),
  field("最近备注时间", formatDateTime(order.value?.latest_note_at))
]);

function logAdminName(log) {
  return displayValue(log?.admin_user?.name || log?.admin_user?.username || log?.changed_by_admin?.name || log?.changed_by_admin?.username);
}

function logTitle(log) {
  return displayValue(firstValue(log?.action, log?.status, log?.note_type, log?.file_name));
}

function logTime(log) {
  return formatDateTime(firstValue(log?.created_at, log?.changed_at, log?.updated_at));
}

function showPlaceholder(action) {
  notice.value = `${action}会在后续迁移阶段实现；当前 Vue 订单详情页不会发起修改请求。`;
}

async function loadOrder() {
  if (!orderId.value) {
    order.value = null;
    detail.value = null;
    error.value = "缺少订单 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchOrder(orderId.value);
    detail.value = payload || {};
    order.value = payload?.order || payload?.item || payload;
  } catch (err) {
    detail.value = null;
    order.value = null;
    error.value = err.message || "订单详情加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <section class="order-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Order center readonly detail</p>
        <h2>订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回订单中心" />
        <a class="secondary-button" :href="oldOrderHref()">打开旧订单中心</a>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!order" title="未找到订单" description="请从订单中心列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>订单编号</span>
          <strong>{{ displayValue(order.order_no) }}</strong>
        </div>
        <StatusBadge :tone="statusTone(order.status)">{{ statusLabel(order.status) }}</StatusBadge>
      </div>

      <DetailSection title="订单基础信息" description="统一订单中心摘要信息，只读展示，不替代专业业务详情页。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="客户信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in customerFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="服务摘要" description="展示订单中心接口已提供的业务摘要字段，不在前端重新计算价格或业务状态。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in serviceFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="备注 / 操作记录">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>

        <div class="json-preview-grid">
          <JsonPreview title="订单备注" :value="notes" />
          <JsonPreview title="状态变更记录" :value="statusLogs" />
          <JsonPreview title="附件记录" :value="attachments" />
        </div>

        <ul v-if="operationLogs.length" class="community-detail-list">
          <li v-for="log in operationLogs" :key="log.id || `${log.action}-${log.created_at}`">
            <strong>{{ logTitle(log) }}</strong>
            <span>{{ logTime(log) }} / {{ logAdminName(log) }}</span>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无管理员操作记录。</p>
      </DetailSection>

      <DetailSection title="专业详情入口" description="订单中心详情只做统一摘要，专业字段继续进入对应 Vue 业务详情页查看。">
        <a v-if="professionalHref()" class="secondary-button detail-inline-link" :href="professionalHref()">
          {{ professionalLabel() }}
        </a>
        <p v-else class="detail-muted">{{ professionalLabel() }}</p>
      </DetailSection>

      <DetailSection title="原始 / 补充字段" description="复杂字段默认折叠展示，避免撑开页面。">
        <div class="json-preview-grid">
          <JsonPreview title="order" :value="order" />
          <JsonPreview title="legacy_payload" :value="legacyPayload" />
          <JsonPreview title="detail payload" :value="detail" />
        </div>
      </DetailSection>

      <DetailSection title="操作区" description="第一轮只读详情不执行归档、备注保存或批量归档。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" @click="showPlaceholder('归档')">归档</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('取消归档')">取消归档</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('保存备注')">保存备注</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('批量归档')">批量归档</button>
        </div>
      </DetailSection>
    </template>
  </section>
</template>
