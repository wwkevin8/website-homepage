<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { fetchStorageOrders } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();

const routeConfigs = {
  box_order: {
    title: "买箱订单",
    legacyHref: "/admin-storage.html?order_type=box_order",
    emptyDescription: "当前筛选条件下没有买箱订单。"
  },
  storage_collection: {
    title: "取寄存订单",
    legacyHref: "/admin-storage.html?order_type=storage_collection",
    emptyDescription: "当前筛选条件下没有取寄存订单。"
  },
  storage_return: {
    title: "送寄存订单",
    legacyHref: "/admin-storage.html?order_type=storage_return",
    emptyDescription: "当前筛选条件下没有送寄存订单。"
  }
};

const columns = [
  { key: "created_at", label: "提交时间", width: "10%" },
  { key: "order_no", label: "订单编号", width: "11%" },
  { key: "service_type", label: "服务类型", width: "9%" },
  { key: "customer_name", label: "姓名", width: "9%" },
  { key: "wechat_id", label: "微信", width: "9%" },
  { key: "phone", label: "电话", width: "10%" },
  { key: "service_date", label: "服务日期", width: "9%" },
  { key: "service_time_slot", label: "时间段", width: "9%" },
  { key: "room_or_building", label: "公寓名", width: "10%" },
  { key: "postcode", label: "邮编", width: "8%" },
  { key: "actions", label: "操作", width: "150px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  search: "",
  status: "",
  dateScope: "active",
  dateStart: "",
  dateEnd: "",
  sort: "service_date_asc",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const orders = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const notice = ref("");

const orderType = computed(() => String(route.meta.orderType || "storage_collection"));
const pageConfig = computed(() => routeConfigs[orderType.value] || routeConfigs.storage_collection);
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
    return displayValue(value);
  }
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

function serviceTypeLabel(order) {
  if (orderType.value === "box_order") {
    return "买箱订单";
  }
  if (orderType.value === "storage_collection") {
    return "取寄存订单";
  }
  if (orderType.value === "storage_return") {
    return "送寄存订单";
  }
  return order.service_label || order.order_type || "--";
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

function rowOrderNo(order) {
  if (orderType.value === "box_order") {
    return order.box_order_no || order.parent_order_no || order.order_no;
  }
  return order.storage_pickup_order_no || order.order_no || order.parent_order_no;
}

function rowServiceDate(order) {
  if (orderType.value === "box_order") {
    return order.box_delivery_date || order.service_date;
  }
  if (orderType.value === "storage_return") {
    return order.storage_end_date || order.expected_storage_end_date || order.service_date;
  }
  return order.storage_intake_date || order.storage_start_date || order.service_date;
}

function rowTimeSlot(order) {
  if (orderType.value === "box_order") {
    return order.box_delivery_time_slot || order.service_time_slot || order.service_time;
  }
  return order.service_time_slot || order.service_time;
}

function detailHref(order) {
  if (!order.id) {
    return "";
  }
  const returnTo = `/admin-vue/storage/${route.path.split("/").pop() || ""}`;
  return `/admin-storage-detail.html?id=${encodeURIComponent(order.id)}&return_to=${encodeURIComponent(returnTo)}`;
}

function buildQuery(page) {
  return {
    page,
    page_size: filters.pageSize,
    search: filters.search.trim(),
    order_type: orderType.value,
    status: filters.status,
    date_scope: filters.dateScope,
    date_start: filters.dateStart,
    date_end: filters.dateEnd,
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
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: orders.value.length,
      total_pages: orders.value.length ? 1 : 0
    };
  } catch (err) {
    orders.value = [];
    error.value = err.message || "寄存订单加载失败";
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

function showPlaceholder(action, order) {
  notice.value = `${action}将在后续阶段实现：${displayValue(rowOrderNo(order) || order.id)}`;
}

watch(
  () => route.name,
  () => {
    Object.assign(filters, defaultFilters);
    pagination.value = { page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 };
    loadOrders(1);
  }
);

onMounted(() => {
  loadOrders(1);
});
</script>

<template>
  <section class="storage-orders-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage orders list migration</p>
        <h2>{{ pageConfig.title }}</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" @click="showPlaceholder('导出 Excel', { order_no: pageConfig.title })">
          导出 Excel
        </button>
        <a class="secondary-button" :href="pageConfig.legacyHref">打开旧寄存后台</a>
      </div>
    </div>

    <form class="admin-filter-panel storage-order-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field storage-order-filter-panel__search">
        <span>搜索</span>
        <input v-model="filters.search" type="search" placeholder="User ID / 订单编号 / 姓名 / 邮箱 / 电话" />
      </label>
      <label class="field">
        <span>订单状态</span>
        <select v-model="filters.status">
          <option value="">全部状态</option>
          <option value="pending_confirmation">待确认</option>
          <option value="confirmed">已确认</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      <label class="field">
        <span>单据范围</span>
        <select v-model="filters.dateScope">
          <option value="active">有效单</option>
          <option value="expired">过期单</option>
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
          <option value="service_date_asc">服务日期最近到最远</option>
          <option value="created_at_desc">提交时间最近到最远</option>
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

    <LoadingState v-if="loading">正在加载{{ pageConfig.title }}...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasOrders" title="暂无寄存订单" :description="pageConfig.emptyDescription" />
    <template v-else>
      <AdminTable :columns="columns" :rows="orders">
        <template #cell-created_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
        </template>
        <template #cell-order_no="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate" :title="displayValue(rowOrderNo(row))">{{ displayValue(rowOrderNo(row)) }}</strong>
            <small v-if="row.status">
              <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
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
        <template #cell-room_or_building="{ row }">
          <span class="cell-truncate" :title="displayValue(row.room_or_building)">{{ displayValue(row.room_or_building) }}</span>
        </template>
        <template #cell-postcode="{ row }">
          <span class="cell-truncate" :title="displayValue(row.postcode)">{{ displayValue(row.postcode) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <a v-if="detailHref(row)" class="table-action-button" :href="detailHref(row)">查看详情</a>
            <button v-else class="table-action-button" type="button" @click="showPlaceholder('查看详情', row)">查看详情</button>
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除', row)">删除</button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
