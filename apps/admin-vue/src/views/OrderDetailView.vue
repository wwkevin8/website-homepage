<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchOrder } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const detail = ref(null);
const order = ref(null);
const loading = ref(false);
const error = ref("");

const orderId = computed(() => String(route.params.id || "").trim());
const sourceRecord = computed(() => detail.value?.source_record || null);
const notes = computed(() => Array.isArray(detail.value?.notes) ? detail.value.notes : []);
const operationLogs = computed(() => Array.isArray(detail.value?.operation_logs) ? detail.value.operation_logs : []);
const legacyPayload = computed(() => parseJson(order.value?.legacy_payload) || {});
const isStorageOrder = computed(() => order.value?.source_table === "storage_orders");
const isTransportOrder = computed(() => order.value?.source_table === "transport_requests");

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    return null;
  }
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  return text !== "" && text !== "-" && text !== "--" && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined";
}

function firstValue(...values) {
  return values.find(isMeaningfulValue);
}

function displayValue(value) {
  return isMeaningfulValue(value) ? String(value) : "--";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

function formatDate(value) {
  const text = String(firstValue(value) || "").slice(0, 10);
  if (!text) return "--";
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
  if (!value) return "--";
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
    airport_pickup: "接机",
    dropoff: "送机",
    airport_dropoff: "送机",
    carpool: "拼车",
    storage: "寄存",
    box_order: "买箱订单",
    storage_collection: "取寄存订单",
    storage_return: "送寄存订单"
  };
  return labels[serviceType] || displayValue(serviceType);
}

function storageOrderTypeLabel(orderType) {
  const labels = {
    box_order: "买箱订单",
    box_delivery: "买箱订单",
    storage_collection: "取寄存订单",
    storage_return: "送寄存订单"
  };
  return labels[orderType] || "";
}

function sourceLabel(sourceTable) {
  const labels = {
    storage_orders: "寄存订单",
    transport_requests: "接送机订单"
  };
  return labels[sourceTable] || displayValue(sourceTable);
}

function registrationLabel() {
  return sourceRecord.value?.offline_recorded || order.value?.offline_recorded ? "已登记" : "未登记";
}

function registrationTone() {
  return sourceRecord.value?.offline_recorded || order.value?.offline_recorded ? "success" : "warning";
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/orders") ? returnTo : "/admin-vue/orders";
}

function professionalHref() {
  const sourceId = firstValue(order.value?.source_id, sourceRecord.value?.id);
  if (!sourceId) return "";
  if (isStorageOrder.value) {
    const type = String(sourceRecord.value?.order_type || "").trim();
    const routeName = type === "box_order" || type === "box_delivery" ? "box-orders" : "storage-orders";
    return `/admin-vue/storage/${routeName}/${encodeURIComponent(sourceId)}?return_to=${encodeURIComponent(`/admin-vue/orders/${orderId.value}`)}`;
  }
  if (isTransportOrder.value) {
    return `/admin-vue/transport/requests/${encodeURIComponent(sourceId)}?return_to=${encodeURIComponent(`/admin-vue/orders/${orderId.value}`)}`;
  }
  return "";
}

function professionalLabel() {
  if (isStorageOrder.value) return "打开寄存专业详情";
  if (isTransportOrder.value) return "打开接送机专业详情";
  return "暂无专业详情入口";
}

function contactSummary() {
  return [
    firstValue(order.value?.phone, sourceRecord.value?.phone),
    firstValue(order.value?.wechat_or_whatsapp, sourceRecord.value?.wechat, sourceRecord.value?.wechat_id)
  ].filter(isMeaningfulValue).join(" / ") || "--";
}

function airportSummary() {
  return [
    sourceRecord.value?.airport_code,
    sourceRecord.value?.airport_name,
    sourceRecord.value?.terminal
  ].filter(isMeaningfulValue).join(" / ");
}

function addressSummary() {
  return [
    sourceRecord.value?.address_full,
    sourceRecord.value?.room_or_building,
    sourceRecord.value?.postcode
  ].filter(isMeaningfulValue).join(" / ");
}

function purchasedBoxSummary() {
  const boxes = parseJson(sourceRecord.value?.purchased_boxes);
  if (!Array.isArray(boxes) || !boxes.length) {
    return "";
  }
  return boxes
    .map(item => {
      const label = firstValue(item?.label, item?.boxType ? `${item.boxType}号箱` : "", item?.box_type ? `${item.box_type}号箱` : "");
      const quantity = firstValue(item?.quantity, item?.purchaseQty, item?.purchase_quantity);
      return [label, quantity ? `x ${quantity}` : ""].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("；");
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `£${amount.toFixed(2)}` : "";
}

const baseFields = computed(() => [
  field("订单编号", order.value?.order_no || sourceRecord.value?.order_no),
  field("服务类型", storageOrderTypeLabel(sourceRecord.value?.order_type) || serviceLabel(order.value?.service_type || sourceRecord.value?.service_type)),
  field("订单来源", sourceLabel(order.value?.source_table)),
  field("客服登记状态", registrationLabel()),
  field("最近登记人", firstValue(sourceRecord.value?.last_operated_by, order.value?.last_operated_by)),
  field("最近登记时间", formatDateTime(firstValue(sourceRecord.value?.last_operated_at, order.value?.last_operated_at))),
  field("创建时间", formatDateTime(firstValue(order.value?.created_at, sourceRecord.value?.created_at))),
  field("最近更新时间", formatDateTime(firstValue(sourceRecord.value?.updated_at, order.value?.updated_at)))
]);

const customerFields = computed(() => [
  field("姓名", firstValue(order.value?.customer_name, sourceRecord.value?.student_name, sourceRecord.value?.customer_name)),
  field("联系方式", contactSummary()),
  field("手机", firstValue(order.value?.phone, sourceRecord.value?.phone)),
  field("微信 / WhatsApp", firstValue(order.value?.wechat_or_whatsapp, sourceRecord.value?.wechat, sourceRecord.value?.wechat_id)),
  field("邮箱", firstValue(order.value?.email, sourceRecord.value?.email, sourceRecord.value?.student_email, legacyPayload.value?.email))
]);

const serviceFields = computed(() => {
  if (isTransportOrder.value) {
    return [
      field("接送日期", formatDate(firstValue(sourceRecord.value?.flight_datetime, sourceRecord.value?.preferred_time_start, order.value?.pickup_date))),
      field("航班时间", formatDateTime(sourceRecord.value?.flight_datetime)),
      field("航班号", firstValue(sourceRecord.value?.flight_no, order.value?.flight_no)),
      field("机场 / 航站楼", airportSummary()),
      field("出发地点", sourceRecord.value?.location_from, true),
      field("目的地", sourceRecord.value?.location_to, true),
      field("乘客 / 行李", [
        sourceRecord.value?.passenger_count ? `${sourceRecord.value.passenger_count} 人` : "",
        sourceRecord.value?.luggage_count ? `${sourceRecord.value.luggage_count} 件行李` : ""
      ].filter(Boolean).join(" / "))
    ];
  }

  return [
    field("服务日期", formatDate(firstValue(sourceRecord.value?.service_date, sourceRecord.value?.box_delivery_date, sourceRecord.value?.storage_start_date, order.value?.storage_start_date))),
    field("服务时间", firstValue(sourceRecord.value?.service_time_slot, sourceRecord.value?.service_time, sourceRecord.value?.box_delivery_time_slot)),
    field("寄存开始", formatDate(firstValue(sourceRecord.value?.storage_start_date, order.value?.storage_start_date))),
    field("寄存结束", formatDate(firstValue(sourceRecord.value?.storage_end_date, sourceRecord.value?.expected_storage_end_date, order.value?.storage_end_date))),
    field("服务地址", addressSummary(), true),
    field("箱子 / 物品", firstValue(purchasedBoxSummary(), sourceRecord.value?.estimated_box_count ? `${sourceRecord.value.estimated_box_count} 件` : "")),
    field("费用", firstValue(formatMoney(sourceRecord.value?.final_price), formatMoney(sourceRecord.value?.estimated_total_price)))
  ];
});

const noteFields = computed(() => [
  field("用户备注", firstValue(sourceRecord.value?.notes, order.value?.notes, latestNote("user"), legacyPayload.value?.notes), true),
  field("内部备注", firstValue(sourceRecord.value?.admin_note, sourceRecord.value?.internal_note, order.value?.admin_note, latestNote("admin")), true)
]);

const readableLogs = computed(() => operationLogs.value.slice(0, 8).map(log => ({
  id: log.id || `${log.action}-${log.created_at}`,
  action: logActionLabel(log),
  time: formatDateTime(log.created_at),
  operator: displayValue(log?.admin_user?.name || log?.admin_user?.username || log?.metadata?.admin_name || log?.admin_user_id)
})));

function latestNote(type) {
  const match = notes.value.find(note => !type || String(note?.note_type || "").includes(type));
  return match?.note || "";
}

function logActionLabel(log) {
  const labels = {
    order_marked_offline_recorded: "标记已登记",
    order_unmarked_offline_recorded: "取消已登记",
    storage_orders_marked_offline_recorded: "标记已登记",
    storage_orders_unmarked_offline_recorded: "取消已登记",
    update_transport_request: "编辑接送机订单",
    orders_bulk_archived: "订单批量维护"
  };
  return labels[log?.action] || displayValue(log?.action);
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
        <p class="view-heading__eyebrow">Order center detail</p>
        <h2>订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回订单中心" />
      </div>
    </div>

    <LoadingState v-if="loading">正在加载订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!order" title="未找到订单" description="请从订单中心列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>订单编号</span>
          <strong>{{ displayValue(order.order_no || sourceRecord?.order_no) }}</strong>
        </div>
        <StatusBadge :tone="registrationTone()">{{ registrationLabel() }}</StatusBadge>
      </div>

      <DetailSection title="客服处理摘要" description="订单中心只保留客服判断登记状态和联系客户需要的信息。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="客户信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in customerFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="服务安排">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in serviceFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="备注">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="最近操作">
        <ul v-if="readableLogs.length" class="community-detail-list">
          <li v-for="log in readableLogs" :key="log.id">
            <strong>{{ log.action }}</strong>
            <span>{{ log.time }} / {{ log.operator }}</span>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无操作记录。</p>
      </DetailSection>

      <DetailSection title="专业详情入口" description="需要修改具体业务字段时，进入对应业务详情页处理。">
        <a v-if="professionalHref()" class="secondary-button detail-inline-link" :href="professionalHref()">
          {{ professionalLabel() }}
        </a>
        <p v-else class="detail-muted">{{ professionalLabel() }}</p>
      </DetailSection>
    </template>
  </section>
</template>
