<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchOrders } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import OrderFilters from "@/components/OrderFilters.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const columns = [
  { key: "order_no", label: "订单编号", width: "14%" },
  { key: "service_type", label: "服务类型", width: "9%" },
  { key: "customer_name", label: "客户", width: "13%" },
  { key: "contact", label: "联系方式", width: "15%" },
  { key: "status", label: "状态", width: "10%" },
  { key: "service_date", label: "服务日期", width: "11%" },
  { key: "updated_at", label: "最近更新时间", width: "13%" },
  { key: "archived", label: "归档状态", width: "8%" },
  { key: "actions", label: "操作", width: "96px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  orderNo: "",
  customerName: "",
  phone: "",
  serviceType: "",
  status: "",
  createdFrom: "",
  createdTo: "",
  sort: "latest",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const orders = ref([]);
const pagination = ref({ page: 1, page_size: 10, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const detailNotice = ref("");

const hasOrders = computed(() => orders.value.length > 0);

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
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
    return value;
  }
}

function serviceLabel(serviceType) {
  const labels = {
    pickup: "接机",
    dropoff: "送机",
    storage: "寄存"
  };
  return labels[serviceType] || displayValue(serviceType);
}

function sourceLabel(sourceTable) {
  return sourceTable === "storage_orders" ? "寄存订单" : "接送机订单";
}

function statusLabel(status) {
  const labels = {
    pending_confirmation: "待确认",
    confirmed: "已确认",
    cancelled: "已取消",
    draft: "草稿",
    open: "进行中",
    grouped: "已拼单",
    closed: "已完成"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "cancelled") {
    return "danger";
  }
  if (status === "confirmed" || status === "closed") {
    return "success";
  }
  if (status === "grouped") {
    return "warning";
  }
  return "neutral";
}

function serviceDate(order) {
  return displayValue(order.pickup_date || order.storage_start_date);
}

function contactTitle(order) {
  return [order.phone, order.wechat_or_whatsapp].filter(Boolean).join(" / ") || "--";
}

function buildQuery(page) {
  return {
    archived: "active",
    order_no: filters.orderNo.trim(),
    customer_name: filters.customerName.trim(),
    phone: filters.phone.trim(),
    service_type: filters.serviceType,
    status: filters.status,
    created_from: filters.createdFrom,
    created_to: filters.createdTo,
    sort: filters.sort,
    page_size: filters.pageSize,
    page
  };
}

async function loadOrders(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  detailNotice.value = "";
  try {
    const payload = await fetchOrders(buildQuery(page));
    orders.value = Array.isArray(payload?.items) ? payload.items : [];
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
  loadOrders(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  loadOrders(1);
}

function handlePageChange(page) {
  loadOrders(page);
}

function viewOrder(order) {
  detailNotice.value = `详情功能将在后续阶段实现：${displayValue(order.order_no || order.id)}`;
}

onMounted(() => {
  loadOrders(1);
});
</script>

<template>
  <section class="orders-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 3 list migration</p>
        <h2>订单中心</h2>
      </div>
      <a class="secondary-button" href="/admin-orders.html">打开旧订单后台</a>
    </div>

    <OrderFilters v-model="filters" @submit="submitFilters" @reset="resetFilters" />

    <p v-if="detailNotice" class="inline-notice">{{ detailNotice }}</p>

    <LoadingState v-if="loading">正在加载订单列表...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasOrders" title="暂无符合条件的订单" description="请调整搜索、筛选条件或时间范围后重试。" />
    <template v-else>
      <AdminTable :columns="columns" :rows="orders">
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
          <StatusBadge :tone="statusTone(row.status)">
            {{ statusLabel(row.status) }}
          </StatusBadge>
        </template>
        <template #cell-service_date="{ row }">
          <span class="cell-truncate" :title="serviceDate(row)">{{ serviceDate(row) }}</span>
        </template>
        <template #cell-updated_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.updated_at)">
            {{ formatDateTime(row.updated_at) }}
          </span>
        </template>
        <template #cell-archived="{ row }">
          <StatusBadge :tone="row.archived ? 'neutral' : 'success'">
            {{ row.archived ? "已归档" : "活跃" }}
          </StatusBadge>
        </template>
        <template #cell-actions="{ row }">
          <button class="table-action-button" type="button" @click="viewOrder(row)">查看详情</button>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
