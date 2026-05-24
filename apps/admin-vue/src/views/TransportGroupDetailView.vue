<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import {
  fetchTransportGroup,
  updateTransportGroup,
  updateTransportRequest,
  updateTransportRequestSafeFields
} from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import BackButton from "@/components/BackButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const group = ref(null);
const loading = ref(false);
const savingGroup = ref(false);
const savingMember = ref("");
const error = ref("");
const notice = ref("");
const summaryTextarea = ref(null);
const DISPATCH_SUMMARY_START = "[dispatch_summary_override]";
const DISPATCH_SUMMARY_END = "[/dispatch_summary_override]";

const form = reactive({
  max_passengers: 1,
  visible_on_frontend: false,
  notes: ""
});

const memberColumns = [
  { key: "order_no", label: "Order No", width: "9%" },
  { key: "student", label: "Member", width: "11%" },
  { key: "contact", label: "Phone / WeChat", width: "11%" },
  { key: "flight", label: "Flight / time", width: "15%" },
  { key: "terminal", label: "Terminal", width: "7%" },
  { key: "counts", label: "People / luggage", width: "9%" },
  { key: "location", label: "Address", width: "12%" },
  { key: "price", label: "Price ref.", width: "8%" },
  { key: "ops", label: "Record / status", width: "11%" },
  { key: "status", label: "Order status", width: "8%" },
  { key: "actions", label: "Actions", width: "112px", className: "is-actions", sticky: "end" }
];

const groupId = computed(() => String(route.params.id || "").trim());
const groupKey = computed(() => group.value?.group_id || group.value?.id || groupId.value);
const members = computed(() => {
  const rows = Array.isArray(group.value?.members) ? group.value.members : [];
  return rows.map(row => ({
    ...row,
    request: row.transport_requests || row.transport_request || row.request || row
  }));
});
const paymentSummary = computed(() => group.value?.payment_summary || {});
const riskItems = computed(() => Array.isArray(group.value?.dispatch_risks) ? group.value.dispatch_risks : []);
const currentPassengerCount = computed(() => Math.max(Number(group.value?.current_passenger_count || members.value.length || 0), 1));
const terminalSummary = computed(() => {
  const terminals = Array.from(new Set(members.value.map(row => String(row.request?.terminal || "").trim()).filter(Boolean)));
  return terminals.join(" / ") || group.value?.summary?.terminal_summary || group.value?.terminal || "--";
});
const dispatchSummary = computed(() => buildDispatchSummary());

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function datePart(value) {
  return value ? String(value).slice(0, 10) : "";
}

function formatDate(value) {
  const text = datePart(value);
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

function money(value) {
  if (value === null || value === undefined || value === "") return "--";
  const amount = Number(value);
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : displayValue(value);
}

function serviceLabel(serviceType = group.value?.service_type) {
  if (serviceType === "dropoff") return "送机";
  if (serviceType === "pickup") return "接机";
  return displayValue(serviceType);
}

function statusLabel(status) {
  const labels = {
    single_member: "拼车中",
    active: "拼车中",
    open: "拼车中",
    grouped: "已拼车",
    full: "已满员",
    closed: "已关闭",
    cancelled: "已取消",
    canceled: "已取消",
    published: "有效单",
    matched: "已拼车"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "full" || status === "paid" || status === "published" || status === "matched") return "success";
  if (status === "closed" || status === "cancelled" || status === "canceled") return "neutral";
  return "warning";
}

function contactLabel(value) {
  return value === "contacted" ? "已联系" : "未联系";
}

function contactTone(value) {
  return value === "contacted" ? "success" : "warning";
}

function paymentCollectionLabel(value) {
  const labels = {
    unpaid: "未收款",
    deposit_paid: "已收定金",
    fully_paid: "已付清",
    paid: "已付款",
    pending: "待确认",
    waived: "已免除"
  };
  return labels[value] || displayValue(value);
}

function paymentCollectionTone(value) {
  return ["fully_paid", "paid", "waived"].includes(String(value || "")) ? "success" : "warning";
}

function paymentStatus(row) {
  const direct = String(row.payment_status || row.request?.manual_payment_status || row.request?.payment_status || "").trim().toLowerCase();
  if (direct) return direct === "waived" ? "paid" : direct;
  const match = String(row.request?.admin_note || "").match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function paymentLabel(row) {
  const collection = row.request?.payment_collection_status;
  if (collection) return paymentCollectionLabel(collection);
  return paymentStatus(row) === "paid" ? "已付款" : "未付款";
}

function paymentTone(row) {
  const collection = row.request?.payment_collection_status;
  if (collection) return paymentCollectionTone(collection);
  return paymentStatus(row) === "paid" ? "success" : "warning";
}

function requestId(row) {
  return row.request?.id || row.request_id || row.transport_request_id || "";
}

function memberAddress(row) {
  const request = row.request || {};
  return group.value?.service_type === "dropoff"
    ? request.location_from || request.location_to
    : request.location_to || request.location_from;
}

function memberPrice(row) {
  const request = row.request || {};
  return request.confirmed_price_gbp ?? request.manual_price_gbp ?? request.deposit_amount_gbp ?? "";
}

function totalPrice() {
  const direct = paymentSummary.value.total_price_gbp;
  if (direct !== null && direct !== undefined && direct !== "") return direct;
  const average = Number(paymentSummary.value.average_price_gbp || group.value?.current_average_price_gbp || 0);
  const people = Number(group.value?.current_passenger_count || 0);
  return average && people ? average * people : "";
}

function totalLuggage() {
  return Number(group.value?.luggage_summary?.total_luggage_count || 0);
}

function visibleTone(value) {
  return value ? "success" : "neutral";
}

function visibleLabel(value) {
  return value ? "前台显示" : "前台隐藏";
}

function riskTone() {
  return riskItems.value.length ? "warning" : "success";
}

function extractDispatchSummaryOverride(notes) {
  const text = String(notes || "");
  const start = text.indexOf(DISPATCH_SUMMARY_START);
  const end = text.indexOf(DISPATCH_SUMMARY_END);
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start + DISPATCH_SUMMARY_START.length, end).trim();
  }
  return text.trim().startsWith("派单信息") ? text.trim() : "";
}

function stripDispatchSummaryOverride(notes) {
  const text = String(notes || "");
  if (text.trim().startsWith("派单信息")) return "";
  if (!text.includes(DISPATCH_SUMMARY_START) || !text.includes(DISPATCH_SUMMARY_END)) {
    return text.trim();
  }
  return text
    .replace(new RegExp(`\\s*${DISPATCH_SUMMARY_START}[\\s\\S]*?${DISPATCH_SUMMARY_END}\\s*`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergeNotesWithDispatchSummary(notes, overrideText) {
  const cleanNotes = stripDispatchSummaryOverride(notes);
  const cleanOverride = String(overrideText || "").trim();
  if (!cleanOverride) return cleanNotes || null;
  return [cleanNotes, `${DISPATCH_SUMMARY_START}\n${cleanOverride}\n${DISPATCH_SUMMARY_END}`]
    .filter(Boolean)
    .join("\n\n");
}

function buildDispatchSummary() {
  if (!group.value) return "";
  const rows = members.value;
  const timeRange = group.value.summary?.arrival_time_range || group.value.arrival_range || {};
  const serviceTime = timeRange.earliest && timeRange.latest
    ? `${formatDateTime(timeRange.earliest)} - ${formatDateTime(timeRange.latest)}`
    : formatDateTime(group.value.preferred_time_start || group.value.flight_time_reference || group.value.group_date);
  const airport = [group.value.airport_code, group.value.airport_name].filter(Boolean).join(" / ") || "--";
  const memberLines = rows.map((row, index) => {
    const request = row.request || {};
    return [
      `${index + 1}. ${request.student_name || "--"}`,
      `电话: ${request.phone || "--"}`,
      `微信: ${request.wechat || "--"}`,
      `航班号: ${request.flight_no || "--"}`,
      `航班时间: ${formatDateTime(request.flight_datetime || request.preferred_time_start)}`,
      `航站楼: ${request.terminal || "--"}`,
      `地址: ${memberAddress(row) || "--"}`,
      `付款状态: ${paymentLabel(row)}`,
      `是否已联系: ${contactLabel(request.contact_status)}`,
      `是否已线下记录: ${request.offline_recorded ? "已记录" : "未记录"}`
    ].join("；");
  }).join("\n");

  return [
    "司机派单摘要",
    "",
    `Group ID: ${group.value.group_id || group.value.id || "--"}`,
    `服务类型: ${serviceLabel(group.value.service_type)}`,
    `服务日期: ${formatDate(group.value.group_date)}`,
    `服务时间: ${serviceTime}`,
    `机场 / 航站楼: ${airport} / ${terminalSummary.value}`,
    `当前人数 / 容量: ${Number(group.value.current_passenger_count || 0)} / ${Number(group.value.max_passengers || 0)}`,
    `总行李数: ${totalLuggage()}`,
    `当前人均价 / 总价: ${money(paymentSummary.value.average_price_gbp || group.value.current_average_price_gbp)} / ${money(totalPrice())}`,
    "",
    "乘客信息:",
    memberLines || "暂无乘客",
    "",
    `组备注 / 司机备注 / 调度备注: ${stripDispatchSummaryOverride(group.value.notes) || "--"}`
  ].join("\n");
}

function fillForm(record) {
  form.max_passengers = Number(record?.max_passengers || currentPassengerCount.value);
  form.visible_on_frontend = Boolean(record?.visible_on_frontend);
  form.notes = extractDispatchSummaryOverride(record?.notes) || buildDispatchSummary();
}

async function loadGroup() {
  if (!groupId.value) {
    error.value = "缺少拼车组 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const payload = await fetchTransportGroup(groupId.value);
    group.value = payload?.group || payload?.item || payload;
    fillForm(group.value);
  } catch (err) {
    group.value = null;
    error.value = err.message || "拼车组详情加载失败。";
  } finally {
    loading.value = false;
  }
}

async function saveGroupDispatchFields() {
  if (!group.value || savingGroup.value) return;
  const nextCapacity = Number(form.max_passengers || 0);
  if (!Number.isInteger(nextCapacity) || nextCapacity < currentPassengerCount.value) {
    notice.value = `最大人数不能小于当前已入组人数 ${currentPassengerCount.value}。`;
    return;
  }
  if (!window.confirm(`确认将拼车组最大人数调整为 ${nextCapacity} 吗？此操作只修改组容量，不修改订单人数或成员关系。`)) {
    return;
  }
  if (nextCapacity === currentPassengerCount.value && form.visible_on_frontend && window.confirm("最大人数已等于当前人数，是否同时关闭前台展示？")) {
    form.visible_on_frontend = false;
  }
  savingGroup.value = true;
  notice.value = "";
  try {
    await updateTransportGroup(groupKey.value, {
      max_passengers: nextCapacity,
      visible_on_frontend: Boolean(form.visible_on_frontend),
      notes: mergeNotesWithDispatchSummary(group.value.notes, form.notes)
    });
    await loadGroup();
    notice.value = "调度备注和前台显示状态已保存。";
  } catch (err) {
    notice.value = err.message || "保存调度信息失败。";
  } finally {
    savingGroup.value = false;
  }
}

function resetSummary() {
  form.notes = dispatchSummary.value;
}

async function copySummary() {
  const text = form.notes || dispatchSummary.value || "";
  try {
    await navigator.clipboard.writeText(text);
    notice.value = "司机派单摘要已复制。";
  } catch (err) {
    if (summaryTextarea.value) {
      summaryTextarea.value.focus();
      summaryTextarea.value.select();
    } else {
      window.prompt("复制失败，请手动复制以下司机派单摘要：", text);
    }
    notice.value = "浏览器限制了自动复制，请手动复制已选中的司机摘要。";
  }
}

async function toggleOfflineRecorded(row) {
  const id = requestId(row);
  if (!id || savingMember.value) return;
  savingMember.value = id;
  notice.value = "";
  try {
    await updateTransportRequest(id, {
      offline_recorded: !Boolean(row.request?.offline_recorded)
    });
    await loadGroup();
    notice.value = "线下记录状态已更新。";
  } catch (err) {
    notice.value = err.message || "线下记录状态更新失败。";
  } finally {
    savingMember.value = "";
  }
}

async function markContacted(row) {
  const id = requestId(row);
  if (!id || savingMember.value) return;
  savingMember.value = id;
  notice.value = "";
  try {
    await updateTransportRequestSafeFields(id, {
      contact_status: row.request?.contact_status === "contacted" ? "uncontacted" : "contacted"
    });
    await loadGroup();
    notice.value = "联系状态已更新。";
  } catch (err) {
    notice.value = err.message || "联系状态更新失败。";
  } finally {
    savingMember.value = "";
  }
}

onMounted(loadGroup);
</script>

<template>
  <section class="transport-group-detail-view transport-legacy-detail">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport dispatch ? P6A</p>
        <h2>???????</h2>
        <p>??????????????????????????????</p>
      </div>
      <div class="view-heading__actions">
        <BackButton href="/admin/transport/groups" label="???????" />
        <a class="secondary-button" href="/admin/transport/requests">?????????</a>
      </div>
    </div>

    <LoadingState v-if="loading">?????????...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!group" title="??????" description="????????????" />
    <template v-else>
      <p class="transport-current-group-hint">??????{{ displayValue(group.group_id || group.id) }}</p>
      <p v-if="notice" class="inline-notice">{{ notice }}</p>

      <section class="admin-panel transport-detail-panel">
        <h3>????</h3>
        <p class="detail-muted">?????????????????????????????????????????? P5 ???????</p>
        <div class="transport-summary-strip">
          <span>Group ID <strong>{{ displayValue(group.group_id || group.id) }}</strong></span>
          <span>???? <StatusBadge tone="neutral">{{ serviceLabel(group.service_type) }}</StatusBadge></span>
          <span>??? <StatusBadge :tone="statusTone(group.status)">{{ statusLabel(group.status) }}</StatusBadge></span>
          <span>???? <StatusBadge :tone="visibleTone(group.visible_on_frontend)">{{ visibleLabel(group.visible_on_frontend) }}</StatusBadge></span>
          <span>?? <strong>{{ displayValue(group.airport_code) }} / {{ displayValue(group.airport_name) }}</strong></span>
          <span>??? <strong>{{ terminalSummary }}</strong></span>
          <span>???? <strong>{{ formatDate(group.group_date) }}</strong></span>
          <span>???? <strong>{{ formatDateTime(group.summary?.arrival_time_range?.earliest || group.preferred_time_start || group.flight_time_reference) }} - {{ formatDateTime(group.summary?.arrival_time_range?.latest || group.preferred_time_end || group.flight_time_reference) }}</strong></span>
          <span>???? / ?? <strong>{{ Number(group.current_passenger_count || 0) }} / {{ Number(group.max_passengers || 0) }}</strong></span>
          <span>?? <strong>{{ totalLuggage() }} ?</strong></span>
          <span>???? <strong>{{ money(paymentSummary.average_price_gbp || group.current_average_price_gbp) }}</strong></span>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>??????</h3>
        <div class="dispatch-risk-list">
          <StatusBadge :tone="riskTone()">{{ riskItems.length ? riskItems.length + ' ???' : '?????' }}</StatusBadge>
          <span v-for="risk in riskItems" :key="risk.code" class="dispatch-risk-chip">{{ risk.label }}</span>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <div class="transport-panel-header">
          <div>
            <h3>????</h3>
            <p class="detail-muted">???????????????????????????????</p>
          </div>
          <button class="table-action-button" type="button" :disabled="savingGroup" @click="saveGroupDispatchFields">
            {{ savingGroup ? "???..." : "??????" }}
          </button>
        </div>
        <div class="dispatch-control-grid">
          <label>
            <span>???? / ????</span>
            <input v-model.number="form.max_passengers" type="number" :min="currentPassengerCount" max="9" />
          </label>
          <label>
            <span>??????</span>
            <select v-model="form.visible_on_frontend">
              <option :value="true">??</option>
              <option :value="false">??</option>
            </select>
          </label>
          <label class="dispatch-control-grid__wide">
            <span>??? / ???? / ????</span>
            <textarea v-model="form.notes" rows="8"></textarea>
          </label>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>??????</h3>
        <p class="detail-muted">??????????????????????????????????????? P5 ?????</p>
        <AdminTable v-if="members.length" :columns="memberColumns" :rows="members">
          <template #cell-order_no="{ row }"><strong class="cell-truncate">{{ displayValue(row.request?.order_no || row.order_no) }}</strong></template>
          <template #cell-student="{ row }"><span class="cell-stack"><strong class="cell-truncate">{{ displayValue(row.request?.student_name || row.student_name) }}</strong><small>{{ row.is_initiator ? "???" : "??" }}</small></span></template>
          <template #cell-contact="{ row }"><span class="cell-stack"><strong>{{ displayValue(row.request?.phone || row.phone) }}</strong><small>{{ displayValue(row.request?.wechat || row.wechat) }}</small></span></template>
          <template #cell-flight="{ row }"><span class="cell-stack"><strong>{{ displayValue(row.request?.flight_no || row.flight_no) }}</strong><small>{{ formatDateTime(row.request?.flight_datetime || row.flight_datetime) }}</small><small>{{ displayValue(row.request?.airport_code || row.airport_code) }}</small></span></template>
          <template #cell-terminal="{ row }"><span>{{ displayValue(row.request?.terminal || row.terminal) }}</span></template>
          <template #cell-counts="{ row }"><span class="cell-stack"><strong>{{ Number(row.request?.passenger_count || row.passenger_count_snapshot || 0) }} ?</strong><small>{{ Number(row.request?.luggage_count || row.luggage_count_snapshot || 0) }} ???</small></span></template>
          <template #cell-location="{ row }"><span class="cell-truncate" :title="displayValue(memberAddress(row))">{{ displayValue(memberAddress(row)) }}</span></template>
          <template #cell-price="{ row }"><span class="cell-stack"><strong>{{ money(memberPrice(row)) }}</strong><small>??? {{ money(row.member_surcharge_gbp || 0) }}</small></span></template>
          <template #cell-ops="{ row }"><span class="cell-stack"><StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge><StatusBadge :tone="row.request?.offline_recorded ? 'success' : 'neutral'">{{ row.request?.offline_recorded ? "???" : "???" }}</StatusBadge><StatusBadge :tone="contactTone(row.request?.contact_status)">{{ contactLabel(row.request?.contact_status) }}</StatusBadge></span></template>
          <template #cell-status="{ row }"><StatusBadge :tone="statusTone(row.request?.status)">{{ statusLabel(row.request?.status) }}</StatusBadge></template>
          <template #cell-actions="{ row }"><div class="table-action-group table-action-group--compact"><button class="table-action-button" type="button" :disabled="savingMember === requestId(row)" @click="toggleOfflineRecorded(row)">{{ row.request?.offline_recorded ? "????" : "????" }}</button><button class="table-action-button" type="button" :disabled="savingMember === requestId(row)" @click="markContacted(row)">{{ row.request?.contact_status === "contacted" ? "????" : "?????" }}</button></div></template>
        </AdminTable>
        <p v-else class="detail-muted">???????</p>
      </section>

      <section class="admin-panel transport-detail-panel">
        <div class="transport-panel-header">
          <div>
            <h3>??????</h3>
            <p class="detail-muted">????????????????????</p>
          </div>
          <div class="view-heading__actions">
            <button class="table-action-button" type="button" @click="copySummary">????</button>
            <button class="table-action-button" type="button" @click="resetSummary">??????</button>
          </div>
        </div>
        <textarea ref="summaryTextarea" v-model="form.notes" class="transport-dispatch-summary-editor" rows="18"></textarea>
      </section>
    </template>
  </section>
</template>
