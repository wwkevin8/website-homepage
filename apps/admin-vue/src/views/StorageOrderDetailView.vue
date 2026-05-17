<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchStorageOrder } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import JsonPreview from "@/components/JsonPreview.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const order = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const orderId = computed(() => String(route.params.id || "").trim());

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

function boolLabel(value) {
  if (value === true || value === "true" || value === 1 || value === "1") {
    return "是";
  }
  if (value === false || value === "false" || value === 0 || value === "0") {
    return "否";
  }
  return "--";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? `GBP ${amount.toFixed(2)}` : displayValue(value);
}

const customerForm = computed(() => parseJson(order.value?.customer_form_json) || {});
const serviceFlags = computed(() => parseJson(order.value?.service_flags_json) || {});
const estimateSummary = computed(() => {
  const direct = parseJson(order.value?.estimate_summary_json || order.value?.pricing_summary_json || order.value?.price_breakdown_json);
  if (direct) {
    return direct;
  }
  return serviceFlags.value?.estimate || serviceFlags.value?.pricing || {};
});

function detailValue(...values) {
  return displayValue(firstValue(...values));
}

function resolvedOrderType(record = order.value || {}) {
  const value = firstValue(record.order_type, record.service_type, record.storage_type);
  if (value) {
    return String(value);
  }
  if (record.box_order_no || record.box_delivery_date) {
    return "box_order";
  }
  if (record.storage_end_date || record.expected_storage_end_date) {
    return "storage_return";
  }
  return "storage_collection";
}

function serviceTypeLabel(type = resolvedOrderType()) {
  const labels = {
    box_order: "买箱订单",
    storage_collection: "取寄存订单",
    storage_return: "送寄存订单",
    storage: "寄存订单"
  };
  return labels[type] || displayValue(type);
}

function statusLabel(status) {
  const labels = {
    pending_confirmation: "待确认",
    confirmed: "已确认",
    completed: "已完成",
    cancelled: "已取消",
    canceled: "已取消"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "confirmed" || status === "completed") {
    return "success";
  }
  if (status === "cancelled" || status === "canceled") {
    return "neutral";
  }
  return "warning";
}

function rowOrderNo(record = order.value || {}) {
  return detailValue(record.box_order_no, record.storage_pickup_order_no, record.order_no, record.parent_order_no);
}

function listHrefForOrder() {
  const returnTo = String(route.query.return_to || "");
  if (returnTo.startsWith("/admin-vue/storage/")) {
    return returnTo;
  }
  const type = String(route.query.order_type || resolvedOrderType());
  const routes = {
    box_order: "/admin-vue/storage/box-orders",
    storage_collection: "/admin-vue/storage/collections",
    storage_return: "/admin-vue/storage/returns"
  };
  return routes[type] || "/admin-vue/storage/collections";
}

function oldDetailHref() {
  return `/admin-storage-detail.html?id=${encodeURIComponent(orderId.value)}&return_to=${encodeURIComponent(listHrefForOrder())}`;
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

const baseFields = computed(() => [
  field("订单编号", rowOrderNo()),
  field("User ID", firstValue(order.value?.public_user_id, order.value?.user_id)),
  field("服务类型", serviceTypeLabel()),
  field("订单状态", statusLabel(order.value?.status)),
  field("创建时间", formatDateTime(order.value?.created_at)),
  field("更新时间", formatDateTime(order.value?.updated_at))
]);

const contactFields = computed(() => [
  field("姓名", firstValue(order.value?.customer_name, customerForm.value.customerName, customerForm.value.name)),
  field("邮箱", firstValue(order.value?.student_email, order.value?.linked_user_email, customerForm.value.email)),
  field("电话", firstValue(order.value?.phone, customerForm.value.phone, serviceFlags.value.phone)),
  field("微信", firstValue(order.value?.wechat_id, customerForm.value.wechatId, customerForm.value.contactHandle))
]);

const serviceFields = computed(() => [
  field("服务日期", formatDate(firstValue(order.value?.service_date, order.value?.storage_intake_date, order.value?.box_delivery_date, order.value?.storage_end_date))),
  field("时间段", firstValue(order.value?.service_time_slot, order.value?.service_time, serviceFlags.value.serviceTime)),
  field("取件/送件方式", firstValue(order.value?.storage_pickup_method, order.value?.storage_return_method, order.value?.box_delivery_method, serviceFlags.value.pickupMethodLabel, serviceFlags.value.returnTypeLabel)),
  field("买箱日期", formatDate(firstValue(order.value?.box_delivery_date, serviceFlags.value.boxDeliveryDate))),
  field("取件/自送日期", formatDate(firstValue(order.value?.storage_intake_date, order.value?.storage_start_date, serviceFlags.value.serviceDate))),
  field("寄存结束/送回日期", formatDate(firstValue(order.value?.storage_end_date, order.value?.expected_storage_end_date, serviceFlags.value.expectedStorageEndDate))),
  field("寄存天数", firstValue(order.value?.storage_days, estimateSummary.value.days, serviceFlags.value.storageDays))
]);

const addressFields = computed(() => [
  field("公寓名", firstValue(order.value?.room_or_building, serviceFlags.value.roomOrBuilding, customerForm.value.roomOrBuilding)),
  field("房间号", firstValue(order.value?.room_number, serviceFlags.value.roomNumber)),
  field("邮编", firstValue(order.value?.postcode, serviceFlags.value.postcode, customerForm.value.postcode)),
  field("地址", firstValue(order.value?.address_full, serviceFlags.value.address, customerForm.value.address), true),
  field("是否有电梯", boolLabel(order.value?.has_lift)),
  field("是否需要上楼", boolLabel(order.value?.needs_upstairs)),
  field("楼层/上楼说明", firstValue(order.value?.floor, order.value?.floor_level, serviceFlags.value.floor, serviceFlags.value.pickupAccessTypeLabel))
]);

const itemFields = computed(() => [
  field("箱型", firstValue(order.value?.box_type_summary, order.value?.box_type, serviceFlags.value.boxType, serviceFlags.value.boxTypeSummary), true),
  field("数量", firstValue(order.value?.item_count, order.value?.estimated_box_count, serviceFlags.value.itemCount)),
  field("重量", firstValue(order.value?.weight, order.value?.estimated_weight, serviceFlags.value.weight)),
  field("物品说明", firstValue(order.value?.item_description, order.value?.items_description, serviceFlags.value.itemDescription), true),
  field("购买箱子数量", firstValue(order.value?.box_purchase_quantity, order.value?.purchase_quantity, serviceFlags.value.purchaseQuantity)),
  field("寄存数量", firstValue(order.value?.storage_quantity, serviceFlags.value.storageQuantity))
]);

const priceFields = computed(() => [
  field("寄存费用", formatMoney(firstValue(order.value?.storage_fee, estimateSummary.value.storageTotal, estimateSummary.value.discountedBase))),
  field("买箱费用", formatMoney(firstValue(order.value?.box_fee, order.value?.box_total, estimateSummary.value.boxTotal))),
  field("会员减免金额", formatMoney(order.value?.membership_discount_amount)),
  field("附加费用", formatMoney(firstValue(order.value?.extra_charge_amount, estimateSummary.value.extraChargeAmount))),
  field("最终价格", formatMoney(firstValue(order.value?.final_price, order.value?.total_price, estimateSummary.value.finalPrice)))
]);

const noteFields = computed(() => [
  field("用户备注", firstValue(order.value?.notes, customerForm.value.notes), true),
  field("客服备注", firstValue(order.value?.admin_note, order.value?.internal_note), true)
]);

function showPlaceholder(action) {
  notice.value = `${action}会在后续迁移阶段实现；当前 Vue 详情页不会发起修改请求。`;
}

async function loadOrder() {
  if (!orderId.value) {
    order.value = null;
    error.value = "缺少寄存订单 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchStorageOrder(orderId.value);
    order.value = payload?.order || payload?.item || payload;
  } catch (err) {
    order.value = null;
    error.value = err.message || "寄存订单详情加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <section class="storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage order readonly detail</p>
        <h2>寄存订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHrefForOrder()" label="返回列表" />
        <a class="secondary-button" :href="oldDetailHref()">打开旧详情页</a>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载寄存订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!order" title="未找到寄存订单" description="请从寄存列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>订单编号</span>
          <strong>{{ rowOrderNo() }}</strong>
        </div>
        <StatusBadge :tone="statusTone(order.status)">{{ statusLabel(order.status) }}</StatusBadge>
      </div>

      <DetailSection title="订单基础信息" description="订单编号和服务类型用于核对，不在只读详情页修改。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="用户与联系方式" description="展示订单提交时留下的客户联系方式快照。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in contactFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="服务预约信息" description="按买箱、取寄存、送寄存的实际字段只读展示。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in serviceFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="地址信息" description="地址、房间、邮编、电梯和楼层信息集中核对。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in addressFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="箱子 / 物品 / 数量信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in itemFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="费用 / 价格信息" description="仅展示详情接口已有费用字段，不在前端重新计算。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in priceFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="备注信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>
        <details v-if="order.final_readable_message" class="detail-text-block">
          <summary>展开寄存信息摘要</summary>
          <pre>{{ order.final_readable_message }}</pre>
        </details>
      </DetailSection>

      <DetailSection title="原始详情 / JSON 摘要" description="重字段默认折叠，避免撑开页面。">
        <div class="json-preview-grid">
          <JsonPreview title="customer_form_json" :value="customerForm" />
          <JsonPreview title="service_flags_json" :value="serviceFlags" />
          <JsonPreview title="价格/估算摘要" :value="estimateSummary" />
        </div>
      </DetailSection>

      <DetailSection title="操作区" description="第一轮详情迁移只做只读展示，所有写操作留待后续迁移。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" @click="showPlaceholder('编辑保存')">编辑保存</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('导出 Excel')">导出 Excel</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('状态修改')">状态修改</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除订单')">删除订单</button>
        </div>
      </DetailSection>
    </template>
  </section>
</template>
