<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchTransportRequests } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import TransportRequestFilters from "@/components/TransportRequestFilters.vue";

const columns = [
  { key: "created_at", label: "提交时间", width: "9%" },
  { key: "order_no", label: "Order No", width: "10%" },
  { key: "student", label: "学生", width: "12%" },
  { key: "wechat", label: "微信号", width: "9%" },
  { key: "service_type", label: "服务", width: "7%" },
  { key: "airport", label: "机场", width: "8%" },
  { key: "flight_no", label: "航班", width: "8%" },
  { key: "flight_datetime", label: "到达/出发日期时间", width: "11%" },
  { key: "location_to", label: "目的地", width: "10%" },
  { key: "group_id", label: "Group ID", width: "8%" },
  { key: "actions", label: "操作", width: "136px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  orderNo: "",
  serviceType: "",
  airportCode: "",
  status: "active",
  dateFrom: "",
  dateTo: "",
  sort: "submitted_latest",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const requests = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const notice = ref("");

const hasRequests = computed(() => requests.value.length > 0);

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
  return serviceType === "dropoff" ? "送机" : serviceType === "pickup" ? "接机" : displayValue(serviceType);
}

function studentTitle(request) {
  return [request.student_name, request.phone, request.student_email || request.email].filter(Boolean).join(" / ") || "--";
}

function groupHref(request) {
  const groupRef = String(request.group_ref || request.group_id || "").trim();
  return groupRef ? `/admin-vue/transport/groups/${encodeURIComponent(groupRef)}?return_to=${encodeURIComponent("/admin-vue/transport/requests")}` : "";
}

function buildQuery(page) {
  return {
    paginate: true,
    page,
    page_size: filters.pageSize,
    order_no: filters.orderNo.trim(),
    service_type: filters.serviceType,
    airport_code: filters.airportCode,
    status: filters.status,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    sort: filters.sort
  };
}

async function loadRequests(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchTransportRequests(buildQuery(page));
    requests.value = Array.isArray(payload?.items) ? payload.items : [];
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: requests.value.length,
      total_pages: requests.value.length ? 1 : 0
    };
  } catch (err) {
    requests.value = [];
    error.value = err.message || "接送机订单列表加载失败";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadRequests(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  loadRequests(1);
}

function handlePageChange(page) {
  loadRequests(page);
}

function requestDetailHref(request) {
  const id = request?.id || request?.request_id || request?.transport_request_id || request?.legacy_id;
  if (!id) {
    return "";
  }
  const searchParams = new URLSearchParams({ return_to: "/admin-vue/transport/requests" });
  return `/admin-vue/transport/requests/${encodeURIComponent(id)}?${searchParams.toString()}`;
}

function showPlaceholder(action, request) {
  if (String(action).includes("查看") || String(action).includes("鏌")) {
    const href = requestDetailHref(request);
    if (href) {
      window.location.href = href;
      return;
    }
    notice.value = `暂未找到对应旧详情页：${displayValue(request?.order_no || request?.id)}`;
    return;
  }
  notice.value = `${action}将在后续阶段实现：${displayValue(request?.order_no || request?.id)}`;
}

function showExportPlaceholder() {
  notice.value = "导出 Excel 将在后续阶段接入，当前 Vue 页面不会触发真实导出。";
}

onMounted(() => {
  loadRequests(1);
});
</script>

<template>
  <section class="transport-requests-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 5 transport list migration</p>
        <h2>登记接送机订单</h2>
      </div>
      <a class="secondary-button" href="/transport-admin-requests.html">打开旧接送机后台</a>
    </div>

    <TransportRequestFilters v-model="filters" @submit="submitFilters" @reset="resetFilters" @export="showExportPlaceholder" />

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <LoadingState v-if="loading">正在加载接送机订单...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasRequests" title="暂无符合条件的接送机订单" description="请调整订单编号、机场、状态或日期范围后重试。" />
    <template v-else>
      <AdminTable :columns="columns" :rows="requests">
        <template #cell-created_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
        </template>
        <template #cell-order_no="{ row }">
          <strong class="cell-truncate" :title="displayValue(row.order_no)">{{ displayValue(row.order_no) }}</strong>
        </template>
        <template #cell-student="{ row }">
          <span class="cell-stack" :title="studentTitle(row)">
            <strong class="cell-truncate">{{ displayValue(row.student_name) }}</strong>
            <small class="cell-truncate">{{ displayValue(row.phone) }}</small>
            <small class="cell-truncate">{{ displayValue(row.student_email || row.email) }}</small>
          </span>
        </template>
        <template #cell-wechat="{ row }">
          <span class="cell-truncate" :title="displayValue(row.wechat)">{{ displayValue(row.wechat) }}</span>
        </template>
        <template #cell-service_type="{ row }">
          <StatusBadge tone="neutral">
            {{ serviceLabel(row.service_type) }}
          </StatusBadge>
        </template>
        <template #cell-airport="{ row }">
          <span class="cell-stack" :title="[row.airport_code, row.airport_name, row.terminal].filter(Boolean).join(' / ') || '--'">
            <strong class="cell-truncate">{{ displayValue(row.airport_code || row.airport_name) }}</strong>
            <small class="cell-truncate">{{ displayValue(row.terminal) }}</small>
          </span>
        </template>
        <template #cell-flight_no="{ row }">
          <span class="cell-truncate" :title="displayValue(row.flight_no)">{{ displayValue(row.flight_no) }}</span>
        </template>
        <template #cell-flight_datetime="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.flight_datetime)">{{ formatDateTime(row.flight_datetime) }}</span>
        </template>
        <template #cell-location_to="{ row }">
          <span class="cell-truncate" :title="displayValue(row.location_to)">{{ displayValue(row.location_to) }}</span>
        </template>
        <template #cell-group_id="{ row }">
          <a v-if="groupHref(row)" class="table-link" :href="groupHref(row)">
            <strong class="cell-truncate" :title="displayValue(row.group_id)">{{ displayValue(row.group_id) }}</strong>
          </a>
          <span v-else class="cell-truncate">--</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <button class="table-action-button" type="button" @click="showPlaceholder('查看详情', row)">查看</button>
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除订单', row)">删除</button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
