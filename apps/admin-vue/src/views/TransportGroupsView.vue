<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchTransportGroups } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import TransportGroupFilters from "@/components/TransportGroupFilters.vue";

const columns = [
  { key: "group_id", label: "Group / orders", width: "12%" },
  { key: "service_type", label: "Service", width: "7%" },
  { key: "airport_terminal", label: "Airport / terminal", width: "12%" },
  { key: "service_time", label: "Date / time", width: "12%" },
  { key: "members", label: "Members", width: "13%" },
  { key: "capacity", label: "People / luggage", width: "10%" },
  { key: "payment_status", label: "Payment / record", width: "12%" },
  { key: "visibility", label: "Public", width: "7%" },
  { key: "risks", label: "Risks", width: "11%" },
  { key: "status", label: "Status", width: "7%" },
  { key: "actions", label: "Actions", width: "104px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  keyword: "",
  serviceType: "",
  airportCode: "",
  status: "active",
  dateFrom: "",
  dateTo: "",
  pageSize: 10
};

const filters = reactive({ ...defaultFilters });
const groups = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const notice = ref("");

const hasGroups = computed(() => groups.value.length > 0);

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "--";
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : displayValue(value);
}

function formatDate(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
  } catch (err) {
    return displayValue(value);
  }
}

function formatDateTime(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
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

function formatTime(value) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  } catch (err) {
    return "--";
  }
}

function serviceLabel(serviceType) {
  if (serviceType === "dropoff") return "送机";
  if (serviceType === "pickup") return "接机";
  return displayValue(serviceType);
}

function statusLabel(status) {
  const labels = {
    single_member: "拼车中",
    active: "拼车中",
    open: "拼车中",
    full: "已满员",
    closed: "已关闭",
    cancelled: "已取消"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "closed" || status === "cancelled") return "neutral";
  if (status === "full") return "success";
  return "warning";
}

function memberRows(group) {
  const orderNos = Array.isArray(group.source_order_nos) ? group.source_order_nos : [];
  const studentNames = Array.isArray(group.student_names) ? group.student_names : [];
  const memberDetails = Array.isArray(group.member_details) ? group.member_details : [];
  const rowCount = Math.max(orderNos.length, studentNames.length, memberDetails.length, 0);
  return Array.from({ length: rowCount }, (_, index) => {
    const detail = memberDetails[index] || {};
    return {
      orderNo: detail.order_no || orderNos[index] || "--",
      studentName: detail.student_name || studentNames[index] || "--",
      terminal: detail.terminal || group.terminal || "",
      flightTime: detail.flight_datetime || detail.preferred_time_start || group.flight_time_reference || group.preferred_time_start,
      phone: detail.phone || "",
      wechat: detail.wechat || "",
      passengerCount: Number(detail.passenger_count || 0),
      luggageCount: Number(detail.luggage_count || 0),
      offlineRecorded: Boolean(detail.offline_recorded),
      contactStatus: detail.contact_status || "",
      paymentStatus: detail.payment_collection_status || detail.manual_payment_status || ""
    };
  });
}

function memberTitle(rows, key) {
  return rows.map(row => row[key]).filter(Boolean).join(" / ") || "--";
}

function paymentSummary(group) {
  return group.payment_summary || {};
}

function paymentLabel(group) {
  const payment = paymentSummary(group);
  const total = Number(payment.total_member_count || 0);
  const paid = Number(payment.paid_member_count || 0);
  if (total <= 0) return "无成员";
  return paid >= total ? "全部已付款" : `${paid}/${total} 已付款`;
}

function paymentTone(group) {
  const payment = paymentSummary(group);
  const total = Number(payment.total_member_count || 0);
  const unpaid = Number(payment.unpaid_member_count || 0);
  return total > 0 && unpaid <= 0 ? "success" : "warning";
}

function groupHref(group) {
  const id = group?.id || group?.group_ref || group?.group_id || group?.legacy_id;
  if (!id) return "";
  return `/admin/transport/groups/${encodeURIComponent(id)}?return_to=${encodeURIComponent("/admin/transport/groups")}`;
}

function timeRangeLabel(group) {
  const range = group.arrival_range || {};
  if (range.earliest && range.latest && range.earliest !== range.latest) {
    return `${formatDateTime(range.earliest)} - ${formatTime(range.latest)}`;
  }
  return formatDateTime(group.preferred_time_start || group.flight_time_reference || range.earliest || group.group_date);
}

function totalLuggage(group) {
  return Number(group.luggage_summary?.total_luggage_count || group.current_luggage_count || 0);
}

function visibleLabel(value) {
  return value ? "显示" : "隐藏";
}

function visibleTone(value) {
  return value ? "success" : "neutral";
}

function riskItems(group) {
  const risks = Array.isArray(group.dispatch_risks) ? group.dispatch_risks : [];
  return risks.length ? risks : [];
}

function riskTone(group) {
  return riskItems(group).length ? "warning" : "success";
}

function riskLabel(group) {
  const risks = riskItems(group);
  return risks.length ? `${risks.length} 项风险` : "无明显风险";
}

function offlineSummary(group) {
  const rows = memberRows(group);
  if (!rows.length) return "0/0 已记录";
  const recorded = rows.filter(row => row.offlineRecorded).length;
  return `${recorded}/${rows.length} 已记录`;
}

function buildQuery(page) {
  return {
    paginate: true,
    page,
    page_size: filters.pageSize,
    order_no: filters.keyword.trim(),
    service_type: filters.serviceType,
    airport_code: filters.airportCode,
    status: filters.status,
    date_from: filters.dateFrom,
    date_to: filters.dateTo
  };
}

async function loadGroups(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchTransportGroups(buildQuery(page));
    groups.value = Array.isArray(payload?.items) ? payload.items : [];
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: groups.value.length,
      total_pages: groups.value.length ? 1 : 0
    };
  } catch (err) {
    groups.value = [];
    error.value = err.message || "拼车组列表加载失败。";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadGroups(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  loadGroups(1);
}

function handlePageChange(page) {
  loadGroups(page);
}

onMounted(() => {
  loadGroups(1);
});
</script>

<template>
  <section class="transport-groups-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport dispatch</p>
        <h2>拼车调度工作台</h2>
      </div>
    </div>

    <TransportGroupFilters v-model="filters" @submit="submitFilters" @reset="resetFilters" />

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <LoadingState v-if="loading">正在加载拼车组...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasGroups" title="暂无符合条件的拼车组" description="请调整订单编号、Group ID、机场、状态或日期范围后重试。" />
    <template v-else>
      <AdminTable :columns="columns" :rows="groups">
        <template #cell-group_id="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate" :title="displayValue(row.group_id || row.id)">{{ displayValue(row.group_id || row.id) }}</strong>
            <small v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.orderNo}`" :title="member.orderNo">
              {{ member.orderNo }}
            </small>
          </span>
        </template>
        <template #cell-members="{ row }">
          <span class="cell-stack" :title="memberTitle(memberRows(row), 'studentName')">
            <strong v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.orderNo}-name`" class="cell-truncate">
              {{ member.studentName }}
            </strong>
            <small>{{ memberRows(row).length }} member(s)</small>
          </span>
        </template>
        <template #cell-service_type="{ row }">
          <span class="cell-truncate" :title="serviceLabel(row.service_type)">{{ serviceLabel(row.service_type) }}</span>
        </template>
        <template #cell-service_time="{ row }">
          <span class="cell-stack">
            <strong>{{ formatDate(row.group_date) }}</strong>
            <small>{{ timeRangeLabel(row) }}</small>
          </span>
        </template>
        <template #cell-airport_terminal="{ row }">
          <span class="cell-stack" :title="[row.airport_code, row.airport_name, row.terminal_summary || row.terminal].filter(Boolean).join(' / ') || '--'">
            <strong class="cell-truncate">{{ displayValue(row.airport_code || row.airport_name) }}</strong>
            <small v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.orderNo}-time`">
              {{ displayValue(member.terminal) }} / {{ formatTime(member.flightTime) }}
            </small>
          </span>
        </template>
        <template #cell-capacity="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate">{{ Number(row.current_passenger_count || 0) }} / {{ Number(row.max_passengers || 0) }} 人</strong>
            <small>{{ totalLuggage(row) }} 件行李</small>
          </span>
        </template>
        <template #cell-payment_status="{ row }">
          <span class="cell-stack">
            <StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge>
            <small>记录：{{ offlineSummary(row) }}</small>
            <small>动态人均：{{ formatMoney(row.current_average_price_gbp) }}</small>
          </span>
        </template>
        <template #cell-visibility="{ row }">
          <StatusBadge :tone="visibleTone(row.visible_on_frontend)">{{ visibleLabel(row.visible_on_frontend) }}</StatusBadge>
        </template>
        <template #cell-risks="{ row }">
          <span class="cell-stack">
            <StatusBadge :tone="riskTone(row)">{{ riskLabel(row) }}</StatusBadge>
            <small v-for="risk in riskItems(row).slice(0, 2)" :key="`${row.group_id || row.id}-${risk.code}`">{{ risk.label }}</small>
          </span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <a v-if="groupHref(row)" class="table-action-button" :href="groupHref(row)">核对</a>
            <button v-else class="table-action-button" type="button" @click="notice = '未找到可打开的拼车组详情。'">核对</button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
