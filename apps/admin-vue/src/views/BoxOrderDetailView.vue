<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import { deleteStorageOrder, exportStorageOrders, fetchStorageOrder, updateStorageOrder } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
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
const exporting = ref(false);
const deleting = ref(false);
const savingStatus = ref(false);
const savingDelivery = ref(false);
const savingBoxInfo = ref(false);
const savingPayment = ref(false);
const savingOffline = ref(false);
const deleteDialogOpen = ref(false);
const statusDialogOpen = ref(false);
const statusDraft = ref("");

const deliveryForm = reactive({
  box_delivery_date: "",
  box_delivery_time_slot: "",
  room_or_building: "",
  address_full: "",
  postcode: "",
  has_lift: "",
  needs_upstairs: "",
  box_delivery_method: ""
});

const boxInfoForm = reactive({
  estimated_box_count: 0
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

function inputDate(value) {
  return String(firstValue(value) || "").slice(0, 10);
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

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function billingInfo(record = order.value || {}) {
  const formJson = parseJson(record.customer_form_json) || {};
  const admin = asObject(formJson.admin);
  return {
    ...asObject(formJson.billing),
    ...asObject(admin.billing)
  };
}

function paymentStatusValue(record = order.value || {}) {
  const billing = billingInfo(record);
  return String(billing.payment_status || billing.status || "").trim();
}

function isPaymentReceived(record = order.value || {}) {
  return paymentStatusValue(record) === "paid";
}

function paymentLabel(record = order.value || {}) {
  return isPaymentReceived(record) ? "已收款" : "未收款";
}

function paymentTone(record = order.value || {}) {
  return isPaymentReceived(record) ? "success" : "danger";
}

function offlineRecordedLabel(record = order.value || {}) {
  return record?.offline_recorded ? "已记录" : "未记录";
}

function offlineRecordedTone(record = order.value || {}) {
  return record?.offline_recorded ? "success" : "neutral";
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

const purchasedBoxes = computed(() => {
  const direct = parseJson(order.value?.purchased_boxes);
  const source = Array.isArray(direct) && direct.length
    ? direct
    : Array.isArray(estimateSummary.value?.items)
      ? estimateSummary.value.items
      : [];
  return source
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
    .filter((entry) => entry.quantity > 0 || isMeaningfulValue(entry.subtotal));
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

const totalBoxCount = computed(() => {
  const purchasedCount = purchasedBoxes.value.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  return purchasedCount || toNumber(firstValue(order.value?.estimated_box_count, serviceDetails.value.storageBoxCount, serviceDetails.value.boxCount));
});

const boxUnitPrice = computed(() => {
  const pricedItem = purchasedBoxes.value.find(item => toNumber(item.unitPrice) > 0);
  if (pricedItem) return toNumber(pricedItem.unitPrice);
  const currentCount = totalBoxCount.value;
  const currentTotal = toNumber(boxTotal.value);
  return currentCount > 0 && currentTotal > 0 ? currentTotal / currentCount : 0;
});

const editableBoxFee = computed(() => {
  const count = Math.max(0, Number.parseInt(String(boxInfoForm.estimated_box_count || 0), 10) || 0);
  return boxUnitPrice.value > 0 ? count * boxUnitPrice.value : boxTotal.value;
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

const totalFee = computed(() => firstValue(
  order.value?.estimated_total_price,
  order.value?.final_price,
  order.value?.total_price,
  estimateSummary.value?.estimatedTotalPrice,
  estimateSummary.value?.finalPrice,
  estimateSummary.value?.grandTotal,
  estimateSummary.value?.total
));

const adjustmentFeeText = computed(() => {
  const discount = firstValue(
    order.value?.membership_discount_amount,
    order.value?.discount_amount,
    estimateSummary.value?.membershipDiscountAmount,
    estimateSummary.value?.membership_discount_amount,
    estimateSummary.value?.discountAmount,
    estimateSummary.value?.discount_amount
  );
  const extra = firstValue(
    order.value?.extra_charge_amount,
    order.value?.adjustment_amount,
    estimateSummary.value?.extraChargeAmount,
    estimateSummary.value?.extra_charge_amount,
    estimateSummary.value?.adjustmentAmount,
    estimateSummary.value?.adjustment_amount
  );
  const parts = [];
  if (toNumber(discount) !== 0) parts.push(`优惠 ${formatMoney(discount)}`);
  if (toNumber(extra) !== 0) parts.push(`调整 ${formatMoney(extra)}`);
  return parts.length ? parts.join(" / ") : "£0.00";
});

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

function relatedPickupNoFromBoxOrderNo(value) {
  const text = String(value || "").trim();
  return /ST-B-?/i.test(text) ? text.replace(/^(.*ST-)B(-?.*)$/i, "$1P$2") : "";
}

const relatedStorageOrderNo = computed(() => firstValue(
  order.value?.related_storage_order?.order_no,
  order.value?.related_storage_order?.storage_pickup_order_no,
  String(order.value?.storage_pickup_order_no || "").toUpperCase().startsWith("ST-P") ? order.value?.storage_pickup_order_no : "",
  String(order.value?.related_order_no || "").toUpperCase().startsWith("ST-P") ? order.value?.related_order_no : "",
  String(order.value?.related_order_no || "").toUpperCase().startsWith("ST-S") ? order.value?.related_order_no : "",
  String(order.value?.related_order_no || "").toUpperCase().startsWith("ST-R") ? order.value?.related_order_no : "",
  String(order.value?.parent_order_no || "").toUpperCase().startsWith("ST-P") ? order.value?.parent_order_no : "",
  customerForm.value.storagePickupOrderNo,
  customerForm.value.storage_pickup_order_no,
  serviceDetails.value.storagePickupOrderNo,
  serviceDetails.value.storage_pickup_order_no,
  relatedPickupNoFromBoxOrderNo(order.value?.box_order_no),
  relatedPickupNoFromBoxOrderNo(order.value?.order_no)
));

const relatedStorageOrderRoute = computed(() => {
  const storageId = firstValue(
    order.value?.related_storage_order?.id,
    order.value?.storage_order_id,
    order.value?.related_storage_order_id,
    order.value?.storage_pickup_order_id,
    order.value?.linked_storage_order_id
  );
  if (storageId) {
    return {
      name: "storage-service-order-detail",
      params: { id: String(storageId) },
      query: { return_to: route.fullPath }
    };
  }
  if (relatedStorageOrderNo.value) {
    return {
      name: "storage-all-orders",
      query: { search: relatedStorageOrderNo.value }
    };
  }
  return null;
});

const processingFields = computed(() => [
  field("后台状态", statusLabel(order.value?.status)),
  field("收款状态", paymentLabel()),
  field("线下记录状态", offlineRecordedLabel()),
  field("归档状态", order.value?.archived === true ? "已归档" : order.value?.archived === false ? "未归档" : "未填写"),
  field("上次操作人", firstValue(order.value?.last_operator_name, order.value?.updated_by_admin_name, adminSnapshot.value.updated_by, adminSnapshot.value.operator)),
  field("下单时间", formatDateTime(order.value?.created_at)),
  field("更新时间", formatDateTime(order.value?.updated_at))
]);

const noteFields = computed(() => [
  field("用户备注", firstValue(order.value?.notes, serviceDetails.value.notes, customerForm.value.notes), true),
  field("内部备注", firstValue(order.value?.internal_notes, order.value?.admin_notes, adminSnapshot.value.internal_notes, adminSnapshot.value.notes), true),
  field("操作记录", firstValue(order.value?.operation_log, order.value?.operation_logs, order.value?.audit_logs, adminSnapshot.value.operation_log), true)
]);

function syncEditableForms(record = order.value || {}) {
  deliveryForm.box_delivery_date = inputDate(firstValue(record.box_delivery_date, record.service_date, serviceDetails.value.boxDeliveryDate, serviceDetails.value.serviceDate));
  deliveryForm.box_delivery_time_slot = String(firstValue(record.box_delivery_time_slot, record.service_time_slot, record.service_time, serviceDetails.value.boxDeliveryTimeSlot, serviceDetails.value.serviceTimeSlot) || "");
  deliveryForm.room_or_building = String(firstValue(record.room_or_building, serviceDetails.value.roomOrBuilding, serviceDetails.value.room) || "");
  deliveryForm.address_full = String(firstValue(record.address_full, serviceDetails.value.serviceAddress, serviceDetails.value.address, serviceDetails.value.fullAddress, customerForm.value.address) || "");
  deliveryForm.postcode = String(firstValue(record.postcode, serviceDetails.value.postcode, customerForm.value.postcode) || "");
  deliveryForm.has_lift = boolFormValue(firstValue(record.has_lift, serviceDetails.value.hasLift));
  deliveryForm.needs_upstairs = boolFormValue(firstValue(record.needs_upstairs, serviceDetails.value.needsUpstairs, serviceDetails.value.needUpstairs));
  deliveryForm.box_delivery_method = String(firstValue(record.box_delivery_method, serviceDetails.value.boxDeliveryMethod, estimateSummary.value?.boxDeliveryMethod) || "");
  boxInfoForm.estimated_box_count = totalBoxCount.value || toNumber(record.estimated_box_count);
}

async function saveBoxInfo() {
  if (savingBoxInfo.value) return;
  const nextCount = Math.max(0, Number.parseInt(String(boxInfoForm.estimated_box_count || 0), 10) || 0);
  savingBoxInfo.value = true;
  notice.value = "";
  error.value = "";
  try {
    const updated = await updateStorageOrder(orderId.value, {
      estimated_box_count: nextCount,
      recalculate_pricing: true,
      sync_related_storage_order: true
    });
    await loadOrder({ silent: true });
    notice.value = updated?.related_storage_order
      ? "箱子数量和费用已保存，并已同步关联寄存订单。"
      : "箱子数量和费用已保存；未找到单独关联寄存订单，仅更新当前买箱订单。";
  } catch (err) {
    notice.value = err.message || "箱子数量和费用保存失败。";
  } finally {
    savingBoxInfo.value = false;
  }
}

async function saveDeliveryInfo() {
  if (savingDelivery.value) return;
  savingDelivery.value = true;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(orderId.value, {
      box_delivery_date: deliveryForm.box_delivery_date,
      service_date: deliveryForm.box_delivery_date,
      box_delivery_time_slot: deliveryForm.box_delivery_time_slot,
      service_time_slot: deliveryForm.box_delivery_time_slot,
      room_or_building: deliveryForm.room_or_building,
      address_full: deliveryForm.address_full,
      postcode: deliveryForm.postcode,
      has_lift: deliveryForm.has_lift === "" ? null : deliveryForm.has_lift === "true",
      needs_upstairs: deliveryForm.needs_upstairs === "" ? null : deliveryForm.needs_upstairs === "true",
      box_delivery_method: deliveryForm.box_delivery_method
    });
    await loadOrder({ silent: true });
    notice.value = "配送信息已保存。";
  } catch (err) {
    notice.value = err.message || "配送信息保存失败。";
  } finally {
    savingDelivery.value = false;
  }
}

async function toggleOfflineRecorded() {
  if (savingOffline.value) return;
  savingOffline.value = true;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(orderId.value, {
      offline_recorded: !Boolean(order.value?.offline_recorded)
    });
    await loadOrder({ silent: true });
    notice.value = order.value?.offline_recorded ? "已标记为已线下记录。" : "已取消线下记录。";
  } catch (err) {
    notice.value = err.message || "线下记录状态保存失败。";
  } finally {
    savingOffline.value = false;
  }
}

async function togglePaymentReceived() {
  if (savingPayment.value) return;
  savingPayment.value = true;
  notice.value = "";
  error.value = "";
  try {
    const nextReceived = !isPaymentReceived(order.value);
    await updateStorageOrder(orderId.value, {
      customer_form_admin: {
        billing: {
          payment_status: nextReceived ? "paid" : "unpaid",
          payment_note: nextReceived ? "已收款" : "未收款"
        }
      }
    });
    await loadOrder({ silent: true });
    notice.value = nextReceived ? "已标记为已收款。" : "已取消收款。";
  } catch (err) {
    notice.value = err.message || "收款状态保存失败。";
  } finally {
    savingPayment.value = false;
  }
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || `box-order-${boxOrderNo()}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function exportCurrentOrder() {
  if (exporting.value) return;
  exporting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { blob, filename } = await exportStorageOrders({
      order_type: "box_order",
      search: boxOrderNo(),
      sort: "created_at_desc"
    });
    downloadBlob(blob, filename);
    notice.value = "当前买箱订单导出已开始下载。";
  } catch (err) {
    notice.value = err.message || "导出 Excel 失败。";
  } finally {
    exporting.value = false;
  }
}

function openDeleteDialog() {
  deleteDialogOpen.value = true;
  notice.value = "";
}

function closeDeleteDialog() {
  if (!deleting.value) deleteDialogOpen.value = false;
}

async function confirmDelete() {
  if (deleting.value || !orderId.value) return;
  deleting.value = true;
  notice.value = "";
  error.value = "";
  try {
    await deleteStorageOrder(orderId.value);
    notice.value = "买箱订单已删除，正在返回列表。";
    window.location.href = listHrefForOrder();
  } catch (err) {
    notice.value = err.message || "删除订单失败。";
  } finally {
    deleting.value = false;
    deleteDialogOpen.value = false;
  }
}

function openStatusDialog() {
  statusDraft.value = String(order.value?.status || "");
  statusDialogOpen.value = true;
  notice.value = "";
}

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
    syncEditableForms(order.value);
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
        <p class="view-heading__eyebrow">买箱订单详情</p>
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
        <div class="storage-detail-summary-bar__badges">
          <StatusBadge :tone="statusTone(order.status)">{{ statusLabel(order.status) }}</StatusBadge>
          <StatusBadge :tone="paymentTone(order)">{{ paymentLabel(order) }}</StatusBadge>
          <StatusBadge :tone="offlineRecordedTone(order)">{{ offlineRecordedLabel(order) }}</StatusBadge>
        </div>
      </div>

      <DetailSection title="用户信息" description="客服核对联系人和账号信息。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in userFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="买箱与费用汇总" description="箱型、数量、费用和关联寄存订单集中核对。">
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
        <div class="storage-fee-compact-panel storage-fee-compact-panel--merged">
          <form class="storage-fee-compact-form storage-fee-compact-form--merged" @submit.prevent="saveBoxInfo">
            <label>
              <span>箱子总数</span>
              <input v-model.number="boxInfoForm.estimated_box_count" type="number" min="0" step="1" />
            </label>
            <article class="readonly-field">
              <span>箱子费用</span>
              <strong>{{ formatMoney(editableBoxFee) }}</strong>
            </article>
            <article class="readonly-field">
              <span>配送费用</span>
              <strong>{{ formatMoney(deliveryFee) }}</strong>
            </article>
            <article class="readonly-field">
              <span>优惠/调整费用</span>
              <strong>{{ adjustmentFeeText }}</strong>
            </article>
            <article class="readonly-field">
              <span>总费用</span>
              <strong>{{ formatMoney(totalFee) }}</strong>
            </article>
            <button class="primary-button" type="submit" :disabled="savingBoxInfo">
              {{ savingBoxInfo ? "保存中..." : "保存数量和费用" }}
            </button>
          </form>
          <div class="storage-related-order-panel storage-related-order-panel--compact">
            <div>
              <span>关联寄存订单</span>
              <strong>{{ displayValue(relatedStorageOrderNo) }}</strong>
            </div>
            <RouterLink v-if="relatedStorageOrderRoute" class="secondary-button" :to="relatedStorageOrderRoute">
              查看寄存订单
            </RouterLink>
            <span v-else class="storage-related-action__empty">暂无关联寄存订单</span>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="配送信息" description="送箱日期、时间、地址和上楼/电梯情况。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in deliveryFields" :key="item.label" v-bind="item" />
        </div>
        <form class="editable-detail-form editable-detail-form--address" @submit.prevent="saveDeliveryInfo">
          <label>
            <span>送箱日期</span>
            <input v-model="deliveryForm.box_delivery_date" type="date" />
          </label>
          <label>
            <span>送箱时间段</span>
            <input v-model="deliveryForm.box_delivery_time_slot" type="text" />
          </label>
          <label>
            <span>公寓 / 楼栋 / 房间</span>
            <input v-model="deliveryForm.room_or_building" type="text" />
          </label>
          <label>
            <span>邮编</span>
            <input v-model="deliveryForm.postcode" type="text" />
          </label>
          <label>
            <span>是否有电梯</span>
            <select v-model="deliveryForm.has_lift">
              <option value="">未填写</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label>
            <span>是否需要上楼</span>
            <select v-model="deliveryForm.needs_upstairs">
              <option value="">未填写</option>
              <option value="true">是</option>
              <option value="false">否</option>
            </select>
          </label>
          <label>
            <span>配送方式</span>
            <input v-model="deliveryForm.box_delivery_method" type="text" />
          </label>
          <label class="editable-detail-form__wide">
            <span>配送地址</span>
            <textarea v-model="deliveryForm.address_full" rows="3"></textarea>
          </label>
          <div class="editable-detail-form__actions">
            <button class="primary-button" type="submit" :disabled="savingDelivery">
              {{ savingDelivery ? "保存中..." : "保存配送信息" }}
            </button>
          </div>
        </form>
      </DetailSection>

      <DetailSection title="内部备注 / 操作记录">
        <div class="storage-detail-action-row">
          <button class="secondary-button" type="button" :disabled="savingPayment" @click="togglePaymentReceived">
            {{ savingPayment ? "保存中..." : (isPaymentReceived(order) ? "取消收款" : "标记已收款") }}
          </button>
          <button class="secondary-button" type="button" :disabled="savingOffline" @click="toggleOfflineRecorded">
            {{ savingOffline ? "保存中..." : (order.offline_recorded ? "取消线下记录" : "标记已线下记录") }}
          </button>
        </div>
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

    </template>

    <ConfirmDialog
      :open="deleteDialogOpen"
      title="确认删除买箱订单"
      confirm-label="确认删除"
      :loading="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    >
      <p class="confirm-dialog__warning">删除后不可恢复，请确认这是要删除的单条买箱订单。</p>
      <div class="readonly-field-grid">
        <article class="readonly-field">
          <span>订单编号</span>
          <strong>{{ boxOrderNo() }}</strong>
        </article>
        <article class="readonly-field">
          <span>服务类型</span>
          <strong>买箱订单</strong>
        </article>
        <article class="readonly-field">
          <span>用户姓名</span>
          <strong>{{ displayValue(order?.customer_name) }}</strong>
        </article>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      :open="statusDialogOpen"
      title="确认修改订单状态"
      confirm-label="确认修改"
      :loading="savingStatus"
      tone="default"
      @cancel="closeStatusDialog"
      @confirm="confirmStatusChange"
    >
      <p>请选择新的买箱订单状态。</p>
      <label class="field">
        <span>订单状态</span>
        <select v-model="statusDraft">
          <option value="pending_confirmation">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      <div class="readonly-field-grid">
        <article class="readonly-field">
          <span>订单编号</span>
          <strong>{{ boxOrderNo() }}</strong>
        </article>
        <article class="readonly-field">
          <span>当前状态</span>
          <strong>{{ statusLabel(order?.status) }}</strong>
        </article>
        <article class="readonly-field">
          <span>将修改为</span>
          <strong>{{ statusLabel(statusDraft) }}</strong>
        </article>
      </div>
    </ConfirmDialog>
  </section>
</template>
