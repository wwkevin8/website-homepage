<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchStorageOrders, updateStorageOrder } from "@/api/admin-api";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";

const columns = [
  { key: "row_index", label: "序号", sortable: false },
  { key: "service_date", label: "服务日期 / 订单编号", sortable: false },
  { key: "service_time", label: "服务时间", sortable: true },
  { key: "customer_name", label: "姓名", sortable: true },
  { key: "service_content", label: "服务项目", sortable: true },
  { key: "box_count", label: "箱子数量预估", sortable: true },
  { key: "address", label: "完整地址 + 邮编", sortable: false },
  { key: "phone", label: "联系电话", sortable: false },
  { key: "wechat", label: "微信号", sortable: false },
  { key: "payment_note", label: "费用/支付备注", sortable: false },
  { key: "payment_action", label: "收款", sortable: true },
  { key: "remark", label: "客服备注", sortable: false },
  { key: "actions", label: "操作", sortable: false }
];

const orders = ref([]);
const loading = ref(false);
const savingPaymentId = ref("");
const savingRemarkId = ref("");
const notice = ref("");
const error = ref("");
const remarkDrafts = reactive({});
const sortState = reactive({ key: "service_time", direction: "asc" });

function londonDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const today = ref(londonDateString());

const hasOrders = computed(() => sortedOrders.value.length > 0);

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (text && text !== "--" && text !== "null" && text !== "undefined") {
      return text;
    }
  }
  return "";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!text) return "--";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${Math.max(0, amount).toFixed(2)}` : "--";
}

function baseStorageOrderId(order) {
  return order.storage_order_id || String(order.id || "").split(":")[0];
}

function rowActionId(order) {
  return String(order?.id || baseStorageOrderId(order) || "");
}

function rowOrderNo(order) {
  return order.display_order_no || order.order_no || order.storage_pickup_order_no || order.storage_return_order_no || order.box_order_no || order.parent_order_no;
}

function rowServiceDate(order) {
  return order.service_date_unified || order.service_date;
}

function rowTimeSlot(order) {
  return order.service_time_slot_unified || order.service_time_slot || order.service_time;
}

function serviceTypeLabel(order) {
  return {
    box_order: "买箱",
    storage_collection: "取寄存",
    storage_return: "送寄存"
  }[order.storage_order_kind] || order.service_type_label || "--";
}

function estimateSummary(order) {
  return asObject(order.estimate_summary_json);
}

function purchasedBoxItems(order) {
  const direct = Array.isArray(order.purchased_boxes) ? order.purchased_boxes : [];
  const summaryItems = Array.isArray(estimateSummary(order).items) ? estimateSummary(order).items : [];
  return (direct.length ? direct : summaryItems)
    .map(entry => asObject(entry))
    .map(entry => positiveNumber(entry.quantity ?? entry.purchaseQty ?? entry.purchase_quantity ?? entry.count ?? entry.qty))
    .filter(Boolean);
}

function rowBoxCount(order) {
  const itemCount = purchasedBoxItems(order).reduce((sum, value) => sum + value, 0);
  return itemCount || positiveNumber(order.estimated_box_count) || positiveNumber(estimateSummary(order).totalBoxes);
}

function rowServiceContent(order) {
  const count = rowBoxCount(order);
  if (order.storage_order_kind === "box_order") {
    return count ? `买箱｜箱子 × ${count}` : "买箱";
  }
  if (order.storage_order_kind === "storage_collection") {
    return count ? `取寄存｜箱子 × ${count}` : "取件寄存";
  }
  if (order.storage_order_kind === "storage_return") {
    return count ? `送寄存｜箱子 × ${count}` : "送寄存";
  }
  return serviceTypeLabel(order);
}

function normalizeAddressKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addAddressPart(parts, value) {
  String(value || "")
    .split("/")
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .forEach(part => {
      const key = normalizeAddressKey(part);
      if (!key) return;
      const exists = parts.some(item => {
        const itemKey = normalizeAddressKey(item);
        return itemKey === key || itemKey.includes(key) || key.includes(itemKey);
      });
      if (!exists) parts.push(part);
    });
}

function rowAddress(order) {
  const parts = [];
  addAddressPart(parts, order.room_or_building);
  addAddressPart(parts, order.address_full);
  addAddressPart(parts, order.postcode);
  return parts.join(" / ") || "--";
}

function billingInfo(order) {
  const formJson = asObject(order.customer_form_json);
  const admin = asObject(formJson.admin);
  return {
    ...asObject(formJson.billing),
    ...asObject(admin.billing)
  };
}

function rowPaymentStatus(order) {
  const billing = billingInfo(order);
  return String(billing.payment_status || billing.status || "").trim();
}

function isPaymentReceived(order) {
  return rowPaymentStatus(order) === "paid";
}

function paymentStatusLabel(status) {
  return {
    unpaid: "未收款",
    pending: "待确认",
    paid: "已收款",
    refunded: "已退款",
    waived: "免费"
  }[String(status || "").trim()] || "";
}

function membershipPaymentNote(order) {
  return (Number(order.membership_discount_amount || 0) > 0 || order.membership_benefit_claim_id)
    ? "会员服务"
    : "";
}

function rowTotalAmount(order) {
  const summary = estimateSummary(order);
  const amount = Number(order.final_price ?? order.estimated_total_price ?? summary.finalTotal ?? summary.grandTotal ?? summary.total);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function rowPaymentNote(order) {
  const billing = billingInfo(order);
  const note = firstText(billing.payment_note, billing.note, billing.remark, billing.paymentRemark);
  const status = paymentStatusLabel(billing.payment_status || billing.status);
  const membershipNote = membershipPaymentNote(order);
  const lines = [];
  if (membershipNote) lines.push(membershipNote);
  if (status) lines.push(status);
  if (note && note !== status) lines.push(note);
  if (lines.length) return lines.join("｜");
  return rowTotalAmount(order) > 0 ? "未收款" : "免费";
}

function isPaymentAttention(order) {
  return /未收款|待付|待确认|未付|unpaid|pending/i.test(rowPaymentNote(order));
}

function rowCustomerServiceRemarkText(order) {
  const formJson = asObject(order.customer_form_json);
  const admin = asObject(formJson.admin);
  return firstText(admin.service_notes);
}

function rowStudentRemarkText(order) {
  return firstText(order.item_description, order.notes);
}

function rowRemarkText(order) {
  const customerServiceRemark = rowCustomerServiceRemarkText(order);
  const studentRemark = rowStudentRemarkText(order);
  const lines = [];
  if (customerServiceRemark) lines.push(customerServiceRemark);
  if (
    studentRemark
    && !customerServiceRemark.includes(studentRemark)
    && !customerServiceRemark.includes(`同学备注：${studentRemark}`)
  ) {
    lines.push(`同学备注：${studentRemark}`);
  }
  return lines.join("\n");
}

function syncRemarkDrafts(items = orders.value) {
  const keys = new Set();
  items.forEach(order => {
    const key = rowActionId(order);
    if (!key) return;
    keys.add(key);
    remarkDrafts[key] = rowRemarkText(order);
  });
  Object.keys(remarkDrafts).forEach(key => {
    if (!keys.has(key)) delete remarkDrafts[key];
  });
}

function sortValue(order, key) {
  if (key === "service_time") return rowTimeSlot(order);
  if (key === "customer_name") return order.customer_name || "";
  if (key === "service_content") return rowServiceContent(order);
  if (key === "box_count") return rowBoxCount(order);
  if (key === "payment_action") return isPaymentReceived(order) ? 1 : 0;
  return "";
}

const sortedOrders = computed(() => {
  const direction = sortState.direction === "desc" ? -1 : 1;
  return [...orders.value].sort((left, right) => {
    const leftValue = sortValue(left, sortState.key);
    const rightValue = sortValue(right, sortState.key);
    if (typeof leftValue === "number" || typeof rightValue === "number") {
      return (Number(leftValue || 0) - Number(rightValue || 0)) * direction;
    }
    return String(leftValue || "").localeCompare(String(rightValue || ""), "zh-Hans-CN", { numeric: true }) * direction;
  });
});

function toggleSort(column) {
  if (!column.sortable) return;
  if (sortState.key === column.key) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.key = column.key;
    sortState.direction = "asc";
  }
}

function sortIndicator(column) {
  if (!column.sortable || sortState.key !== column.key) return "";
  return sortState.direction === "asc" ? "↑" : "↓";
}

function detailHref(order) {
  const id = baseStorageOrderId(order);
  if (!id) return "";
  const query = new URLSearchParams({ return_to: "/admin/storage/today-work-orders", order_type: order.storage_order_kind || "" });
  const orderNo = String(rowOrderNo(order) || "").toUpperCase();
  if (order.storage_order_kind === "box_order" || orderNo.startsWith("ST-B")) {
    return `/admin/storage/box-orders/${encodeURIComponent(id)}?${query.toString()}`;
  }
  return `/admin/storage/storage-orders/${encodeURIComponent(id)}?${query.toString()}`;
}

function openDetail(order) {
  const href = detailHref(order);
  if (href) {
    window.location.href = href;
  }
}

async function loadOrders() {
  loading.value = true;
  notice.value = "";
  error.value = "";
  orders.value = [];
  try {
    const allItems = [];
    let page = 1;
    let totalPages = 1;
    do {
      const payload = await fetchStorageOrders({
        order_type: "all",
        date_start: today.value,
        date_end: today.value,
        page,
        page_size: 50,
        sort: "service_date_nearest"
      });
      const items = Array.isArray(payload?.items) ? payload.items : [];
      allItems.push(...items);
      totalPages = Number(payload?.pagination?.total_pages || 1);
      page += 1;
    } while (page <= totalPages);

    orders.value = allItems.filter(order => ["box_order", "storage_collection", "storage_return"].includes(order.storage_order_kind));
    syncRemarkDrafts(orders.value);
  } catch (err) {
    error.value = err.message || "当天工单加载失败。";
  } finally {
    loading.value = false;
  }
}

async function togglePaymentReceived(order) {
  const id = baseStorageOrderId(order);
  if (!id || savingPaymentId.value) return;
  savingPaymentId.value = rowActionId(order);
  notice.value = "";
  error.value = "";
  try {
    const nextReceived = !isPaymentReceived(order);
    await updateStorageOrder(id, {
      customer_form_admin: {
        billing: {
          payment_status: nextReceived ? "paid" : "unpaid",
          payment_note: nextReceived ? "已收款" : "未收款"
        }
      }
    });
    notice.value = `${displayValue(rowOrderNo(order))} 已标记为${nextReceived ? "已收款" : "未收款"}。`;
    await loadOrders();
  } catch (err) {
    error.value = err.message || "收款状态保存失败。";
  } finally {
    savingPaymentId.value = "";
  }
}

async function saveRemark(order) {
  const id = baseStorageOrderId(order);
  const key = rowActionId(order);
  if (!id || !key || savingRemarkId.value) return;
  const nextRemark = String(remarkDrafts[key] || "").trim();
  if (nextRemark === rowRemarkText(order)) return;
  savingRemarkId.value = key;
  notice.value = "";
  error.value = "";
  try {
    await updateStorageOrder(id, {
      customer_form_admin: {
        service_notes: nextRemark
      }
    });
    notice.value = `${displayValue(rowOrderNo(order))} 的客服备注已保存。`;
    await loadOrders();
  } catch (err) {
    error.value = err.message || "客服备注保存失败。";
  } finally {
    savingRemarkId.value = "";
  }
}

onMounted(loadOrders);
</script>

<template>
  <section class="storage-orders-view storage-today-work-orders-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage daily worksheet</p>
        <h2>当天工单</h2>
      </div>
    </div>

    <form class="admin-filter-panel today-work-filter-panel" @submit.prevent="loadOrders">
      <label class="field">
        <span>工单日期</span>
        <input v-model="today" type="date" />
      </label>
      <div class="filter-actions">
        <button class="primary-button" type="submit" :disabled="loading">查询</button>
      </div>
    </form>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载当天工单...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasOrders" title="当天暂无寄存服务工单" description="可以切换日期查看其他服务日。" />

    <template v-else>
      <div class="today-work-summary">
        {{ formatDate(today) }} 共 {{ sortedOrders.length }} 条寄存服务工单
      </div>
      <div class="admin-table-wrap today-work-table-wrap">
        <table class="admin-table today-work-table">
          <colgroup>
            <col style="width: 72px" />
            <col style="width: 150px" />
            <col style="width: 130px" />
            <col style="width: 140px" />
            <col style="width: 180px" />
            <col style="width: 130px" />
            <col style="width: 360px" />
            <col style="width: 150px" />
            <col style="width: 150px" />
            <col style="width: 220px" />
            <col style="width: 110px" />
            <col style="width: 260px" />
            <col style="width: 150px" />
          </colgroup>
          <thead>
            <tr>
              <th
                v-for="column in columns"
                :key="column.key"
                :class="{ 'is-sortable': column.sortable }"
              >
                <button v-if="column.sortable" type="button" class="table-sort-button" @click="toggleSort(column)">
                  {{ column.label }} <span>{{ sortIndicator(column) }}</span>
                </button>
                <span v-else>{{ column.label }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in sortedOrders" :key="rowActionId(row)">
              <td>{{ index + 1 }}</td>
              <td>
                <span class="cell-stack service-date-order-cell">
                  <strong>{{ formatDate(rowServiceDate(row)) }}</strong>
                  <small>{{ displayValue(rowOrderNo(row)) }}</small>
                </span>
              </td>
              <td>{{ displayValue(rowTimeSlot(row)) }}</td>
              <td><strong>{{ displayValue(row.customer_name) }}</strong></td>
              <td class="is-wrap">{{ rowServiceContent(row) }}</td>
              <td>{{ rowBoxCount(row) || "--" }}</td>
              <td class="is-wrap"><strong>{{ rowAddress(row) }}</strong></td>
              <td>{{ displayValue(row.phone) }}</td>
              <td>{{ displayValue(row.wechat_id) }}</td>
              <td :class="['is-wrap', { 'payment-note-attention': isPaymentAttention(row) }]">
                {{ rowPaymentNote(row) }}
                <small class="today-work-price">{{ formatMoney(rowTotalAmount(row)) }}</small>
              </td>
              <td>
                <button
                  :class="['table-action-button', isPaymentReceived(row) ? 'table-action-button--unpaid' : 'table-action-button--paid']"
                  type="button"
                  :disabled="savingPaymentId === rowActionId(row)"
                  @click="togglePaymentReceived(row)"
                >
                  {{ savingPaymentId === rowActionId(row) ? "保存中..." : (isPaymentReceived(row) ? "未收款" : "已收款") }}
                </button>
              </td>
              <td>
                <div class="remark-editor">
                  <textarea
                    v-model="remarkDrafts[rowActionId(row)]"
                    :disabled="savingRemarkId === rowActionId(row)"
                    rows="2"
                    placeholder="填写客服备注"
                    @blur="saveRemark(row)"
                  />
                  <button
                    class="table-action-button table-action-button--mini"
                    type="button"
                    :disabled="savingRemarkId === rowActionId(row)"
                    @click="saveRemark(row)"
                  >
                    {{ savingRemarkId === rowActionId(row) ? "保存中..." : "保存" }}
                  </button>
                </div>
              </td>
              <td>
                <button class="table-action-button" type="button" @click="openDetail(row)">查看详情</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>
