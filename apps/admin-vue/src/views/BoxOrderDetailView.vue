<script setup>
import { computed, onMounted, ref } from "vue";
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
const deleteDialogOpen = ref(false);
const statusDialogOpen = ref(false);
const statusDraft = ref("");

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

function boolLabel(value) {
  if (value === true || value === "true" || value === 1 || value === "1") return "是";
  if (value === false || value === "false" || value === 0 || value === "0") return "否";
  return "未填写";
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
  field("箱子总费用", formatMoney(boxTotal.value)),
  field("配送费用", formatMoney(deliveryFee.value)),
  field("会员减免", formatMoney(order.value?.membership_discount_amount)),
  field("附加费用", formatMoney(firstValue(order.value?.extra_charge_amount, estimateSummary.value?.extraChargeAmount))),
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
  field("内部备注", firstValue(order.value?.internal_notes, order.value?.admin_notes, adminSnapshot.value.internal_notes, adminSnapshot.value.notes), true),
  field("操作记录", firstValue(order.value?.operation_log, order.value?.operation_logs, order.value?.audit_logs, adminSnapshot.value.operation_log), true)
]);

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
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in deliveryFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="费用汇总" description="展示已有费用字段，不在前端重新计算。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in feeFields" :key="item.label" v-bind="item" />
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
