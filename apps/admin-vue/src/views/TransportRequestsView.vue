<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  bulkSetTransportRequestsOfflineRecorded,
  deleteTransportRequest,
  exportTransportRequests,
  fetchTransportRequests,
  updateTransportRequest
} from "@/api/admin-api";
import AdminBulkActionBar from "@/components/AdminBulkActionBar.vue";
import AdminTable from "@/components/AdminTable.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import TransportRequestFilters from "@/components/TransportRequestFilters.vue";

const columns = [
  { key: "selected", label: "选择", width: "54px" },
  { key: "created_at", label: "提交时间", width: "9%" },
  { key: "order_no", label: "订单编号", width: "10%" },
  { key: "student", label: "学生", width: "12%" },
  { key: "wechat", label: "微信号", width: "9%" },
  { key: "service_type", label: "服务", width: "7%" },
  { key: "airport", label: "机场", width: "8%" },
  { key: "flight_no", label: "航班", width: "8%" },
  { key: "flight_datetime", label: "到达/出发时间", width: "11%" },
  { key: "location_to", label: "目的地", width: "10%" },
  { key: "group_id", label: "Group ID", width: "8%" },
  { key: "status", label: "状态", width: "7%" },
  { key: "offline_recorded", label: "线下记录", width: "8%" },
  { key: "last_operation", label: "上次操作", width: "11%" },
  { key: "actions", label: "操作", width: "180px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  orderNo: "",
  serviceType: "",
  airportCode: "",
  status: "active",
  offlineRecorded: "",
  lastOperatedBy: "",
  dateFrom: "",
  dateTo: "",
  sort: "submitted_latest",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const requests = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const operatorOptions = ref([]);
const selectedIds = ref([]);
const loading = ref(false);
const exporting = ref(false);
const bulkSaving = ref(false);
const togglingId = ref("");
const deletingId = ref("");
const deleteCandidate = ref(null);
const error = ref("");
const notice = ref("");

const hasRequests = computed(() => requests.value.length > 0);
const selectedRows = computed(() => requests.value.filter(row => selectedIds.value.includes(String(row.id))));
const allCurrentPageSelected = computed(() => {
  const ids = requests.value.map(row => String(row.id)).filter(Boolean);
  return ids.length > 0 && ids.every(id => selectedIds.value.includes(id));
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
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

function serviceLabel(serviceType) {
  if (serviceType === "dropoff") return "送机";
  if (serviceType === "pickup") return "接机";
  return displayValue(serviceType);
}

function requestStatusLabel(status) {
  const labels = {
    active: "有效",
    published: "已发布",
    matched: "已匹配",
    closed: "已关闭"
  };
  return labels[status] || displayValue(status);
}

function requestStatusTone(status) {
  if (status === "closed") return "neutral";
  if (status === "matched") return "success";
  return "warning";
}

function offlineRecordedLabel(value) {
  return value ? "已记录" : "未记录";
}

function isMembershipRequest(row) {
  return Boolean(row?.membership_benefit_claim_id) || Number(row?.membership_discount_amount || 0) > 0;
}

function requestRowClass(row) {
  return isMembershipRequest(row) ? "is-member-order" : "";
}

function studentTitle(row) {
  return [row.student_name, row.phone, row.student_email || row.email].filter(Boolean).join(" / ") || "--";
}

function groupHref(row) {
  const groupRef = String(row.group_ref || row.group_id || "").trim();
  return groupRef ? `/admin/transport/groups/${encodeURIComponent(groupRef)}?return_to=${encodeURIComponent("/admin/transport/requests")}` : "";
}

function buildFilterQuery() {
  return {
    order_no: filters.orderNo.trim(),
    service_type: filters.serviceType,
    airport_code: filters.airportCode,
    status: filters.status,
    offline_recorded: filters.offlineRecorded,
    last_operated_by: filters.lastOperatedBy,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    sort: filters.sort
  };
}

function buildQuery(page) {
  return {
    paginate: true,
    page,
    page_size: filters.pageSize,
    ...buildFilterQuery()
  };
}

async function loadRequests(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchTransportRequests(buildQuery(page));
    requests.value = Array.isArray(payload?.items) ? payload.items : [];
    operatorOptions.value = Array.isArray(payload?.operator_options) ? payload.operator_options : [];
    selectedIds.value = selectedIds.value.filter(id => requests.value.some(row => String(row.id) === id));
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: requests.value.length,
      total_pages: requests.value.length ? 1 : 0
    };
  } catch (err) {
    requests.value = [];
    error.value = err.message || "接机送机订单加载失败。";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  selectedIds.value = [];
  loadRequests(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  selectedIds.value = [];
  loadRequests(1);
}

function handlePageChange(page) {
  loadRequests(page);
}

function requestDetailHref(row) {
  const id = row?.id || row?.request_id || row?.transport_request_id || row?.legacy_id;
  if (!id) return "";
  const searchParams = new URLSearchParams({ return_to: "/admin/transport/requests" });
  return `/admin/transport/requests/${encodeURIComponent(id)}?${searchParams.toString()}`;
}

function requestActionId(row) {
  return row?.id || row?.request_id || row?.transport_request_id || row?.legacy_id || "";
}

function openRequestDetail(row) {
  const href = requestDetailHref(row);
  if (href) {
    window.location.href = href;
    return;
  }
  notice.value = `暂未找到订单 ${displayValue(row?.order_no || row?.id)} 的详情入口。`;
}

function openDeleteDialog(row) {
  if (!requestActionId(row)) {
    notice.value = `未找到可删除的接送机订单 ID：${displayValue(row?.order_no || row?.id)}`;
    return;
  }
  deleteCandidate.value = row;
  notice.value = "";
}

function closeDeleteDialog() {
  if (!deletingId.value) {
    deleteCandidate.value = null;
  }
}

async function confirmDelete() {
  const target = deleteCandidate.value;
  const id = requestActionId(target);
  if (!id || deletingId.value) return;
  deletingId.value = String(id);
  notice.value = "";
  error.value = "";
  try {
    await deleteTransportRequest(id);
    notice.value = `已删除订单 ${displayValue(target?.order_no || id)}。`;
    deleteCandidate.value = null;
    selectedIds.value = selectedIds.value.filter(item => item !== String(id));
    await loadRequests(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "删除失败，请稍后重试。";
  } finally {
    deletingId.value = "";
  }
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename || "transport-requests.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function toggleCurrentPageSelection() {
  selectedIds.value = allCurrentPageSelected.value
    ? []
    : requests.value.map(row => String(row.id)).filter(Boolean);
}

function toggleRowSelection(row) {
  const id = String(row?.id || "");
  if (!id) return;
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(item => item !== id)
    : [...selectedIds.value, id];
}

async function handleExportFiltered() {
  if (exporting.value) return;
  exporting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const { blob, filename } = await exportTransportRequests(buildFilterQuery());
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
    const { blob, filename } = await exportTransportRequests({ ids: selectedIds.value.join(",") });
    downloadBlob(blob, filename);
    notice.value = `选中的 ${selectedIds.value.length} 条订单已开始导出。`;
  } catch (err) {
    notice.value = err.message || "导出选中订单失败，请稍后重试。";
  } finally {
    exporting.value = false;
  }
}

async function setSelectedOfflineRecorded(value) {
  if (!selectedIds.value.length) {
    notice.value = "请先选择订单";
    return;
  }
  if (bulkSaving.value) return;
  bulkSaving.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await bulkSetTransportRequestsOfflineRecorded(selectedIds.value, value);
    notice.value = value
      ? `已将 ${Number(result?.updated_count || 0)} 条订单标记为已记录。`
      : `已取消 ${Number(result?.updated_count || 0)} 条订单的已记录状态。`;
    selectedIds.value = [];
    await loadRequests(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "批量更新线下记录状态失败。";
  } finally {
    bulkSaving.value = false;
  }
}

async function toggleOfflineRecorded(row) {
  const id = requestActionId(row);
  if (!id || togglingId.value) return;
  togglingId.value = String(id);
  notice.value = "";
  error.value = "";
  try {
    const updated = await updateTransportRequest(id, {
      offline_recorded: !Boolean(row.offline_recorded)
    });
    const nextRow = updated?.request || updated?.item || updated;
    requests.value = requests.value.map(item => (item.id === row.id ? { ...item, ...nextRow } : item));
    notice.value = nextRow?.offline_recorded ? "已标记为已记录。" : "已取消已记录状态。";
  } catch (err) {
    notice.value = err.message || "线下记录状态保存失败，请稍后重试。";
  } finally {
    togglingId.value = "";
  }
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
    </div>

    <TransportRequestFilters
      v-model="filters"
      :operator-options="operatorOptions"
      :exporting="exporting"
      @submit="submitFilters"
      @reset="resetFilters"
      @export="handleExportFiltered"
    />

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <LoadingState v-if="loading">正在加载接机送机订单...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasRequests" title="暂无符合条件的接机送机订单" description="请调整订单编号、机场、状态或日期范围后重试。" />
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

      <AdminTable :columns="columns" :rows="requests" :row-class="requestRowClass">
        <template #cell-selected="{ row }">
          <input
            type="checkbox"
            :checked="selectedIds.includes(String(row.id))"
            :aria-label="`选择订单 ${displayValue(row.order_no)}`"
            @change="toggleRowSelection(row)"
          />
        </template>
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
          <StatusBadge tone="neutral">{{ serviceLabel(row.service_type) }}</StatusBadge>
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
        <template #cell-status="{ row }">
          <StatusBadge :tone="requestStatusTone(row.status)">{{ requestStatusLabel(row.status) }}</StatusBadge>
        </template>
        <template #cell-offline_recorded="{ row }">
          <StatusBadge :tone="row.offline_recorded ? 'success' : 'neutral'">
            {{ offlineRecordedLabel(row.offline_recorded) }}
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
            <button class="table-action-button" type="button" @click="openRequestDetail(row)">查看详情</button>
            <button
              class="table-action-button table-action-button--danger"
              type="button"
              :disabled="deletingId === String(requestActionId(row))"
              @click="openDeleteDialog(row)"
            >
              {{ deletingId === String(requestActionId(row)) ? "删除中..." : "删除" }}
            </button>
            <button
              class="table-action-button"
              type="button"
              :disabled="togglingId === String(row.id)"
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
      title="确认删除接送机订单"
      confirm-label="确认删除"
      :loading="Boolean(deletingId)"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    >
      <p class="confirm-dialog__warning">删除后不可恢复，并会同步清理相关拼车组成员关系。请确认这是要删除的单条接送机订单。</p>
      <div class="readonly-field-grid">
        <article class="readonly-field">
          <span>订单编号</span>
          <strong>{{ displayValue(deleteCandidate?.order_no) }}</strong>
        </article>
        <article class="readonly-field">
          <span>学生</span>
          <strong>{{ displayValue(deleteCandidate?.student_name) }}</strong>
        </article>
        <article class="readonly-field">
          <span>服务</span>
          <strong>{{ deleteCandidate ? serviceLabel(deleteCandidate.service_type) : "--" }}</strong>
        </article>
      </div>
    </ConfirmDialog>
  </section>
</template>
