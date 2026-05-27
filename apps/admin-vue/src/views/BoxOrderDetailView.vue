<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchStorageOrder, fetchStorageOrders, updateStorageOrder } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();

const order = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const savingStatus = ref(false);
const statusDialogOpen = ref(false);
const statusDraft = ref("");
const savingDelivery = ref(false);
const relatedStorageOrder = ref(null);
const relatedStorageLoading = ref(false);
const deliveryForm = ref({
  box_delivery_date: "",
  box_delivery_time_slot: "",
  address_full: "",
  room_or_building: "",
  postcode: "",
  has_lift: "",
  needs_upstairs: "",
  box_delivery_method: ""
});

const orderId = computed(() => String(route.params.id || "").trim());

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
  return isMeaningfulValue(value) ? String(value) : "未填写";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

function formatDate(value) {
  const text = String(firstValue(value) || "").slice(0, 10);
  if (!text) return "未填写";
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

function toDateInputValue(value) {
  const text = String(firstValue(value) || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function formatDateTime(value) {
  if (!value) return "未填写";
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
  if (!isMeaningfulValue(value)) return "未填写";
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : displayValue(value);
}

function boolLabel(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "是";
  if (value === false || value === "false" || value === 0 || value === "0") return "否";
  return "未填写";
}

function boolFormValue(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "true";
  if (value === false || value === "false" || value === 0 || value === "0") return "false";
  return "";
}

function parseBoolFormValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const customerForm = computed(() => parseJson(order.value?.customer_form_json) || {});
const serviceFlags = computed(() => parseJson(order.value?.service_flags_json) || {});
const estimateSummary = computed(() => parseJson(order.value?.estimate_summary_json || order.value?.pricing_summary_json || order.value?.price_breakdown_json) || {});
const serviceDetails = computed(() => {
  const details = customerForm.value?.serviceDetails
    || customerForm.value?.service_details
    || serviceFlags.value?.serviceDetails
    || serviceFlags.value?.service_details
    || {};
  return asObject(details);
});
const userSnapshot = computed(() => asObject(customerForm.value?.userSnapshot || customerForm.value?.user_snapshot));
const adminSnapshot = computed(() => asObject(customerForm.value?.admin || customerForm.value?.admin_notes));

function boxOrderNo(record = order.value || {}) {
  return displayValue(firstValue(record.box_order_no, record.order_no, record.parent_order_no));
}

function listHrefForOrder() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin/storage/") ? returnTo : "/admin/storage/box-orders";
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
  if (status === "confirmed" || status === "completed") return "success";
  if (status === "cancelled" || status === "canceled") return "neutral";
  return "warning";
}

function normalizeBoxLabel(entry) {
  const raw = firstValue(entry?.label, entry?.boxLabel, entry?.box_label, entry?.name, entry?.boxName, entry?.box_name, entry?.boxType, entry?.box_type, entry?.type);
  const text = String(raw || "").trim();
  if (!text) return "箱型";
  return /^\d+$/.test(text) ? `${text}号箱` : text;
}

function normalizeBoxQuantity(entry) {
  return toNumber(firstValue(entry?.quantity, entry?.purchaseQty, entry?.purchase_quantity, entry?.purchaseQuantity, entry?.count, entry?.qty));
}

function normalizeBoxUnitPrice(entry) {
  return firstValue(entry?.unitPrice, entry?.unit_price, entry?.price, entry?.boxPrice, entry?.box_price);
}

function normalizeBoxSubtotal(entry) {
  return firstValue(entry?.subtotal, entry?.purchase, entry?.purchaseTotal, entry?.purchase_total, entry?.boxFee, entry?.box_fee, entry?.total);
}

const rawPurchasedBoxes = computed(() => {
  const direct = parseJson(order.value?.purchased_boxes);
  return Array.isArray(direct) && direct.length
    ? direct
    : Array.isArray(estimateSummary.value?.items)
      ? estimateSummary.value.items
      : [];
});

const normalizedPurchasedBoxes = computed(() => rawPurchasedBoxes.value
    .map((entry) => {
      const item = asObject(entry);
      const quantity = normalizeBoxQuantity(item);
      const subtotal = normalizeBoxSubtotal(item);
      const unitPrice = normalizeBoxUnitPrice(item) || (quantity > 0 && toNumber(subtotal) > 0 ? toNumber(subtotal) / quantity : "");
      return {
        label: normalizeBoxLabel(item),
        quantity,
        unitPrice,
        subtotal
      };
    })
);

const purchasedBoxes = computed(() => normalizedPurchasedBoxes.value
  .filter((entry) => entry.quantity > 0 || isMeaningfulValue(entry.subtotal))
);

const totalBoxCount = computed(() => {
  const direct = firstValue(order.value?.estimated_box_count, estimateSummary.value?.totalPurchaseBoxes, estimateSummary.value?.total_purchase_boxes);
  if (isMeaningfulValue(direct)) return toNumber(direct);
  return normalizedPurchasedBoxes.value.reduce((sum, item) => sum + toNumber(item.quantity), 0);
});

const boxQuantityLines = computed(() => {
  const rows = normalizedPurchasedBoxes.value.length ? normalizedPurchasedBoxes.value : purchasedBoxes.value;
  return rows.length
    ? rows.map(item => `${item.label} × ${toNumber(item.quantity)}`)
    : ["未填写"];
});

const boxTotal = computed(() => {
  const direct = firstValue(
    order.value?.purchase_total,
    order.value?.purchaseTotal,
    order.value?.box_fee,
    order.value?.boxFee,
    estimateSummary.value?.purchaseTotal,
    estimateSummary.value?.purchase_total,
    estimateSummary.value?.boxFee,
    estimateSummary.value?.box_fee
  );
  if (isMeaningfulValue(direct)) return direct;
  const total = purchasedBoxes.value.reduce((sum, item) => sum + toNumber(item.subtotal), 0);
  return total > 0 ? total : "";
});

const deliveryFee = computed(() => firstValue(
  order.value?.delivery_fee,
  order.value?.box_delivery_fee,
  estimateSummary.value?.deliveryFee,
  estimateSummary.value?.boxDeliveryFee,
  estimateSummary.value?.box_delivery_fee,
  estimateSummary.value?.upstairsFee,
  estimateSummary.value?.upstairs_fee
));

const extraFee = computed(() => firstValue(
  order.value?.extra_charge_amount,
  estimateSummary.value?.extraChargeAmount,
  estimateSummary.value?.extra_charge_amount,
  estimateSummary.value?.additionalFee,
  estimateSummary.value?.additional_fee,
  estimateSummary.value?.upstairsFee,
  estimateSummary.value?.upstairs_fee
));

const membershipDiscount = computed(() => firstValue(
  order.value?.membership_discount_amount,
  estimateSummary.value?.membershipDiscount,
  estimateSummary.value?.membership_discount,
  estimateSummary.value?.membership_discount_amount
));

const totalFee = computed(() => firstValue(
  order.value?.final_price,
  order.value?.estimated_total_price,
  order.value?.total_price,
  estimateSummary.value?.finalPrice,
  estimateSummary.value?.estimatedTotalPrice,
  estimateSummary.value?.grandTotal,
  estimateSummary.value?.total
));

const userFields = computed(() => [
  field("用户姓名", firstValue(order.value?.customer_name, serviceDetails.value.contactName, customerForm.value.customerName, customerForm.value.name, userSnapshot.value.name)),
  field("电话", firstValue(order.value?.phone, serviceDetails.value.contactPhone, customerForm.value.phone, userSnapshot.value.phone)),
  field("微信", firstValue(order.value?.wechat_id, customerForm.value.wechatId, customerForm.value.contactHandle, userSnapshot.value.wechatId)),
  field("邮箱 / User ID", firstValue(order.value?.student_email, order.value?.linked_user_email, customerForm.value.email, userSnapshot.value.email, order.value?.public_user_id, order.value?.site_user_id))
]);

const deliveryFields = computed(() => [
  field("送箱日期", formatDate(firstValue(order.value?.box_delivery_date, order.value?.service_date, serviceDetails.value.boxDeliveryDate, serviceDetails.value.serviceDate))),
  field("送箱时间段", firstValue(order.value?.box_delivery_time_slot, order.value?.service_time_slot, order.value?.service_time, serviceDetails.value.boxDeliveryTimeSlot, serviceDetails.value.serviceTimeSlot)),
  field("配送地址", firstValue(order.value?.address_full, serviceDetails.value.serviceAddress, serviceDetails.value.address, serviceDetails.value.fullAddress, customerForm.value.address), true),
  field("公寓 / 楼栋 / 房间", firstValue(order.value?.room_or_building, serviceDetails.value.roomOrBuilding, serviceDetails.value.room)),
  field("邮编", firstValue(order.value?.postcode, serviceDetails.value.postcode, customerForm.value.postcode)),
  field("是否有电梯", boolLabel(firstValue(order.value?.has_lift, serviceDetails.value.hasLift))),
  field("是否需要上楼", boolLabel(firstValue(order.value?.needs_upstairs, serviceDetails.value.needsUpstairs, serviceDetails.value.needUpstairs))),
  field("配送方式", firstValue(order.value?.box_delivery_method, serviceDetails.value.boxDeliveryMethod, estimateSummary.value?.boxDeliveryMethod))
]);

const feeFields = computed(() => [
  field("买箱费用", formatMoney(boxTotal.value)),
  field("配送费用", formatMoney(deliveryFee.value)),
  field("上楼费用 / 附加费用", formatMoney(extraFee.value)),
  field("会员减免", formatMoney(membershipDiscount.value)),
  field("总费用", formatMoney(totalFee.value))
]);

const processingFields = computed(() => [
  field("后台状态", statusLabel(order.value?.status)),
  field("归档状态", order.value?.archived === true ? "已归档" : order.value?.archived === false ? "未归档" : "未填写"),
  field("上次操作人", firstValue(order.value?.last_operator_name, order.value?.updated_by_admin_name, adminSnapshot.value.updated_by, adminSnapshot.value.operator)),
  field("下单时间", formatDateTime(order.value?.created_at)),
  field("更新时间", formatDateTime(order.value?.updated_at))
]);

const noteFields = computed(() => [
  field("用户备注", firstValue(order.value?.notes, serviceDetails.value.notes, customerForm.value.notes), true),
  field("内部备注", firstValue(order.value?.internal_notes, order.value?.admin_notes, adminSnapshot.value.internal_notes, adminSnapshot.value.notes), true)
]);

function closeStatusDialog() {
  if (!savingStatus.value) statusDialogOpen.value = false;
}

async function confirmStatusChange() {
  if (savingStatus.value || !statusDraft.value) return;
  savingStatus.value = true;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(orderId.value, { status: statusDraft.value });
    await loadOrder({ silent: true });
    notice.value = `订单状态已更新为：${statusLabel(statusDraft.value)}。`;
    statusDialogOpen.value = false;
  } catch (err) {
    notice.value = err.message || "状态修改失败。";
  } finally {
    savingStatus.value = false;
  }
}

function populateDeliveryForm(record = order.value || {}) {
  deliveryForm.value = {
    box_delivery_date: toDateInputValue(firstValue(record.box_delivery_date, record.service_date, serviceDetails.value.boxDeliveryDate, serviceDetails.value.serviceDate)),
    box_delivery_time_slot: String(firstValue(record.box_delivery_time_slot, record.service_time_slot, record.service_time, serviceDetails.value.boxDeliveryTimeSlot, serviceDetails.value.serviceTimeSlot) || ""),
    address_full: String(firstValue(record.address_full, serviceDetails.value.serviceAddress, serviceDetails.value.address, serviceDetails.value.fullAddress, customerForm.value.address) || ""),
    room_or_building: String(firstValue(record.room_or_building, serviceDetails.value.roomOrBuilding, serviceDetails.value.room) || ""),
    postcode: String(firstValue(record.postcode, serviceDetails.value.postcode, customerForm.value.postcode) || ""),
    has_lift: boolFormValue(firstValue(record.has_lift, serviceDetails.value.hasLift)),
    needs_upstairs: boolFormValue(firstValue(record.needs_upstairs, serviceDetails.value.needsUpstairs, serviceDetails.value.needUpstairs)),
    box_delivery_method: String(firstValue(record.box_delivery_method, serviceDetails.value.boxDeliveryMethod, estimateSummary.value?.boxDeliveryMethod) || "")
  };
}

async function saveDeliveryInfo() {
  if (savingDelivery.value || !orderId.value) return;
  savingDelivery.value = true;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(orderId.value, {
      box_delivery_date: deliveryForm.value.box_delivery_date || null,
      service_date: deliveryForm.value.box_delivery_date || null,
      box_delivery_time_slot: deliveryForm.value.box_delivery_time_slot || null,
      service_time_slot: deliveryForm.value.box_delivery_time_slot || null,
      address_full: deliveryForm.value.address_full || null,
      room_or_building: deliveryForm.value.room_or_building || null,
      postcode: deliveryForm.value.postcode || null,
      has_lift: parseBoolFormValue(deliveryForm.value.has_lift),
      needs_upstairs: parseBoolFormValue(deliveryForm.value.needs_upstairs),
      box_delivery_method: deliveryForm.value.box_delivery_method || null,
      operation_action: "update_box_delivery_info"
    });
    await loadOrder({ silent: true });
    notice.value = "配送信息已保存。";
  } catch (err) {
    notice.value = err.message || "保存配送信息失败。";
  } finally {
    savingDelivery.value = false;
  }
}

const operationLogs = computed(() => {
  const logs = order.value?.operation_logs || order.value?.audit_logs || [];
  return Array.isArray(logs) ? logs : [];
});

function operationActionLabel(action, log = {}) {
  const changedFields = Array.isArray(log?.metadata?.changed_fields) ? log.metadata.changed_fields : [];
  if (action === "update_box_delivery_info" || action === "更新配送信息") return "更新配送信息";
  if (action === "storage_order_updated" && changedFields.some(fieldName => [
    "box_delivery_date",
    "box_delivery_time_slot",
    "service_date",
    "service_time_slot",
    "address_full",
    "room_or_building",
    "postcode",
    "has_lift",
    "needs_upstairs",
    "box_delivery_method"
  ].includes(fieldName))) {
    return "更新配送信息";
  }
  return {
    storage_order_updated: "更新订单",
    storage_order_deleted: "删除订单",
    storage_order_bulk_offline_recorded: "标记线下记录",
    storage_order_bulk_offline_unrecorded: "取消线下记录",
    order_note_created: "新增备注"
  }[action] || displayValue(action);
}

function operationActor(log = {}) {
  return firstValue(log.admin_user?.name, log.admin_user?.username, log.admin_user?.email, log.metadata?.operator, log.admin_user_id, "系统");
}

function operationChangedFields(log = {}) {
  if (log.metadata?.summary) return String(log.metadata.summary);
  const labels = {
    box_delivery_date: "送箱日期",
    service_date: "送箱日期",
    box_delivery_time_slot: "送箱时间段",
    service_time_slot: "送箱时间段",
    address_full: "配送地址",
    room_or_building: "公寓 / 楼栋 / 房间",
    postcode: "邮编",
    has_lift: "是否有电梯",
    needs_upstairs: "是否需要上楼",
    box_delivery_method: "配送方式",
    status: "订单状态",
    offline_recorded: "线下记录",
    notes: "备注"
  };
  const fields = Array.isArray(log.metadata?.changed_fields)
    ? log.metadata.changed_fields.filter(fieldName => !["last_operated_by", "last_operated_at"].includes(fieldName))
    : [];
  if (fields.length) {
    return fields.map(fieldName => labels[fieldName] || fieldName).join("、");
  }
  return "已记录操作";
}

const relatedStorageRoute = computed(() => {
  const id = relatedStorageOrder.value?.storage_order_id || relatedStorageOrder.value?.id;
  if (!id) return "";
  const baseId = String(id).split(":")[0];
  const query = new URLSearchParams({
    return_to: "/admin/storage/box-orders",
    order_type: relatedStorageOrder.value?.storage_order_kind || relatedStorageOrder.value?.order_type || "storage_collection"
  });
  return `/admin/storage/storage-orders/${encodeURIComponent(baseId)}?${query.toString()}`;
});

function relatedStorageOrderNo(record = relatedStorageOrder.value || {}) {
  return displayValue(firstValue(record.display_order_no, record.storage_pickup_order_no, record.order_no, record.related_order_no));
}

async function resolveRelatedStorageOrder() {
  const currentBoxNo = String(firstValue(order.value?.box_order_no, order.value?.order_no, order.value?.parent_order_no) || "").trim();
  if (!currentBoxNo) {
    relatedStorageOrder.value = null;
    return;
  }
  relatedStorageLoading.value = true;
  try {
    const payload = await fetchStorageOrders({
      order_type: "all",
      search: currentBoxNo,
      date_scope: "all",
      validity_scope: "all",
      page_size: 100,
      sort: "created_at_desc"
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    relatedStorageOrder.value = items.find(item => {
      const kind = item.storage_order_kind || item.order_type || "";
      if (kind === "box_order") return false;
      const candidates = [item.box_order_no, item.related_order_no, item.parent_order_no, item.order_no]
        .filter(Boolean)
        .map(value => String(value).trim());
      return candidates.includes(currentBoxNo);
    }) || null;
  } catch (err) {
    relatedStorageOrder.value = null;
  } finally {
    relatedStorageLoading.value = false;
  }
}

async function loadOrder(options = {}) {
  if (!orderId.value) {
    order.value = null;
    error.value = "缺少买箱订单 ID。";
    return;
  }
  if (!options.silent) {
    loading.value = true;
    notice.value = "";
  }
  error.value = "";
  try {
    const payload = await fetchStorageOrder(orderId.value);
    order.value = payload?.order || payload?.item || payload;
    statusDraft.value = String(order.value?.status || "");
    populateDeliveryForm(order.value);
    await resolveRelatedStorageOrder();
  } catch (err) {
    order.value = null;
    error.value = err.message || "买箱订单详情加载失败";
  } finally {
    if (!options.silent) loading.value = false;
  }
}

onMounted(loadOrder);
</script>

<template>
  <section class="storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Box order detail</p>
        <h2>买箱订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHrefForOrder()" label="返回买箱订单" />
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载买箱订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!order" title="未找到买箱订单" description="请从买箱订单列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>订单编号</span>
          <strong>{{ boxOrderNo() }}</strong>
        </div>
        <StatusBadge :tone="statusTone(order.status)">{{ statusLabel(order.status) }}</StatusBadge>
      </div>

      <DetailSection title="用户信息" description="客服核对联系人和账号信息。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in userFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="买箱明细" description="只展示买箱类型、数量、单价和小计，不混入寄存周期字段。">
        <div class="detail-table-wrap">
          <table class="admin-table detail-table">
            <thead>
              <tr>
                <th>箱型</th>
                <th>数量</th>
                <th>单价</th>
                <th>小计</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in purchasedBoxes" :key="`${item.label}-${item.quantity}-${item.subtotal}`">
                <td>{{ item.label }}</td>
                <td>{{ displayValue(item.quantity) }}</td>
                <td>{{ formatMoney(item.unitPrice) }}</td>
                <td>{{ formatMoney(item.subtotal) }}</td>
              </tr>
              <tr v-if="!purchasedBoxes.length">
                <td colspan="4">未填写</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DetailSection>

      <DetailSection title="配送信息" description="送箱日期、时间、地址和上楼/电梯情况。">
        <form class="transport-simple-detail-form" @submit.prevent="saveDeliveryInfo">
          <label>
            <span>送箱日期 / 配送日期</span>
            <input v-model="deliveryForm.box_delivery_date" type="date" :disabled="savingDelivery" />
          </label>
          <label>
            <span>送箱时间段 / 配送时间段</span>
            <input v-model="deliveryForm.box_delivery_time_slot" type="text" :disabled="savingDelivery" placeholder="例如 20:00 - 23:00" />
          </label>
          <label class="transport-simple-detail-form__wide">
            <span>配送地址 / 详细地址</span>
            <textarea v-model="deliveryForm.address_full" :disabled="savingDelivery" rows="3" placeholder="请输入配送地址"></textarea>
          </label>
          <label>
            <span>公寓 / 楼栋 / 房间</span>
            <input v-model="deliveryForm.room_or_building" type="text" :disabled="savingDelivery" />
          </label>
          <label>
            <span>邮编</span>
            <input v-model="deliveryForm.postcode" type="text" :disabled="savingDelivery" />
          </label>
          <label>
            <span>是否有电梯</span>
            <select v-model="deliveryForm.has_lift" :disabled="savingDelivery">
              <option value="">未填写</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label>
            <span>是否需要上楼</span>
            <select v-model="deliveryForm.needs_upstairs" :disabled="savingDelivery">
              <option value="">未填写</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label>
            <span>配送方式</span>
            <input v-model="deliveryForm.box_delivery_method" type="text" :disabled="savingDelivery" />
          </label>
          <div class="transport-simple-detail-form__actions">
            <button class="primary-button" type="submit" :disabled="savingDelivery">
              {{ savingDelivery ? "保存中..." : "保存配送信息" }}
            </button>
          </div>
        </form>
      </DetailSection>

      <DetailSection title="费用汇总" description="按箱子数量和已有费用字段展示，不在前端重新计算。">
        <div class="storage-detail-combined-grid">
          <div class="storage-related-order-panel">
            <div>
              <span>箱子数量汇总</span>
              <strong v-for="line in boxQuantityLines" :key="line">{{ line }}</strong>
            </div>
            <div>
              <span>总箱数</span>
              <strong>{{ displayValue(totalBoxCount) }}</strong>
            </div>
          </div>
          <div class="storage-related-order-panel">
            <div>
              <span>关联寄存订单</span>
              <strong v-if="relatedStorageOrder">{{ relatedStorageOrderNo() }}</strong>
              <strong v-else>{{ relatedStorageLoading ? "查询中..." : "暂无关联寄存订单" }}</strong>
            </div>
            <RouterLink v-if="relatedStorageRoute" class="secondary-button" :to="relatedStorageRoute">
              查看寄存订单
            </RouterLink>
          </div>
          <div class="readonly-field-grid storage-detail-combined-grid__wide">
            <ReadonlyField v-for="item in feeFields" :key="item.label" v-bind="item" />
          </div>
        </div>
      </DetailSection>

      <DetailSection title="后台处理信息" description="状态、归档和最近处理信息。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in processingFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="内部备注 / 操作记录">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>
        <div v-if="operationLogs.length" class="storage-operation-log-list">
          <article v-for="log in operationLogs.slice(0, 8)" :key="log.id || `${log.action}-${log.created_at}`" class="storage-operation-log-item">
            <strong>{{ operationActionLabel(log.action, log) }}</strong>
            <span>{{ operationActor(log) }} · {{ formatDateTime(log.created_at) }}</span>
            <span>{{ operationChangedFields(log) }}</span>
          </article>
        </div>
        <p v-else class="detail-muted">暂无操作记录</p>
      </DetailSection>
    </template>
  </section>
</template>
