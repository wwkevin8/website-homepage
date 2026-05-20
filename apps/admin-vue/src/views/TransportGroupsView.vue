<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { deleteTransportGroup, fetchTransportGroup, fetchTransportGroups, updateTransportRequest } from "@/api/admin-api";
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
  { key: "seats", label: "人数 / 座位", width: "7%" },
  { key: "payment_status", label: "付款状态", width: "8%" },
  { key: "current_average_price", label: "当前人均", width: "7%", className: "is-number" },
  { key: "payment_actions", label: "付款操作", width: "120px", className: "is-actions" },
  { key: "status", label: "状态", width: "6%" },
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
const savingPaymentGroup = ref("");
const deletingGroup = ref("");

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
    full: "已拼满",
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
  const rowCount = Math.max(orderNos.length, studentNames.length, memberDetails.length, 1);
  return Array.from({ length: rowCount }, (_, index) => {
    const detail = memberDetails[index] || {};
    return {
      orderNo: orderNos[index] || "--",
      studentName: studentNames[index] || "--",
      terminal: detail.terminal || group.terminal || "--",
      flightTime: detail.flight_datetime || group.flight_time_reference || group.preferred_time_start
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
  return paid >= total ? "已全部付款" : `${paid}/${total} 已付款`;
}

function paymentTone(group) {
  const payment = paymentSummary(group);
  const total = Number(payment.total_member_count || 0);
  const unpaid = Number(payment.unpaid_member_count || 0);
  return total > 0 && unpaid <= 0 ? "success" : "warning";
}

function paymentMembers(group) {
  const members = paymentSummary(group).member_payments;
  return Array.isArray(members) ? members : [];
}

function unpaidPaymentMembers(group) {
  return paymentMembers(group).filter(member => String(member.payment_status || "").toLowerCase() !== "paid");
}

function groupActionKey(group) {
  return String(group?.group_id || group?.id || "");
}

function paymentActionLabel(group) {
  const unpaidMembers = unpaidPaymentMembers(group);
  if (!unpaidMembers.length) return "已付款";
  return unpaidMembers.length > 1 ? `标记${unpaidMembers.length}人付款` : "标记付款";
}

function withPaymentMarker(adminNote, status) {
  const cleanedNote = String(adminNote || "").replace(/\[payment:(paid|unpaid)\]\s*/gi, "").trim();
  const marker = `[payment:${status}]`;
  return cleanedNote ? `${marker}\n${cleanedNote}` : marker;
}

async function markGroupPaid(group) {
  const groupKey = groupActionKey(group);
  const unpaidMembers = unpaidPaymentMembers(group).filter(member => member.request_id);
  if (!unpaidMembers.length || savingPaymentGroup.value) {
    return;
  }

  const confirmed = window.confirm(`确认将 ${displayValue(group.group_id || group.id)} 的 ${unpaidMembers.length} 个未付款成员标记为已付款吗？`);
  if (!confirmed) {
    return;
  }

  savingPaymentGroup.value = groupKey;
  notice.value = "";
  error.value = "";
  try {
    for (const member of unpaidMembers) {
      await updateTransportRequest(member.request_id, {
        admin_note: withPaymentMarker(member.admin_note, "paid")
      });
    }
    await loadGroups(pagination.value.page || 1);
    notice.value = `已将 ${displayValue(group.group_id || group.id)} 的 ${unpaidMembers.length} 个成员标记为已付款。`;
  } catch (err) {
    notice.value = err.message || "标记付款失败，请稍后重试。";
  } finally {
    savingPaymentGroup.value = "";
  }
}

function groupHref(group) {
  const id = group?.id || group?.group_ref || group?.group_id || group?.legacy_id;
  if (!id) return "";
  return `/admin-vue/transport/groups/${encodeURIComponent(id)}?return_to=${encodeURIComponent("/admin-vue/transport/groups")}`;
}

function groupRef(group) {
  return group?.id || group?.group_ref || group?.group_id || group?.legacy_id || "";
}

async function deleteGroup(row) {
  const ref = groupRef(row);
  const name = displayValue(row?.group_id || row?.id);
  if (!ref || deletingGroup.value) {
    return;
  }

  deletingGroup.value = String(ref);
  notice.value = "";
  error.value = "";
  try {
    const group = await fetchTransportGroup(ref);
    const memberCount = Array.isArray(group?.members) ? group.members.length : 0;
    if (memberCount > 0) {
      window.alert("请把当前拼车组成员移到其他组里。");
      return;
    }
    if (!window.confirm(`确定删除 ${name} 吗？`)) {
      return;
    }
    await deleteTransportGroup(ref);
    const nextPage = pagination.value.page > 1 && groups.value.length <= 1
      ? pagination.value.page - 1
      : pagination.value.page;
    await loadGroups(nextPage || 1);
    notice.value = `${name} 已删除。`;
  } catch (err) {
    notice.value = err.message || "删除拼车组失败，请稍后重试。";
  } finally {
    deletingGroup.value = "";
  }
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
        <p class="view-heading__eyebrow">Transport groups</p>
        <h2>拼车组管理</h2>
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
          <StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge>
        </template>
        <template #cell-current_average_price="{ row }">
          <span class="cell-truncate price-cell" :title="formatMoney(row.current_average_price_gbp)">
            {{ formatMoney(row.current_average_price_gbp) }}
          </span>
        </template>
        <template #cell-payment_actions="{ row }">
          <button
            class="table-action-button"
            type="button"
            :disabled="!unpaidPaymentMembers(row).length || savingPaymentGroup === groupActionKey(row)"
            @click="markGroupPaid(row)"
          >
            {{ savingPaymentGroup === groupActionKey(row) ? "保存中..." : paymentActionLabel(row) }}
          </button>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <a v-if="groupHref(row)" class="table-action-button" :href="groupHref(row)">查看详情</a>
            <button v-else class="table-action-button" type="button" @click="notice = '未找到可打开的拼车组详情。'">查看详情</button>
            <button
              class="table-action-button table-action-button--danger"
              type="button"
              :disabled="deletingGroup === String(groupRef(row))"
              @click="deleteGroup(row)"
            >
              {{ deletingGroup === String(groupRef(row)) ? "删除中..." : "删除" }}
            </button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
