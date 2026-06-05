<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { deleteStorageOrder, exportStorageOrders, fetchStorageOrders, updateStorageOrder } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();

const routeConfigs = {
  box_order: {
    title: "买箱订单",
    emptyDescription: "当前筛选条件下没有买箱订单。"
  },
  storage_collection: {
    title: "取寄存订单",
    emptyDescription: "当前筛选条件下没有取寄存订单。"
  },
  storage_return: {
    title: "送寄存订单",
    emptyDescription: "当前筛选条件下没有送寄存订单。"
  }
};

const commonColumns = [
  { key: "created_at", label: "提交时间", width: "10%" },
  { key: "order_no", label: "订单编号", width: "11%" },
  { key: "service_type", label: "服务类型", width: "9%" },
  { key: "customer_name", label: "姓名", width: "9%" },
  { key: "wechat_id", label: "微信", width: "9%" },
  { key: "phone", label: "电话", width: "10%" },
  { key: "service_date", label: "服务日期", width: "9%" },
  { key: "service_time_slot", label: "时间段", width: "9%" },
  { key: "full_address", label: "地址", width: "15%" },
  { key: "expected_price", label: "预期价格", width: "8%" },
  { key: "actions", label: "操作", width: "150px", className: "is-actions", sticky: "end" }
];

const boxOrderColumns = [
  { key: "created_at", label: "提交时间", width: "9%" },
  { key: "order_no", label: "订单编号", width: "10%" },
  { key: "customer_name", label: "姓名", width: "7%" },
  { key: "wechat_id", label: "微信", width: "8%" },
  { key: "phone", label: "电话", width: "9%" },
  { key: "service_date", label: "送箱日期", width: "8%" },
  { key: "service_time_slot", label: "时间段", width: "8%" },
  { key: "box_types", label: "箱型", width: "9%" },
  { key: "full_address", label: "地址 / 公寓 / 邮编", width: "22%" },
  { key: "box_fee", label: "箱子费用", width: "8%" },
  { key: "status", label: "线下记录", width: "7%" },
  { key: "actions", label: "操作", width: "150px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  search: "",
  offlineRecorded: "",
  dateScope: "active",
  dateStart: "",
  dateEnd: "",
  sort: "service_date_asc",
  pageSize: 10
};

const filters = reactive({
  ...defaultFilters,
  search: String(route.query.search || "")
});
const orders = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const notice = ref("");
const exporting = ref(false);
const togglingId = ref("");
const deletingId = ref("");
const deleteCandidate = ref(null);
const storageTrackingReady = ref(true);
const storageTrackingMessage = ref("");

const orderType = computed(() => String(route.meta.orderType || "storage_collection"));
const pageConfig = computed(() => routeConfigs[orderType.value] || routeConfigs.storage_collection);
const hasOrders = computed(() => orders.value.length > 0);
const tableColumns = computed(() => {
  const source = orderType.value === "box_order" ? boxOrderColumns : commonColumns;
  return source.map(column => column.key === "status" ? { ...column, label: "线下记录" } : column);
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "--";
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : displayValue(value);
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

function formatDate(value) {
  const text = String(value || "").slice(0, 10);
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

function serviceTypeLabel(order) {
  if (orderType.value === "box_order") return "买箱订单";
  if (orderType.value === "storage_collection") return "取寄存订单";
  if (orderType.value === "storage_return") return "送寄存订单";
  return order.service_label || order.order_type || "--";
}

function offlineRecordedLabel(order) {
  return order?.offline_recorded ? "已记录" : "未记录";
}

function offlineRecordedTone(order) {
  return order?.offline_recorded ? "success" : "neutral";
}

function isMembershipOrder(order) {
  return Boolean(order?.membership_benefit_claim_id) || Number(order?.membership_discount_amount || 0) > 0;
}

function storageRowClass(order) {
  return isMembershipOrder(order) ? "is-member-order" : "";
}

function rowOrderNo(order) {
  if (orderType.value === "box_order") return order.box_order_no || order.parent_order_no || order.order_no;
  if (orderType.value === "storage_collection") return order.storage_pickup_order_no || order.order_no || order.parent_order_no;
  return order.order_no || order.storage_return_order_no || order.related_order_no || order.parent_order_no;
}

function rowServiceDate(order) {
  if (orderType.value === "box_order") return order.box_delivery_date || order.service_date;
  if (orderType.value === "storage_return") return order.storage_end_date || order.expected_storage_end_date || order.service_date;
  return order.storage_start_date || order.storage_intake_date || order.service_date;
}

function rowTimeSlot(order) {
  if (orderType.value === "box_order") return order.box_delivery_time_slot || order.service_time_slot || order.service_time;
  return order.service_time_slot || order.service_time;
}

function cleanAddressPart(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text && text !== "--" ? text : "";
}

function normalizeAddressKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function splitAddressText(value) {
  return String(value || "")
    .split("/")
    .map(cleanAddressPart)
    .filter(Boolean);
}

function pushAddressPart(parts, value) {
  const text = cleanAddressPart(value);
  const key = normalizeAddressKey(text);
  if (!key) return;

  const duplicateIndex = parts.findIndex(part => {
    const partKey = normalizeAddressKey(part);
    return partKey === key || partKey.includes(key) || key.includes(partKey);
  });

  if (duplicateIndex === -1) {
    parts.push(text);
    return;
  }

  const existingKey = normalizeAddressKey(parts[duplicateIndex]);
  if (key.length > existingKey.length && key.includes(existingKey)) {
    parts.splice(duplicateIndex, 1, text);
  }
}

function rowFullAddress(order) {
  const parts = [];
  splitAddressText(order.room_or_building).forEach(part => pushAddressPart(parts, part));
  splitAddressText(order.address_full).forEach(part => pushAddressPart(parts, part));
  splitAddressText(order.postcode).forEach(part => pushAddressPart(parts, part));
  return parts.join(" / ") || "--";
}

function rowExpectedPrice(order) {
  return order.estimated_total_price
    ?? order.estimate_summary_json?.estimatedTotalPrice
    ?? order.estimate_summary_json?.estimated_total_price
    ?? order.estimate_summary_json?.finalTotal
    ?? order.estimate_summary_json?.grandTotal
    ?? order.estimate_summary_json?.total
    ?? order.final_price;
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
  const raw = entry?.label || entry?.boxLabel || entry?.box_label || entry?.name || entry?.boxName || entry?.box_name || entry?.boxType || entry?.box_type || entry?.type;
  const text = String(raw || "").trim();
  if (!text) return "箱型";
  return /^\d+$/.test(text) ? `${text}号箱` : text;
}

function boxQuantityFromEntry(entry) {
  return positiveQuantity(entry?.quantity ?? entry?.purchaseQty ?? entry?.purchase_quantity ?? entry?.purchaseQuantity ?? entry?.count ?? entry?.qty);
}

function boxSubtotalFromEntry(entry) {
  return entry?.subtotal ?? entry?.purchase ?? entry?.purchaseTotal ?? entry?.purchase_total ?? entry?.boxFee ?? entry?.box_fee ?? entry?.total;
}

function purchasedBoxItems(order) {
  if (Array.isArray(order.purchased_boxes) && order.purchased_boxes.length) {
    return order.purchased_boxes
      .map(entry => {
        const item = asObject(entry);
        return { ...item, quantity: boxQuantityFromEntry(item), subtotal: boxSubtotalFromEntry(item) };
      })
      .filter(entry => entry.quantity > 0);
  }

  const summaryItems = Array.isArray(estimateSummary(order).items) ? estimateSummary(order).items : [];
  return summaryItems
    .map(entry => {
      const item = asObject(entry);
      return {
        ...item,
        quantity: positiveQuantity(item.purchaseQty ?? item.purchase_quantity ?? item.purchaseQuantity),
        subtotal: boxSubtotalFromEntry(item)
      };
    })
    .filter(entry => entry.quantity > 0);
}

function rowBoxTypeLines(order) {
  return purchasedBoxItems(order).map(entry => `${normalizeBoxLabel(entry)} × ${boxQuantityFromEntry(entry)}`);
}

function rowBoxTypes(order) {
  const lines = rowBoxTypeLines(order);
  return lines.length ? lines.join("\n") : "--";
}

function rowBoxFee(order) {
  const summary = estimateSummary(order);
  const direct = order.purchase_total ?? order.purchaseTotal ?? order.box_fee ?? order.boxFee ?? summary.purchaseTotal ?? summary.purchase_total ?? summary.boxFee ?? summary.box_fee;
  if (direct !== null && direct !== undefined && direct !== "") return direct;
  return purchasedBoxItems(order).reduce((sum, entry) => sum + positiveQuantity(boxSubtotalFromEntry(entry)), 0) || "";
}

function detailHref(order) {
  const id = order.id || order.storage_order_id || order.legacy_id || order.order_id;
  if (!id) return "";
  const returnTo = `/admin/storage/${route.path.split("/").pop() || ""}`;
  const searchParams = new URLSearchParams({ return_to: returnTo, order_type: orderType.value });
  const detailBase = orderType.value === "box_order"
    ? "/admin/storage/box-orders"
    : "/admin/storage/storage-orders";
  return `${detailBase}/${encodeURIComponent(id)}?${searchParams.toString()}`;
}

function buildQuery(page) {
  const search = filters.search.trim();
  const searchAcrossAllDates = Boolean(search);
  return {
    page,
    page_size: filters.pageSize,
    search,
    order_type: orderType.value,
    offline_recorded: filters.offlineRecorded,
    date_scope: searchAcrossAllDates ? "all" : filters.dateScope,
    date_start: searchAcrossAllDates ? "" : filters.dateStart,
    date_end: searchAcrossAllDates ? "" : filters.dateEnd,
    sort: filters.sort
  };
}

async function loadOrders(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchStorageOrders(buildQuery(page));
    orders.value = Array.isArray(payload?.items) ? payload.items : [];
    storageTrackingReady.value = payload?.storage_tracking_ready !== false;
    storageTrackingMessage.value = payload?.storage_tracking_message || "";
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: orders.value.length,
      total_pages: orders.value.length ? 1 : 0
    };
  } catch (err) {
    orders.value = [];
    error.value = err.message || "寄存订单加载失败。";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadOrders(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  loadOrders(1);
}

function handlePageChange(page) {
  loadOrders(page);
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || `${orderType.value}-storage-orders.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function handleExport() {
  if (exporting.value) return;
  exporting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { blob, filename } = await exportStorageOrders(buildQuery(1));
    downloadBlob(blob, filename);
    notice.value = `${pageConfig.value.title}已开始导出。`;
  } catch (err) {
    notice.value = err.message || "导出 Excel 失败。";
  } finally {
    exporting.value = false;
  }
}

async function toggleOfflineRecorded(order) {
  if (!storageTrackingReady.value) {
    notice.value = storageTrackingMessage.value || "线下记录字段还没有在数据库上线，请先执行 Supabase 迁移后再操作。";
    return;
  }
  const id = order?.id || order?.storage_order_id || order?.legacy_id || order?.order_id;
  if (!id || togglingId.value) {
    notice.value = "未找到可更新的寄存订单 ID。";
    return;
  }
  togglingId.value = String(id);
  notice.value = "";
  error.value = "";
  try {
    const updated = await updateStorageOrder(id, { offline_recorded: !Boolean(order.offline_recorded) });
    notice.value = Boolean(updated?.offline_recorded) ? "已标记为已记录。" : "已取消已记录状态。";
    await loadOrders(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "线下记录状态保存失败。";
  } finally {
    togglingId.value = "";
  }
}

function openDeleteDialog(order) {
  if (!order?.id) {
    notice.value = `未找到可删除的订单 ID：${displayValue(rowOrderNo(order))}`;
    return;
  }
  deleteCandidate.value = order;
  notice.value = "";
}

function closeDeleteDialog() {
  if (!deletingId.value) deleteCandidate.value = null;
}

async function confirmDelete() {
  const target = deleteCandidate.value;
  if (!target?.id || deletingId.value) return;
  deletingId.value = String(target.id);
  notice.value = "";
  error.value = "";
  try {
    await deleteStorageOrder(target.id);
    notice.value = `已删除订单 ${displayValue(rowOrderNo(target))}`;
    deleteCandidate.value = null;
    await loadOrders(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "删除失败。";
  } finally {
    deletingId.value = "";
  }
}

watch(
  () => route.name,
  () => {
    Object.assign(filters, { ...defaultFilters, search: String(route.query.search || "") });
    pagination.value = { page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 };
    loadOrders(1);
  }
);

watch(
  () => route.query.search,
  value => {
    const nextSearch = String(value || "");
    if (nextSearch === filters.search) return;
    filters.search = nextSearch;
    loadOrders(1);
  }
);

onMounted(() => {
  loadOrders(1);
});
</script>

<template>
  <section class="storage-orders-view" :class="{ 'storage-orders-view--box': orderType === 'box_order' }">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage orders</p>
        <h2>{{ pageConfig.title }}</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" :disabled="exporting" @click="handleExport">
          {{ exporting ? "导出中..." : "导出 Excel" }}
        </button>
      </div>
    </div>

    <form class="admin-filter-panel storage-order-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field storage-order-filter-panel__search">
        <span>搜索</span>
        <input v-model="filters.search" type="search" placeholder="User ID / 订单编号 / 姓名 / 微信 / 电话 / 邮箱" />
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
        <span>日期范围</span>
        <select v-model="filters.dateScope">
          <option value="active">当前及未来</option>
          <option value="expired">已过期</option>
          <option value="all">全部</option>
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
          <option value="service_date_asc">服务日期：最近到最远</option>
          <option value="created_at_desc">提交时间：最近到最远</option>
        </select>
      </label>
      <label class="field field--compact">
        <span>每页</span>
        <select v-model.number="filters.pageSize" @change="loadOrders(1)">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
      <div class="filter-actions storage-order-filter-panel__actions">
        <button class="primary-button" type="submit">查询</button>
        <button class="secondary-button" type="reset">重置</button>
      </div>
    </form>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <p v-if="!storageTrackingReady && storageTrackingMessage" class="inline-notice">
      {{ storageTrackingMessage }}
    </p>

    <LoadingState v-if="loading">正在加载 {{ pageConfig.title }}...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasOrders" title="暂无符合条件的订单" :description="pageConfig.emptyDescription" />
    <template v-else>
      <AdminTable :columns="tableColumns" :rows="orders" :row-class="storageRowClass">
        <template #cell-created_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
        </template>
        <template #cell-order_no="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate" :title="displayValue(rowOrderNo(row))">{{ displayValue(rowOrderNo(row)) }}</strong>
            <small>
              <StatusBadge :tone="offlineRecordedTone(row)">{{ offlineRecordedLabel(row) }}</StatusBadge>
            </small>
          </span>
        </template>
        <template #cell-service_type="{ row }">
          <span class="cell-truncate" :title="serviceTypeLabel(row)">{{ serviceTypeLabel(row) }}</span>
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
        <template #cell-full_address="{ row }">
          <span class="cell-stack cell-stack--wrap" :title="rowFullAddress(row)">
            <strong>{{ rowFullAddress(row) }}</strong>
          </span>
        </template>
        <template #cell-expected_price="{ row }">
          <span class="cell-truncate price-cell" :title="formatMoney(rowExpectedPrice(row))">{{ formatMoney(rowExpectedPrice(row)) }}</span>
        </template>
        <template #cell-box_types="{ row }">
          <span class="cell-stack cell-stack--wrap" :title="rowBoxTypes(row)">
            <strong v-for="line in rowBoxTypeLines(row)" :key="line">{{ line }}</strong>
            <strong v-if="!rowBoxTypeLines(row).length">--</strong>
          </span>
        </template>
        <template #cell-box_fee="{ row }">
          <span class="cell-truncate price-cell" :title="formatMoney(rowBoxFee(row))">{{ formatMoney(rowBoxFee(row)) }}</span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="offlineRecordedTone(row)">{{ offlineRecordedLabel(row) }}</StatusBadge>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <a v-if="detailHref(row)" class="table-action-button" :href="detailHref(row)">查看详情</a>
            <button
              class="table-action-button"
              type="button"
              :disabled="!storageTrackingReady || togglingId === String(row.id)"
              @click="toggleOfflineRecorded(row)"
            >
              {{ row.offline_recorded ? "取消已记录" : "标记已记录" }}
            </button>
            <button class="table-action-button table-action-button--danger" type="button" :disabled="deletingId === String(row.id)" @click="openDeleteDialog(row)">
              {{ deletingId === String(row.id) ? "删除中..." : "删除" }}
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
