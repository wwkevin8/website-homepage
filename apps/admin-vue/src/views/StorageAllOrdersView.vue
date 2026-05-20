<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  bulkSetStorageOrdersOfflineRecorded,
  deleteStorageOrder,
  exportStorageOrders,
  fetchStorageOrders,
  updateStorageOrder
} from "@/api/admin-api";
import AdminBulkActionBar from "@/components/AdminBulkActionBar.vue";
import AdminTable from "@/components/AdminTable.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const columns = [
  { key: "selected", label: "选择", width: "54px" },
  { key: "created_at", label: "提交时间", width: "9%" },
  { key: "order_no", label: "订单编号", width: "10%" },
  { key: "service_type", label: "服务类型", width: "7%" },
  { key: "customer_name", label: "姓名", width: "7%" },
  { key: "wechat_id", label: "微信", width: "8%" },
  { key: "phone", label: "电话", width: "8%" },
  { key: "service_date", label: "服务日期", width: "8%" },
  { key: "service_time_slot", label: "时间段", width: "8%" },
  { key: "address_summary", label: "地址 / 公寓 / 楼栋 / 房间", width: "14%" },
  { key: "box_summary", label: "箱子摘要", width: "8%" },
  { key: "total_fee", label: "总费用", width: "7%" },
  { key: "offline_recorded", label: "线下记录", width: "7%" },
  { key: "last_operation", label: "上次操作", width: "10%" },
  { key: "actions", label: "操作", width: "160px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  search: "",
  serviceType: "",
  offlineRecorded: "",
  lastOperatedBy: "",
  dateStart: "",
  dateEnd: "",
  sort: "submitted_latest",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const orders = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const operatorOptions = ref([]);
const selectedIds = ref([]);
const loading = ref(false);
const exporting = ref(false);
const bulkSaving = ref(false);
const togglingId = ref("");
const deletingId = ref("");
const deleteCandidate = ref(null);
const storageTrackingReady = ref(true);
const storageTrackingMessage = ref("");
const error = ref("");
const notice = ref("");

const hasOrders = computed(() => orders.value.length > 0);
const selectedRows = computed(() => orders.value.filter(row => selectedIds.value.includes(String(row.id))));
const allCurrentPageSelected = computed(() => {
  const ids = orders.value.map(row => String(row.id)).filter(Boolean);
  return ids.length > 0 && ids.every(id => selectedIds.value.includes(id));
});

const operatorSelectOptions = computed(() => {
  const values = [filters.lastOperatedBy, ...operatorOptions.value]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
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

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "--";
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : displayValue(value);
}

function serviceTypeLabel(order) {
  return order.service_type_label || {
    box_order: "买箱",
    storage_collection: "取寄存",
    storage_return: "送寄存"
  }[order.storage_order_kind] || "--";
}

function serviceTypeTone(kind) {
  if (kind === "box_order") return "warning";
  if (kind === "storage_return") return "success";
  return "neutral";
}

function rowOrderNo(order) {
  return order.display_order_no || order.order_no || order.storage_pickup_order_no || order.box_order_no || order.parent_order_no;
}

function isMembershipOrder(order) {
  return Boolean(order?.membership_benefit_claim_id) || Number(order?.membership_discount_amount || 0) > 0;
}

function storageRowClass(order) {
  return isMembershipOrder(order) ? "is-member-order" : "";
}

function rowServiceDate(order) {
  return order.service_date_unified || order.service_date;
}

function rowTimeSlot(order) {
  return order.service_time_slot_unified || order.service_time_slot || order.service_time;
}

function normalizeAddressKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitAddressText(value) {
  return String(value || "")
    .split("/")
    .map(part => part.replace(/\s+/g, " ").trim())
    .filter(part => part && part !== "--");
}

function isDuplicateAddressPart(existingParts, value) {
  const key = normalizeAddressKey(value);
  if (!key) return true;
  return existingParts.some(part => {
    const partKey = normalizeAddressKey(part);
    return partKey === key || partKey.includes(key) || key.includes(partKey);
  });
}

function pushAddressPart(parts, value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text === "--" || isDuplicateAddressPart(parts, text)) return;
  parts.push(text);
}

function rowAddress(order) {
  const parts = [];
  splitAddressText(order.address_full).forEach(part => pushAddressPart(parts, part));
  splitAddressText(order.room_or_building).forEach(part => pushAddressPart(parts, part));
  splitAddressText(order.postcode).forEach(part => pushAddressPart(parts, part));
  return parts.join(" / ") || "--";
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function estimateSummary(order) {
  return asObject(order.estimate_summary_json);
}

function positiveQuantity(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeBoxLabel(entry) {
  const raw = entry?.label || entry?.boxLabel || entry?.box_label || entry?.boxType || entry?.box_type || entry?.type;
  const text = String(raw || "").trim();
  if (!text) return "箱型";
  return /^\d+$/.test(text) ? `${text}号箱` : text;
}

function boxQuantityFromEntry(entry) {
  return positiveQuantity(entry?.quantity ?? entry?.purchaseQty ?? entry?.purchase_quantity ?? entry?.purchaseQuantity ?? entry?.count ?? entry?.qty);
}

function purchasedBoxItems(order) {
  const direct = Array.isArray(order.purchased_boxes) ? order.purchased_boxes : [];
  const source = direct.length ? direct : (Array.isArray(estimateSummary(order).items) ? estimateSummary(order).items : []);
  return source
    .map(entry => asObject(entry))
    .map(entry => ({ ...entry, quantity: boxQuantityFromEntry(entry) || positiveQuantity(entry.purchaseQty ?? entry.purchase_quantity) }))
    .filter(entry => entry.quantity > 0);
}

function rowBoxSummaryLines(order) {
  const items = purchasedBoxItems(order);
  if (!items.length && order.estimated_box_count) {
    return [`箱子 × ${order.estimated_box_count}`];
  }
  return items.map(entry => `${normalizeBoxLabel(entry)} × ${entry.quantity}`);
}

function rowBoxSummary(order) {
  const lines = rowBoxSummaryLines(order);
  return lines.length ? lines.join("\n") : "--";
}

function rowTotalFee(order) {
  return order.final_price ?? order.estimated_total_price ?? estimateSummary(order).finalTotal ?? estimateSummary(order).grandTotal ?? estimateSummary(order).total;
}

function baseStorageOrderId(order) {
  return order.storage_order_id || String(order.id || "").split(":")[0];
}

function rowActionId(order) {
  return String(order?.id || baseStorageOrderId(order) || "");
}

function detailHref(order) {
  const id = baseStorageOrderId(order);
  if (!id) return "";
  const returnTo = "/admin/storage/orders";
  const query = new URLSearchParams({ return_to: returnTo, order_type: order.storage_order_kind || "" });
  const orderNo = String(rowOrderNo(order) || "").toUpperCase();
  if (order.storage_order_kind === "box_order" || orderNo.startsWith("ST-B")) {
    return `/admin/storage/box-orders/${encodeURIComponent(id)}?${query.toString()}`;
  }
  return `/admin/storage/storage-orders/${encodeURIComponent(id)}?${query.toString()}`;
}

function buildFilterQuery() {
  return {
    order_type: "all",
    search: filters.search.trim(),
    service_type: filters.serviceType,
    offline_recorded: filters.offlineRecorded,
    last_operated_by: filters.lastOperatedBy,
    date_start: filters.dateStart,
    date_end: filters.dateEnd,
    sort: filters.sort
  };
}

function buildQuery(page) {
  return {
    page,
    page_size: filters.pageSize,
    ...buildFilterQuery()
  };
}

async function loadOrders(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchStorageOrders(buildQuery(page));
    orders.value = Array.isArray(payload?.items) ? payload.items : [];
    operatorOptions.value = Array.isArray(payload?.operator_options) ? payload.operator_options : [];
    storageTrackingReady.value = payload?.storage_tracking_ready !== false;
    storageTrackingMessage.value = payload?.storage_tracking_message || "";
    selectedIds.value = selectedIds.value.filter(id => orders.value.some(row => String(row.id) === id));
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: orders.value.length,
      total_pages: orders.value.length ? 1 : 0
    };
  } catch (err) {
    orders.value = [];
    error.value = err.message || "寄存全部订单加载失败。";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  selectedIds.value = [];
  loadOrders(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  selectedIds.value = [];
  loadOrders(1);
}

function handlePageChange(page) {
  loadOrders(page);
}

function toggleCurrentPageSelection() {
  selectedIds.value = allCurrentPageSelected.value
    ? []
    : orders.value.map(row => String(row.id)).filter(Boolean);
}

function toggleRowSelection(row) {
  const id = String(row?.id || "");
  if (!id) return;
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(item => item !== id)
    : [...selectedIds.value, id];
}

function selectedBaseIds() {
  return Array.from(new Set(selectedRows.value.map(baseStorageOrderId).filter(Boolean)));
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "storage-all-orders.xls";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function handleExportFiltered() {
  if (exporting.value) return;
  exporting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { blob, filename } = await exportStorageOrders(buildFilterQuery());
    downloadBlob(blob, filename);
    notice.value = "当前筛选结果已开始导出。";
  } catch (err) {
    notice.value = err.message || "导出失败，请稍后重试。";
  } finally {
    exporting.value = false;
  }
}

async function handleExportSelected() {
  if (!selectedIds.value.length) {
    notice.value = "请先选择订单";
    return;
  }
  if (exporting.value) return;
  exporting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { blob, filename } = await exportStorageOrders({
      order_type: "all",
      row_ids: selectedIds.value.join(",")
    });
    downloadBlob(blob, filename);
    notice.value = `选中的 ${selectedIds.value.length} 条订单已开始导出。`;
  } catch (err) {
    notice.value = err.message || "导出选中订单失败，请稍后重试。";
  } finally {
    exporting.value = false;
  }
}

async function setSelectedOfflineRecorded(value) {
  if (!storageTrackingReady.value) {
    notice.value = storageTrackingMessage.value || "线下记录字段还没有在数据库上线，请先执行 Supabase 迁移后再操作。";
    return;
  }
  const ids = selectedBaseIds();
  if (!ids.length) {
    notice.value = "请先选择订单";
    return;
  }
  if (bulkSaving.value) return;
  bulkSaving.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await bulkSetStorageOrdersOfflineRecorded(ids, value);
    notice.value = value
      ? `已将 ${Number(result?.updated_count || 0)} 条订单标记为已记录。`
      : `已取消 ${Number(result?.updated_count || 0)} 条订单的已记录状态。`;
    selectedIds.value = [];
    await loadOrders(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "批量更新线下记录状态失败。";
  } finally {
    bulkSaving.value = false;
  }
}

async function toggleOfflineRecorded(order) {
  if (!storageTrackingReady.value) {
    notice.value = storageTrackingMessage.value || "线下记录字段还没有在数据库上线，请先执行 Supabase 迁移后再操作。";
    return;
  }
  const id = baseStorageOrderId(order);
  if (!id || togglingId.value) {
    notice.value = "未找到可更新的寄存订单 ID。";
    return;
  }
  togglingId.value = String(order.id || id);
  notice.value = "";
  error.value = "";
  try {
    const updated = await updateStorageOrder(id, { offline_recorded: !Boolean(order.offline_recorded) });
    const nextValue = Boolean(updated?.offline_recorded);
    notice.value = nextValue ? "已标记为已记录。" : "已取消已记录状态。";
    await loadOrders(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "线下记录状态保存失败。";
  } finally {
    togglingId.value = "";
  }
}

function openDeleteDialog(order) {
  if (!baseStorageOrderId(order)) {
    notice.value = `未找到可删除的寄存订单 ID：${displayValue(rowOrderNo(order))}`;
    return;
  }
  deleteCandidate.value = order;
  notice.value = "";
}

function closeDeleteDialog() {
  if (!deletingId.value) {
    deleteCandidate.value = null;
  }
}

async function confirmDelete() {
  const target = deleteCandidate.value;
  const id = baseStorageOrderId(target);
  if (!id || deletingId.value) return;
  deletingId.value = rowActionId(target);
  notice.value = "";
  error.value = "";
  try {
    await deleteStorageOrder(id);
    notice.value = `已删除订单 ${displayValue(rowOrderNo(target))}`;
    deleteCandidate.value = null;
    selectedIds.value = selectedIds.value.filter(item => String(item).split(":")[0] !== String(id));
    await loadOrders(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "删除失败。";
  } finally {
    deletingId.value = "";
  }
}

function openDetail(order) {
  const href = detailHref(order);
  if (!href) {
    notice.value = `未找到可打开的详情页：${displayValue(rowOrderNo(order))}`;
    return;
  }
  window.location.href = href;
}

onMounted(() => {
  loadOrders(1);
});
</script>

<template>
  <section class="storage-orders-view storage-all-orders-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage control center</p>
        <h2>全部订单</h2>
      </div>
    </div>

    <form class="admin-filter-panel storage-order-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field storage-order-filter-panel__search">
        <span>搜索</span>
        <input v-model="filters.search" type="search" placeholder="User ID / 订单编号 / 姓名 / 微信 / 电话 / 邮箱" />
      </label>
      <label class="field">
        <span>服务类型</span>
        <select v-model="filters.serviceType">
          <option value="">全部</option>
          <option value="box_order">买箱</option>
          <option value="storage_collection">取寄存</option>
          <option value="storage_return">送寄存</option>
        </select>
      </label>
      <label class="field">
        <span>线下记录状态</span>
        <select v-model="filters.offlineRecorded">
          <option value="">全部</option>
          <option value="false">未记录</option>
          <option value="true">已记录</option>
        </select>
      </label>
      <label class="field">
        <span>上次操作人</span>
        <select v-model="filters.lastOperatedBy">
          <option value="">全部</option>
          <option v-for="operator in operatorSelectOptions" :key="operator" :value="operator">{{ operator }}</option>
        </select>
      </label>
      <label class="field">
        <span>开始日期</span>
        <input v-model="filters.dateStart" type="date" />
      </label>
      <label class="field">
        <span>结束日期</span>
        <input v-model="filters.dateEnd" type="date" />
      </label>
      <label class="field">
        <span>排序方式</span>
        <select v-model="filters.sort">
          <option value="submitted_latest">提交时间：最近到最远</option>
          <option value="submitted_oldest">提交时间：最远到最近</option>
          <option value="service_date_nearest">服务日期：最近到最远</option>
          <option value="service_date_latest">服务日期：最远到最近</option>
          <option value="total_high">总费用：高到低</option>
          <option value="total_low">总费用：低到高</option>
        </select>
      </label>
      <label class="field field--compact">
        <span>每页数量</span>
        <select v-model.number="filters.pageSize" @change="loadOrders(1)">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
      <div class="filter-actions storage-order-filter-panel__actions">
        <button class="primary-button" type="submit">查询</button>
        <button class="secondary-button" type="reset">重置</button>
        <button class="secondary-button" type="button" :disabled="exporting" @click="handleExportFiltered">导出当前筛选结果</button>
      </div>
    </form>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <p v-if="!storageTrackingReady && storageTrackingMessage" class="inline-notice">
      {{ storageTrackingMessage }}
    </p>

    <LoadingState v-if="loading">正在加载寄存全部订单...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasOrders" title="暂无符合条件的寄存订单" description="请调整服务类型、日期或线下记录状态后重试。" />
    <template v-else>
      <AdminBulkActionBar
        :selected-count="selectedRows.length"
        :total-count="Number(pagination.total || 0)"
        :all-current-page-selected="allCurrentPageSelected"
        :saving="bulkSaving"
        :exporting="exporting"
        @toggle-current-page="toggleCurrentPageSelection"
        @mark-selected="() => setSelectedOfflineRecorded(true)"
        @unmark-selected="() => setSelectedOfflineRecorded(false)"
        @export-selected="handleExportSelected"
      />

      <AdminTable :columns="columns" :rows="orders" :row-class="storageRowClass">
        <template #cell-selected="{ row }">
          <input
            type="checkbox"
            :checked="selectedIds.includes(String(row.id))"
            :aria-label="`选择订单 ${displayValue(rowOrderNo(row))}`"
            @change="toggleRowSelection(row)"
          />
        </template>
        <template #cell-created_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
        </template>
        <template #cell-order_no="{ row }">
          <strong class="cell-truncate" :title="displayValue(rowOrderNo(row))">{{ displayValue(rowOrderNo(row)) }}</strong>
        </template>
        <template #cell-service_type="{ row }">
          <StatusBadge :tone="serviceTypeTone(row.storage_order_kind)">{{ serviceTypeLabel(row) }}</StatusBadge>
        </template>
        <template #cell-customer_name="{ row }">
          <strong class="cell-truncate" :title="displayValue(row.customer_name)">{{ displayValue(row.customer_name) }}</strong>
        </template>
        <template #cell-wechat_id="{ row }">
          <span class="cell-truncate" :title="displayValue(row.wechat_id)">{{ displayValue(row.wechat_id) }}</span>
        </template>
        <template #cell-phone="{ row }">
          <span class="cell-truncate" :title="displayValue(row.phone)">{{ displayValue(row.phone) }}</span>
        </template>
        <template #cell-service_date="{ row }">
          <span class="cell-truncate" :title="formatDate(rowServiceDate(row))">{{ formatDate(rowServiceDate(row)) }}</span>
        </template>
        <template #cell-service_time_slot="{ row }">
          <span class="cell-truncate" :title="displayValue(rowTimeSlot(row))">{{ displayValue(rowTimeSlot(row)) }}</span>
        </template>
        <template #cell-address_summary="{ row }">
          <span class="cell-stack cell-stack--wrap" :title="rowAddress(row)">
            <strong>{{ rowAddress(row) }}</strong>
          </span>
        </template>
        <template #cell-box_summary="{ row }">
          <span class="cell-stack cell-stack--wrap" :title="rowBoxSummary(row)">
            <strong v-for="line in rowBoxSummaryLines(row)" :key="line">{{ line }}</strong>
            <strong v-if="!rowBoxSummaryLines(row).length">--</strong>
          </span>
        </template>
        <template #cell-total_fee="{ row }">
          <span class="cell-truncate price-cell" :title="formatMoney(rowTotalFee(row))">{{ formatMoney(rowTotalFee(row)) }}</span>
        </template>
        <template #cell-offline_recorded="{ row }">
          <StatusBadge :tone="row.offline_recorded ? 'success' : 'neutral'">
            {{ row.offline_recorded ? "已记录" : "未记录" }}
          </StatusBadge>
        </template>
        <template #cell-last_operation="{ row }">
          <span class="cell-stack" :title="[row.last_operated_by, formatDateTime(row.last_operated_at)].filter(Boolean).join(' / ') || '--'">
            <strong class="cell-truncate">{{ displayValue(row.last_operated_by) }}</strong>
            <small class="cell-truncate">{{ formatDateTime(row.last_operated_at) }}</small>
          </span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <button
              class="table-action-button table-action-button--danger"
              type="button"
              :disabled="deletingId === rowActionId(row)"
              @click="openDeleteDialog(row)"
            >
              {{ deletingId === rowActionId(row) ? "删除中..." : "删除" }}
            </button>
            <button class="table-action-button" type="button" @click="openDetail(row)">查看详情</button>
            <button
              class="table-action-button"
              type="button"
              :disabled="!storageTrackingReady || togglingId === String(row.id)"
              @click="toggleOfflineRecorded(row)"
            >
              {{ row.offline_recorded ? "取消已记录" : "标记已记录" }}
            </button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>

    <ConfirmDialog
      :open="Boolean(deleteCandidate)"
      title="确认删除寄存订单"
      confirm-label="确认删除"
      :loading="Boolean(deletingId)"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    >
      <p class="confirm-dialog__warning">删除后不可恢复，请确认这是要删除的单条寄存订单。</p>
      <div class="readonly-field-grid">
        <article class="readonly-field">
          <span>订单编号</span>
          <strong>{{ displayValue(rowOrderNo(deleteCandidate || {})) }}</strong>
        </article>
        <article class="readonly-field">
          <span>服务类型</span>
          <strong>{{ deleteCandidate ? serviceTypeLabel(deleteCandidate) : "--" }}</strong>
        </article>
        <article class="readonly-field">
          <span>用户姓名</span>
          <strong>{{ displayValue(deleteCandidate?.customer_name) }}</strong>
        </article>
      </div>
    </ConfirmDialog>
  </section>
</template>
