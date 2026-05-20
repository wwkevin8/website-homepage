<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { bulkSetOrdersOfflineRecorded, fetchOrders } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import OrderFilters from "@/components/OrderFilters.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const router = useRouter();

const riskLabels = {
  overdue_unprocessed: "超过 24 小时未登记",
  no_operator: "无最近操作人",
  offline_unrecorded: "未登记",
  missing_fields: "关键字段缺失"
};

const registrationLabels = {
  true: "已登记",
  false: "未登记"
};

const sourceLabels = {
  transport_requests: "接送机订单",
  storage_orders: "寄存订单"
};

const columns = [
  { key: "select", label: "选择订单", width: "72px" },
  { key: "order_no", label: "订单编号", width: "14%" },
  { key: "service_type", label: "服务类型", width: "9%" },
  { key: "customer_name", label: "客户", width: "13%" },
  { key: "contact", label: "联系方式", width: "15%" },
  { key: "status", label: "状态", width: "10%" },
  { key: "service_date", label: "服务日期", width: "11%" },
  { key: "tracking", label: "最近登记人", width: "13%" },
  { key: "updated_at", label: "最近更新时间", width: "13%" },
  { key: "actions", label: "操作", width: "96px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  orderNo: "",
  customerName: "",
  phone: "",
  serviceType: "",
  registrationStatus: "",
  createdFrom: "",
  createdTo: "",
  risk: "",
  sourceTable: "",
  sort: "latest",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const orders = ref([]);
const pagination = ref({ page: 1, page_size: 10, total: 0, total_pages: 0 });
const loading = ref(false);
const savingBulk = ref(false);
const error = ref("");
const detailNotice = ref("");
const bulkNotice = ref("");
const activeRiskMeta = ref(null);
const selectedRowKeys = ref(new Set());
let syncingRoute = false;

const hasOrders = computed(() => orders.value.length > 0);
const activeRiskLabel = computed(() => {
  if (!filters.risk) return "";
  return activeRiskMeta.value?.label || riskLabels[filters.risk] || filters.risk;
});
const activeRegistrationLabel = computed(() => {
  if (filters.registrationStatus === "") return "";
  return registrationLabels[filters.registrationStatus] || "";
});
const activeSourceLabel = computed(() => sourceLabels[filters.sourceTable] || "");
const activeFilterText = computed(() => [activeRiskLabel.value, activeRegistrationLabel.value, activeSourceLabel.value].filter(Boolean).join(" / "));
const selectableOrders = computed(() => orders.value.filter(row => row?.source_table && row?.source_id));
const selectedRows = computed(() => orders.value.filter(row => selectedRowKeys.value.has(rowSelectionKey(row))));
const selectedCount = computed(() => selectedRows.value.length);
const allCurrentPageSelected = computed(() => {
  return selectableOrders.value.length > 0
    && selectableOrders.value.every(row => selectedRowKeys.value.has(rowSelectionKey(row)));
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
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
    return value;
  }
}

function serviceLabel(serviceType) {
  const labels = {
    pickup: "接机",
    airport_pickup: "接机",
    dropoff: "送机",
    airport_dropoff: "送机",
    carpool: "拼车",
    storage: "寄存"
  };
  return labels[serviceType] || displayValue(serviceType);
}

function sourceLabel(sourceTable) {
  return sourceLabels[sourceTable] || "接送机订单";
}

function registrationLabel(order) {
  return order?.offline_recorded ? "已登记" : "未登记";
}

function registrationTone(order) {
  return order?.offline_recorded ? "success" : "warning";
}

function serviceDate(order) {
  return displayValue(order.pickup_date || order.storage_start_date || order.storage_end_date);
}

function contactTitle(order) {
  return [order.phone, order.wechat_or_whatsapp].filter(Boolean).join(" / ") || "--";
}

function rowSelectionKey(row) {
  return `${row?.source_table || "order"}:${row?.source_id || row?.id || row?.order_id || row?.order_no}`;
}

function isRowSelected(row) {
  return selectedRowKeys.value.has(rowSelectionKey(row));
}

function toggleRow(row) {
  if (!row?.source_table || !row?.source_id) return;
  const next = new Set(selectedRowKeys.value);
  const key = rowSelectionKey(row);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  selectedRowKeys.value = next;
  bulkNotice.value = "";
}

function toggleCurrentPage() {
  const next = new Set(selectedRowKeys.value);
  if (allCurrentPageSelected.value) {
    selectableOrders.value.forEach(row => next.delete(rowSelectionKey(row)));
  } else {
    selectableOrders.value.forEach(row => next.add(rowSelectionKey(row)));
  }
  selectedRowKeys.value = next;
  bulkNotice.value = "";
}

function clearSelection() {
  selectedRowKeys.value = new Set();
}

function applyRouteQuery() {
  Object.assign(filters, defaultFilters);
  const query = route.query || {};
  if (typeof query.risk === "string" && riskLabels[query.risk]) filters.risk = query.risk;
  if (typeof query.source_table === "string" && sourceLabels[query.source_table]) filters.sourceTable = query.source_table;
  if (typeof query.offline_recorded === "string" && Object.prototype.hasOwnProperty.call(registrationLabels, query.offline_recorded)) {
    filters.registrationStatus = query.offline_recorded;
  }
  if (typeof query.order_no === "string") filters.orderNo = query.order_no;
  if (typeof query.customer_name === "string") filters.customerName = query.customer_name;
  if (typeof query.phone === "string") filters.phone = query.phone;
  if (typeof query.service_type === "string") filters.serviceType = query.service_type;
  if (typeof query.created_from === "string") filters.createdFrom = query.created_from;
  if (typeof query.created_to === "string") filters.createdTo = query.created_to;
  if (typeof query.sort === "string") filters.sort = query.sort;
  if (query.page_size) filters.pageSize = Number(query.page_size) || defaultFilters.pageSize;
}

function buildQuery(page) {
  return {
    order_no: filters.orderNo.trim(),
    customer_name: filters.customerName.trim(),
    phone: filters.phone.trim(),
    service_type: filters.serviceType,
    created_from: filters.createdFrom,
    created_to: filters.createdTo,
    risk: filters.risk,
    source_table: filters.sourceTable,
    offline_recorded: filters.registrationStatus,
    sort: filters.sort,
    page_size: filters.pageSize,
    page
  };
}

function cleanQuery(query) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function syncFiltersToRoute(page = 1) {
  const query = cleanQuery(buildQuery(page));
  syncingRoute = true;
  router.replace({ query }).finally(() => {
    syncingRoute = false;
  });
}

async function loadOrders(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  detailNotice.value = "";
  bulkNotice.value = "";
  activeRiskMeta.value = null;
  clearSelection();
  try {
    const payload = await fetchOrders(buildQuery(page));
    orders.value = Array.isArray(payload?.items) ? payload.items : [];
    activeRiskMeta.value = payload?.risk || null;
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: orders.value.length,
      total_pages: orders.value.length ? 1 : 0
    };
  } catch (err) {
    orders.value = [];
    error.value = err.message || "订单列表加载失败";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  syncFiltersToRoute(1);
  loadOrders(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  syncFiltersToRoute(1);
  loadOrders(1);
}

function clearRiskFilter() {
  filters.risk = "";
  filters.sourceTable = "";
  filters.registrationStatus = "";
  syncFiltersToRoute(1);
  loadOrders(1);
}

function handlePageChange(page) {
  syncFiltersToRoute(page);
  loadOrders(page);
}

function orderDetailHref(order) {
  const sourceId = order?.source_id || order?.storage_order_id || order?.transport_request_id;
  if (order?.source_table === "storage_orders" && sourceId) {
    return `/admin-vue/storage/${encodeURIComponent(sourceId)}?return_to=${encodeURIComponent("/admin-vue/orders")}`;
  }
  if (order?.source_table === "transport_requests" && sourceId) {
    return `/admin-vue/transport/requests/${encodeURIComponent(sourceId)}?return_to=${encodeURIComponent("/admin-vue/orders")}`;
  }
  const id = order?.id || order?.order_id;
  return id
    ? `/admin-vue/orders/${encodeURIComponent(id)}?return_to=${encodeURIComponent("/admin-vue/orders")}`
    : "";
}

function viewOrder(order) {
  const href = orderDetailHref(order);
  if (href) {
    window.location.href = href;
    return;
  }
  detailNotice.value = `暂未找到对应订单详情：${displayValue(order.order_no || order.id)}`;
}

function csvEscape(value) {
  const text = displayValue(value).replaceAll("\"", "\"\"");
  return `"${text}"`;
}

function exportSelectedRows() {
  if (!selectedRows.value.length) {
    bulkNotice.value = "请先选择需要导出的订单";
    return;
  }
  const headers = ["订单编号", "服务类型", "客户", "电话", "微信/WhatsApp", "登记状态", "服务日期", "最近登记人", "最近登记时间", "最近更新时间"];
  const rows = selectedRows.value.map(row => [
    row.order_no,
    serviceLabel(row.service_type),
    row.customer_name,
    row.phone,
    row.wechat_or_whatsapp,
    registrationLabel(row),
    serviceDate(row),
    row.last_operated_by || "",
    formatDateTime(row.last_operated_at),
    formatDateTime(row.updated_at)
  ]);
  const csv = `\ufeff${[headers, ...rows].map(line => line.map(csvEscape).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `NGN订单导出-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  bulkNotice.value = `已导出 ${selectedRows.value.length} 条订单`;
}

async function registerSelectedRows() {
  if (!selectedRows.value.length) {
    bulkNotice.value = "请先选择需要登记的订单";
    return;
  }
  savingBulk.value = true;
  error.value = "";
  bulkNotice.value = "";
  try {
    const items = selectedRows.value.map(row => ({
      source_table: row.source_table,
      source_id: row.source_id
    }));
    const result = await bulkSetOrdersOfflineRecorded(items, true);
    const updatedCount = Number(result?.updated_count || 0);
    clearSelection();
    await loadOrders(pagination.value.page || 1);
    bulkNotice.value = `已一键登记 ${updatedCount} 条订单`;
  } catch (err) {
    error.value = err.message || "一键登记失败，请稍后重试";
  } finally {
    savingBulk.value = false;
  }
}

onMounted(() => {
  applyRouteQuery();
  loadOrders(Number(route.query.page) || 1);
});

watch(
  () => route.query,
  () => {
    if (syncingRoute) return;
    applyRouteQuery();
    loadOrders(Number(route.query.page) || 1);
  }
);
</script>

<template>
  <section class="orders-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">订单中心</p>
        <h2>订单中心</h2>
      </div>
    </div>

    <div v-if="activeFilterText" class="active-filter-banner">
      <span>当前筛选：{{ activeFilterText }}</span>
      <small v-if="activeRiskMeta?.helper">{{ activeRiskMeta.helper }}</small>
      <button type="button" class="secondary-button" @click="clearRiskFilter">清除筛选</button>
    </div>

    <OrderFilters v-model="filters" @submit="submitFilters" @reset="resetFilters" />

    <p v-if="detailNotice" class="inline-notice">{{ detailNotice }}</p>
    <p v-if="bulkNotice" class="inline-notice">{{ bulkNotice }}</p>

    <LoadingState v-if="loading">正在加载订单列表...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState
      v-else-if="!hasOrders"
      title="暂无符合条件的订单"
      :description="activeFilterText ? `当前筛选：${activeFilterText}` : '请调整搜索、筛选条件或时间范围后重试。'"
    />
    <template v-else>
      <div class="orders-bulk-toolbar">
        <div class="orders-bulk-toolbar__summary">
          <strong>已选择 {{ selectedCount }} 条</strong>
          <span>当前筛选共 {{ pagination.total || orders.length }} 条订单</span>
        </div>
        <div class="orders-bulk-toolbar__actions">
          <button type="button" class="secondary-button" :disabled="!selectableOrders.length" @click="toggleCurrentPage">
            {{ allCurrentPageSelected ? "取消全选" : "全选当前页" }}
          </button>
          <button type="button" class="secondary-button" :disabled="!selectedCount" @click="exportSelectedRows">导出选中</button>
          <button type="button" class="primary-button" :disabled="!selectedCount || savingBulk" @click="registerSelectedRows">
            {{ savingBulk ? "登记中..." : "一键登记" }}
          </button>
        </div>
      </div>

      <AdminTable :columns="columns" :rows="orders" row-key="selection_key">
        <template #cell-select="{ row }">
          <input
            class="order-select-checkbox"
            type="checkbox"
            :checked="isRowSelected(row)"
            :disabled="!row.source_table || !row.source_id"
            aria-label="选择订单"
            @change="toggleRow(row)"
          />
        </template>
        <template #cell-order_no="{ row }">
          <strong class="cell-truncate" :title="displayValue(row.order_no)">
            {{ displayValue(row.order_no) }}
          </strong>
        </template>
        <template #cell-service_type="{ row }">
          <span class="cell-truncate" :title="serviceLabel(row.service_type)">
            {{ serviceLabel(row.service_type) }}
          </span>
        </template>
        <template #cell-customer_name="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate" :title="displayValue(row.customer_name)">
              {{ displayValue(row.customer_name) }}
            </strong>
            <small :title="sourceLabel(row.source_table)">{{ sourceLabel(row.source_table) }}</small>
          </span>
        </template>
        <template #cell-contact="{ row }">
          <span class="cell-stack" :title="contactTitle(row)">
            <span class="cell-truncate">{{ displayValue(row.phone) }}</span>
            <small class="cell-truncate">{{ displayValue(row.wechat_or_whatsapp) }}</small>
          </span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="registrationTone(row)">
            {{ registrationLabel(row) }}
          </StatusBadge>
        </template>
        <template #cell-service_date="{ row }">
          <span class="cell-truncate" :title="serviceDate(row)">{{ serviceDate(row) }}</span>
        </template>
        <template #cell-tracking="{ row }">
          <span class="cell-stack">
            <strong>{{ row.last_operated_by || "暂无登记人" }}</strong>
            <small>{{ formatDateTime(row.last_operated_at) }}</small>
          </span>
        </template>
        <template #cell-updated_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.updated_at)">
            {{ formatDateTime(row.updated_at) }}
          </span>
        </template>
        <template #cell-actions="{ row }">
          <button class="table-action-button" type="button" @click="viewOrder(row)">查看详情</button>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
