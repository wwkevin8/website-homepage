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
  { key: "group_id", label: "Group ID", width: "160px" },
  { key: "route", label: "服务 / 机场", width: "170px" },
  { key: "service_time", label: "日期 / 时间", width: "150px" },
  { key: "members", label: "成员", width: "260px" },
  { key: "capacity", label: "人数 / 行李", width: "130px" },
  { key: "price", label: "人均 / 总价", width: "150px" },
  { key: "payment_status", label: "付款 / 记录", width: "170px" },
  { key: "dispatch_readiness", label: "派单准备度", width: "230px" },
  { key: "visibility", label: "前台 / 组状态 / 调度", width: "200px" },
  { key: "actions", label: "操作", width: "170px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  keyword: "",
  serviceType: "",
  airportCode: "",
  terminal: "",
  status: "active",
  visibleOnFrontend: "",
  risk: "",
  dateFrom: "",
  dateTo: "",
  paymentStatus: "",
  offlineStatus: "",
  dispatchReadiness: "",
  dispatchStatus: "",
  pageSize: 10
};

let filters = reactive({ ...defaultFilters });
const allGroups = ref([]);
const page = ref(1);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const filteredGroups = computed(() => allGroups.value.filter(group => matchesClientFilters(group)));
const pagedGroups = computed(() => {
  const size = Number(filters.pageSize || defaultFilters.pageSize);
  const start = (page.value - 1) * size;
  return filteredGroups.value.slice(start, start + size);
});
const pagination = computed(() => {
  const size = Number(filters.pageSize || defaultFilters.pageSize);
  const total = filteredGroups.value.length;
  return {
    page: page.value,
    page_size: size,
    total,
    total_pages: total ? Math.ceil(total / size) : 0
  };
});
const hasGroups = computed(() => pagedGroups.value.length > 0);

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
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
    single_member: "待拼车",
    active: "拼车中",
    open: "拼车中",
    full: "已满员",
    closed: "已关闭",
    cancelled: "已取消",
    canceled: "已取消"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "closed" || status === "cancelled" || status === "canceled") return "neutral";
  if (status === "full") return "success";
  return "warning";
}

function dispatchStatusLabel(status) {
  const labels = {
    pending_dispatch: "待调度",
    driver_assigned: "已派车",
    driver_notified: "已通知司机",
    in_progress: "服务中",
    completed: "已完成",
    cancelled: "已取消"
  };
  return labels[status] || "待调度";
}

function dispatchStatusTone(status) {
  if (status === "completed") return "success";
  if (status === "cancelled") return "neutral";
  if (status === "driver_assigned" || status === "driver_notified" || status === "in_progress") return "warning";
  return "neutral";
}

function paymentCollectionLabel(value) {
  const labels = {
    unpaid: "未付款",
    deposit_paid: "已付定金",
    fully_paid: "已付款",
    paid: "已付款",
    pending: "待确认",
    waived: "已免除"
  };
  return labels[value] || displayValue(value);
}

function isPaidStatus(value) {
  return ["fully_paid", "paid", "waived"].includes(String(value || "").trim().toLowerCase());
}

function normalizedPaymentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function memberRows(group) {
  const orderNos = Array.isArray(group.source_order_nos) ? group.source_order_nos : [];
  const studentNames = Array.isArray(group.student_names) ? group.student_names : [];
  const memberDetails = Array.isArray(group.member_details) ? group.member_details : [];
  const rowCount = Math.max(orderNos.length, studentNames.length, memberDetails.length, 0);
  return Array.from({ length: rowCount }, (_, index) => {
    const detail = memberDetails[index] || {};
    const paymentStatus = detail.payment_collection_status || detail.manual_payment_status || "";
    return {
      id: detail.id || detail.request_id || detail.transport_request_id || "",
      orderNo: detail.order_no || orderNos[index] || "--",
      studentName: detail.student_name || studentNames[index] || "--",
      terminal: detail.terminal || group.terminal || "",
      flightNo: detail.flight_no || "",
      flightTime: detail.flight_datetime || detail.preferred_time_start || group.flight_time_reference || group.preferred_time_start,
      phone: detail.phone || "",
      wechat: detail.wechat || "",
      address: group.service_type === "dropoff"
        ? detail.location_from || detail.location_to || ""
        : detail.location_to || detail.location_from || "",
      passengerCount: Number(detail.passenger_count || 0),
      luggageCount: Number(detail.luggage_count || 0),
      offlineRecorded: Boolean(detail.offline_recorded),
      contactStatus: detail.contact_status || "",
      paymentStatus,
      amount: detail.confirmed_price_gbp
        ?? detail.manual_price_gbp
        ?? detail.deposit_amount_gbp
        ?? group.current_average_price_gbp
        ?? group.payment_summary?.average_price_gbp
        ?? "",
      paid: isPaidStatus(paymentStatus),
      note: detail.admin_note || detail.notes || ""
    };
  });
}

function memberTitle(rows, key) {
  return rows.map(row => row[key]).filter(Boolean).join(" / ") || "--";
}

function paymentSummary(group) {
  const rows = memberRows(group);
  const paid = rows.filter(row => row.paid).length;
  return {
    total: rows.length,
    paid,
    unpaid: Math.max(rows.length - paid, 0)
  };
}

function paymentLabel(group) {
  const payment = paymentSummary(group);
  if (payment.total <= 0) return "无成员";
  if (payment.paid >= payment.total) return "全部已付款";
  if (payment.paid <= 0) return "全部未付款";
  return `${payment.paid}/${payment.total} 已付款`;
}

function paymentTone(group) {
  const payment = paymentSummary(group);
  if (payment.total > 0 && payment.paid >= payment.total) return "success";
  if (payment.paid > 0) return "warning";
  return "neutral";
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
  return value ? "前台显示" : "前台隐藏";
}

function visibleTone(value) {
  return value ? "success" : "neutral";
}

function riskItems(group) {
  return Array.isArray(group.dispatch_risks) ? group.dispatch_risks : [];
}

function riskTone(group) {
  return riskItems(group).length ? "warning" : "success";
}

function riskLabel(group) {
  const risks = riskItems(group);
  return risks.length ? `${risks.length} 项提醒` : "无明显风险";
}

function riskDisplayLabel(risk) {
  const code = String(risk?.code || "").trim();
  const labels = {
    cross_terminal: "不同航站楼",
    different_terminal: "不同航站楼",
    different_terminals: "不同航站楼",
    missing_flight_no: "缺航班号",
    missing_flight_number: "缺航班号",
    missing_contact: "缺联系方式",
    full_visible: "满员仍前台显示",
    full_public_visible: "满员仍前台显示",
    empty_group: "空组风险"
  };
  return labels[code] || risk?.label || code || "调度风险";
}

function riskSummary(group) {
  return riskItems(group).map(riskDisplayLabel).join(" / ");
}

function readinessState(group) {
  const rows = memberRows(group);
  const risks = riskItems(group);
  const hasMembers = rows.length > 0;
  const hasUncontacted = rows.some(row => row.contactStatus !== "contacted");
  const hasUnpaid = rows.some(row => normalizedPaymentStatus(row.paymentStatus) !== "fully_paid");
  const hasUnrecorded = rows.some(row => !row.offlineRecorded);
  const hasRisk = risks.length > 0;
  const hasMissingDispatchInfo = rows.some(row => {
    const hasContact = Boolean(row.phone || row.wechat);
    return !hasContact || !row.flightNo || !row.address || !normalizedPaymentStatus(row.paymentStatus);
  });
  const dispatchReady = hasMembers && !hasRisk && !hasUncontacted && !hasMissingDispatchInfo;
  const completedRecorded = hasMembers && rows.every(row => row.offlineRecorded);
  return {
    contact_pending: hasUncontacted,
    payment_incomplete: hasUnpaid,
    offline_pending: hasUnrecorded,
    has_risk: hasRisk,
    dispatch_ready: dispatchReady,
    completed_recorded: completedRecorded
  };
}

function readinessItems(group) {
  const state = readinessState(group);
  const items = [];
  if (state.contact_pending) items.push({ key: "contact_pending", label: "待联系", tone: "warning" });
  if (state.payment_incomplete) items.push({ key: "payment_incomplete", label: "付款未齐", tone: "warning" });
  if (state.offline_pending) items.push({ key: "offline_pending", label: "未线下记录", tone: "neutral" });
  if (state.dispatch_ready) items.push({ key: "dispatch_ready", label: "可派单", tone: "success" });
  if (state.completed_recorded) items.push({ key: "completed_recorded", label: "已完成记录", tone: "success" });
  if (items.length) return items;
  return memberRows(group).length ? [{ key: "manual_review", label: "待人工判断", tone: "neutral" }] : [{ key: "no_members", label: "暂无成员", tone: "neutral" }];
}

function readinessText(group) {
  return readinessItems(group).map(item => item.label).join(" / ");
}

function offlineSummary(group) {
  const rows = memberRows(group);
  if (!rows.length) return "0/0 已记录";
  const recorded = rows.filter(row => row.offlineRecorded).length;
  if (recorded >= rows.length) return "全部已记录";
  if (recorded <= 0) return "全部未记录";
  return `${recorded}/${rows.length} 已记录`;
}

function totalPrice(group) {
  const direct = group.payment_summary?.total_price_gbp;
  if (direct !== null && direct !== undefined && direct !== "") return direct;
  const average = Number(group.current_average_price_gbp || group.payment_summary?.average_price_gbp || 0);
  const people = Number(group.current_passenger_count || 0);
  return average && people ? average * people : "";
}

function searchHaystack(group) {
  const rows = memberRows(group);
  return [
    group.group_id,
    group.id,
    group.airport_code,
    group.airport_name,
    group.terminal,
    group.terminal_summary,
    group.notes,
    ...rows.flatMap(row => [
      row.orderNo,
      row.studentName,
      row.phone,
      row.wechat,
      row.flightNo,
      row.terminal,
      row.address,
      row.note
    ])
  ].map(normalizeText).join(" ");
}

function matchesRiskFilter(group) {
  const selected = filters.risk;
  if (!selected) return true;
  const risks = riskItems(group);
  if (selected === "has_risk") return risks.length > 0;
  if (selected === "no_risk") return risks.length === 0;
  return risks.some(risk => risk.code === selected);
}

function matchesPaymentFilter(group) {
  const selected = filters.paymentStatus;
  if (!selected) return true;
  const payment = paymentSummary(group);
  if (payment.total <= 0) return false;
  if (selected === "all_paid") return payment.paid >= payment.total;
  if (selected === "all_unpaid") return payment.paid === 0;
  if (selected === "partial_paid") return payment.paid > 0 && payment.paid < payment.total;
  return true;
}

function matchesOfflineFilter(group) {
  const selected = filters.offlineStatus;
  if (!selected) return true;
  const rows = memberRows(group);
  if (!rows.length) return false;
  const recorded = rows.filter(row => row.offlineRecorded).length;
  if (selected === "all_recorded") return recorded >= rows.length;
  if (selected === "all_unrecorded") return recorded === 0;
  if (selected === "partial_recorded") return recorded > 0 && recorded < rows.length;
  return true;
}

function matchesDispatchReadinessFilter(group) {
  const selected = filters.dispatchReadiness;
  if (!selected) return true;
  return Boolean(readinessState(group)[selected]);
}

function matchesDispatchStatusFilter(group) {
  const selected = filters.dispatchStatus;
  if (!selected) return true;
  return String(group.dispatch_status || "pending_dispatch") === selected;
}

function matchesClientFilters(group) {
  const keyword = normalizeText(filters.keyword);
  if (keyword && !searchHaystack(group).includes(keyword)) return false;
  if (filters.terminal) {
    const terminalNeedle = normalizeText(filters.terminal);
    const terminals = [group.terminal, group.terminal_summary, ...memberRows(group).map(row => row.terminal)].map(normalizeText).join(" ");
    if (!terminals.includes(terminalNeedle)) return false;
  }
  if (filters.visibleOnFrontend !== "" && Boolean(group.visible_on_frontend) !== (filters.visibleOnFrontend === "true")) return false;
  if (!matchesRiskFilter(group)) return false;
  if (!matchesPaymentFilter(group)) return false;
  if (!matchesOfflineFilter(group)) return false;
  if (!matchesDispatchReadinessFilter(group)) return false;
  if (!matchesDispatchStatusFilter(group)) return false;
  return true;
}

function buildQuery() {
  return {
    service_type: filters.serviceType,
    airport_code: filters.airportCode,
    status: filters.status,
    date_from: filters.dateFrom,
    date_to: filters.dateTo
  };
}

async function loadGroups(nextPage = 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchTransportGroups(buildQuery());
    allGroups.value = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    page.value = nextPage;
  } catch (err) {
    allGroups.value = [];
    error.value = err.message || "拼车组列表加载失败。";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  page.value = 1;
  loadGroups(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  page.value = 1;
  loadGroups(1);
}

function handlePageChange(nextPage) {
  page.value = nextPage;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(csv, filename) {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDispatchSummary(group) {
  const rows = memberRows(group);
  const airport = [group.airport_code, group.airport_name].filter(Boolean).join(" / ") || "--";
  const terminals = Array.from(new Set(rows.map(row => row.terminal).filter(Boolean))).join(" / ") || group.terminal_summary || group.terminal || "--";
  const memberLines = rows.map((row, index) => [
    `${index + 1}. ${row.studentName || "--"}`,
    `电话: ${row.phone || "--"}`,
    `微信: ${row.wechat || "--"}`,
    `航班号: ${row.flightNo || "--"}`,
    `航班时间: ${formatDateTime(row.flightTime)}`,
    `航站楼: ${row.terminal || "--"}`,
    `地址: ${row.address || "--"}`,
    `付款: ${paymentCollectionLabel(row.paymentStatus)}`,
    `是否已联系: ${row.contactStatus === "contacted" ? "已联系" : "未联系"}`,
    `是否已线下记录: ${row.offlineRecorded ? "已记录" : "未记录"}`
  ].join("；")).join("\n");

  return [
    "司机派单摘要",
    "",
    `Group ID: ${group.group_id || group.id || "--"}`,
    `服务类型: ${serviceLabel(group.service_type)}`,
    `服务日期: ${formatDate(group.group_date)}`,
    `服务时间: ${timeRangeLabel(group)}`,
    `机场 / 航站楼: ${airport} / ${terminals}`,
    `当前人数 / 容量: ${Number(group.current_passenger_count || 0)} / ${Number(group.max_passengers || 0)}`,
    `总行李数: ${totalLuggage(group)}`,
    `当前人均价 / 总价: ${formatMoney(group.current_average_price_gbp || group.payment_summary?.average_price_gbp)} / ${formatMoney(totalPrice(group))}`,
    `派单准备度: ${readinessText(group)}`,
    "",
    "乘客信息:",
    memberLines || "暂无乘客",
    "",
    `组备注 / 司机备注 / 调度备注: ${group.notes || "--"}`
  ].join("\n");
}

async function copyDriverSummary(group) {
  const text = buildDispatchSummary(group);
  try {
    await navigator.clipboard.writeText(text);
    notice.value = `已复制 ${displayValue(group.group_id || group.id)} 的司机派单摘要。`;
  } catch (err) {
    window.prompt("复制失败，请手动复制以下司机派单摘要：", text);
    notice.value = "浏览器限制了自动复制，已打开手动复制内容。";
  }
}

function exportFilteredGroups() {
  const headers = [
    "Group ID",
    "服务类型",
    "服务日期",
    "服务时间",
    "机场",
    "航站楼",
    "当前人数/容量",
    "总行李数",
    "当前人均价",
    "总价",
    "组状态",
    "调度状态",
    "前台显示",
    "风险提示",
    "派单准备度",
    "成员姓名",
    "电话",
    "微信",
    "航班号",
    "航班时间",
    "地址",
    "付款状态",
    "是否已联系",
    "是否已线下记录",
    "备注"
  ];
  const rows = filteredGroups.value.flatMap(group => {
    const members = memberRows(group);
    const groupRisks = riskSummary(group) || "无明显风险";
    const groupBase = [
      group.group_id || group.id || "",
      serviceLabel(group.service_type),
      formatDate(group.group_date),
      timeRangeLabel(group),
      [group.airport_code, group.airport_name].filter(Boolean).join(" / "),
      Array.from(new Set(members.map(row => row.terminal).filter(Boolean))).join(" / ") || group.terminal_summary || group.terminal || "",
      `${Number(group.current_passenger_count || 0)} / ${Number(group.max_passengers || 0)}`,
      totalLuggage(group),
      formatMoney(group.current_average_price_gbp || group.payment_summary?.average_price_gbp),
      formatMoney(totalPrice(group)),
      statusLabel(group.status),
      dispatchStatusLabel(group.dispatch_status),
      visibleLabel(group.visible_on_frontend),
      groupRisks,
      readinessText(group)
    ];
    if (!members.length) {
      return [[...groupBase, "", "", "", "", "", "", "", "", "", group.notes || ""]];
    }
    return members.map(member => [
      ...groupBase,
      member.studentName,
      member.phone,
      member.wechat,
      member.flightNo,
      formatDateTime(member.flightTime),
      member.address,
      paymentCollectionLabel(member.paymentStatus),
      member.contactStatus === "contacted" ? "已联系" : "未联系",
      member.offlineRecorded ? "已记录" : "未记录",
      [member.note, group.notes].filter(Boolean).join(" / ")
    ]);
  });
  const csv = [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\n");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  downloadCsv(csv, `transport-groups-dispatch-${stamp}.csv`);
  notice.value = `已导出当前筛选结果，共 ${filteredGroups.value.length} 个拼车组。`;
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
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" :disabled="loading || !filteredGroups.length" @click="exportFilteredGroups">
          导出当前筛选结果
        </button>
      </div>
    </div>

    <TransportGroupFilters v-model="filters" @submit="submitFilters" @reset="resetFilters" />

    <div class="transport-list-toolbar">
      <span class="transport-list-toolbar__summary">
        当前筛选 {{ filteredGroups.length }} 组，已加载 {{ allGroups.length }} 组
      </span>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <LoadingState v-if="loading">正在加载拼车组...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasGroups" title="暂无符合条件的拼车组" description="请调整关键词、风险、付款、线下记录或日期筛选后重试。" />
    <template v-else>
      <AdminTable :columns="columns" :rows="pagedGroups">
        <template #cell-group_id="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate" :title="displayValue(row.group_id || row.id)">{{ displayValue(row.group_id || row.id) }}</strong>
            <small v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.orderNo}`" :title="member.orderNo">
              {{ member.orderNo }}
            </small>
          </span>
        </template>
        <template #cell-route="{ row }">
          <span class="cell-stack" :title="[row.airport_code, row.airport_name, row.terminal_summary || row.terminal].filter(Boolean).join(' / ') || '--'">
            <StatusBadge tone="neutral">{{ serviceLabel(row.service_type) }}</StatusBadge>
            <strong class="cell-truncate">{{ displayValue(row.airport_code || row.airport_name) }}</strong>
            <small>{{ displayValue(row.terminal_summary || row.terminal) }}</small>
          </span>
        </template>
        <template #cell-service_time="{ row }">
          <span class="cell-stack">
            <strong>{{ formatDate(row.group_date) }}</strong>
            <small>{{ timeRangeLabel(row) }}</small>
          </span>
        </template>
        <template #cell-members="{ row }">
          <span class="cell-stack" :title="memberTitle(memberRows(row), 'studentName')">
            <strong v-for="member in memberRows(row)" :key="`${row.group_id || row.id}-${member.orderNo}-name`" class="cell-truncate">
              {{ member.studentName }}
            </strong>
            <small>{{ memberRows(row).length ? `共 ${memberRows(row).length} 名成员` : "暂无成员" }}</small>
          </span>
        </template>
        <template #cell-capacity="{ row }">
          <span class="cell-stack">
            <strong class="cell-truncate">{{ Number(row.current_passenger_count || 0) }} / {{ Number(row.max_passengers || 0) }} 人</strong>
            <small>{{ totalLuggage(row) }} 件行李</small>
          </span>
        </template>
        <template #cell-price="{ row }">
          <span class="cell-stack">
            <strong>{{ formatMoney(row.current_average_price_gbp || row.payment_summary?.average_price_gbp) }}</strong>
            <small>总价 {{ formatMoney(totalPrice(row)) }}</small>
          </span>
        </template>
        <template #cell-payment_status="{ row }">
          <span class="cell-stack">
            <StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge>
            <StatusBadge :tone="offlineSummary(row) === '全部已记录' ? 'success' : 'neutral'">{{ offlineSummary(row) }}</StatusBadge>
          </span>
        </template>
        <template #cell-dispatch_readiness="{ row }">
          <span class="dispatch-readiness-list">
            <StatusBadge v-for="item in readinessItems(row)" :key="`${row.group_id || row.id}-${item.key}`" :tone="item.tone">
              {{ item.label }}
            </StatusBadge>
            <small v-if="riskItems(row).length" class="dispatch-risk-inline">风险：{{ riskSummary(row) }}</small>
          </span>
        </template>
        <template #cell-visibility="{ row }">
          <span class="cell-stack">
            <StatusBadge :tone="visibleTone(row.visible_on_frontend)">{{ visibleLabel(row.visible_on_frontend) }}</StatusBadge>
            <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
            <StatusBadge :tone="dispatchStatusTone(row.dispatch_status)">{{ dispatchStatusLabel(row.dispatch_status) }}</StatusBadge>
          </span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <a v-if="groupHref(row)" class="table-action-button" :href="groupHref(row)">查看详情</a>
            <button v-else class="table-action-button" type="button" @click="notice = '未找到可打开的拼车组详情。'">查看详情</button>
            <button class="table-action-button" type="button" @click="copyDriverSummary(row)">复制司机摘要</button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
