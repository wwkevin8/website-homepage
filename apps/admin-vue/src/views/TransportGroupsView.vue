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
  { key: "group_id", label: "Group ID", width: "10%" },
  { key: "students", label: "同学姓名", width: "11%" },
  { key: "service_type", label: "服务", width: "6%" },
  { key: "group_date", label: "出行日期", width: "8%" },
  { key: "airport_time", label: "机场 / 时间", width: "11%" },
  { key: "location_to", label: "目的地", width: "10%" },
  { key: "seats", label: "当前人数 / 座位数", width: "8%" },
  { key: "payment_status", label: "是否全部已付款", width: "9%" },
  { key: "pay_all", label: "一键确认全部付款", width: "10%" },
  { key: "status", label: "状态", width: "7%" },
  { key: "actions", label: "操作", width: "128px", className: "is-actions", sticky: "end" }
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

function formatDate(value) {
  if (!value) {
    return "--";
  }
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
  } catch (err) {
    return value;
  }
}

function formatTime(value) {
  if (!value) {
    return "--";
  }
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
  return serviceType === "dropoff" ? "送机" : serviceType === "pickup" ? "接机" : displayValue(serviceType);
}

function statusLabel(status) {
  const labels = {
    single_member: "拼车中",
    active: "拼车中",
    open: "拼车中",
    full: "已拼满",
    closed: "已过期",
    cancelled: "已取消"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "closed" || status === "cancelled") {
    return "neutral";
  }
  if (status === "full") {
    return "success";
  }
  return "warning";
}

function memberRows(group) {
  const orderNos = Array.isArray(group.source_order_nos) ? group.source_order_nos : [];
  const studentNames = Array.isArray(group.student_names) ? group.student_names : [];
  const memberDetails = Array.isArray(group.member_details) ? group.member_details : [];
  const rowCount = Math.max(orderNos.length, studentNames.length, memberDetails.length, 1);
  return Array.from({ length: rowCount }, (_, index) => {
    const detail = memberDetails[index] || {};
    return {
      orderNo: orderNos[index] || "--",
      studentName: studentNames[index] || "--",
      terminal: detail.terminal || group.terminal || "--",
      flightTime: detail.flight_datetime || group.flight_time_reference || group.preferred_time_start,
      destination: group.location_to || "--"
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
  if (total <= 0) {
    return "无成员";
  }
  return paid >= total ? "已全部付款" : `${paid}/${total} 已付款`;
}

function paymentTone(group) {
  const payment = paymentSummary(group);
  const total = Number(payment.total_member_count || 0);
  const unpaid = Number(payment.unpaid_member_count || 0);
  return total > 0 && unpaid <= 0 ? "success" : "warning";
}

function groupHref(group) {
  const ref = String(group.id || group.group_ref || group.group_id || "").trim();
  return ref ? `/transport-admin-group-edit.html?id=${encodeURIComponent(ref)}` : "";
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
    error.value = err.message || "拼车组列表加载失败";
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

function showPlaceholder(action, group) {
  notice.value = `${action}将在后续阶段实现：${displayValue(group?.group_id || group?.id)}`;
}

onMounted(() => {
  loadGroups(1);
});
</script>

<template>
  <section class="transport-groups-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 6 transport group list migration</p>
        <h2>拼车组管理</h2>
      </div>
      <a class="secondary-button" href="/transport-admin-groups.html">打开旧拼车组后台</a>
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
        <template #cell-students="{ row }">
          <span class="cell-stack" :title="memberTitle(memberRows(row), 'studentName')">
            <strong v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.studentName}`" class="cell-truncate">
              {{ member.studentName }}
            </strong>
          </span>
        </template>
        <template #cell-service_type="{ row }">
          <span class="cell-truncate" :title="serviceLabel(row.service_type)">{{ serviceLabel(row.service_type) }}</span>
        </template>
        <template #cell-group_date="{ row }">
          <span class="cell-truncate" :title="formatDate(row.group_date)">{{ formatDate(row.group_date) }}</span>
        </template>
        <template #cell-airport_time="{ row }">
          <span class="cell-stack" :title="[row.airport_code, row.airport_name, row.terminal_summary || row.terminal].filter(Boolean).join(' / ') || '--'">
            <strong class="cell-truncate">{{ displayValue(row.airport_code || row.airport_name) }}</strong>
            <small v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.orderNo}-time`">
              {{ member.terminal }} / {{ formatTime(member.flightTime) }}
            </small>
          </span>
        </template>
        <template #cell-location_to="{ row }">
          <span class="cell-truncate" :title="displayValue(row.location_to)">{{ displayValue(row.location_to) }}</span>
        </template>
        <template #cell-seats="{ row }">
          <strong class="cell-truncate">{{ Number(row.current_passenger_count || 0) }} / {{ Number(row.max_passengers || 0) }}</strong>
        </template>
        <template #cell-payment_status="{ row }">
          <StatusBadge :tone="paymentTone(row)">
            {{ paymentLabel(row) }}
          </StatusBadge>
        </template>
        <template #cell-pay_all="{ row }">
          <button class="table-action-button" type="button" @click="showPlaceholder('确认全部付款', row)">
            确认付款
          </button>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="statusTone(row.status)">
            {{ statusLabel(row.status) }}
          </StatusBadge>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <a v-if="groupHref(row)" class="table-action-button" :href="groupHref(row)">查看</a>
            <button v-else class="table-action-button" type="button" @click="showPlaceholder('查看详情', row)">查看</button>
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除拼车组', row)">删除</button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
