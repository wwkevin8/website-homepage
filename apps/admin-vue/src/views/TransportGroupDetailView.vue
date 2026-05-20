<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute } from "vue-router";
import {
  fetchTransportGroup,
  fetchTransportRequests,
  saveTransportGroupMembers,
  updateTransportGroup,
  updateTransportRequest
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
const savingMax = ref(false);
const savingTime = ref(false);
const savingSummary = ref(false);
const memberSaving = ref("");
const paymentSaving = ref("");
const error = ref("");
const notice = ref("");
const addOrderNo = ref("");
const DISPATCH_SUMMARY_START = "[dispatch_summary_override]";
const DISPATCH_SUMMARY_END = "[/dispatch_summary_override]";

const form = reactive({
  max_passengers: 5,
  preferred_time_start: "",
  notes: ""
});

const memberColumns = [
  { key: "order_no", label: "Order No", width: "10%" },
  { key: "student", label: "姓名 / 角色", width: "12%" },
  { key: "status", label: "订单状态", width: "8%" },
  { key: "contact", label: "联系方式", width: "12%" },
  { key: "flight", label: "机场 / 航班 / 落地时间", width: "16%" },
  { key: "terminal", label: "航站楼", width: "7%" },
  { key: "luggage", label: "行李", width: "10%" },
  { key: "location", label: "目的地", width: "12%" },
  { key: "surcharge", label: "附加费", width: "7%" },
  { key: "payment", label: "付款状态", width: "8%" },
  { key: "joined_at", label: "加入时间", width: "10%" },
  { key: "actions", label: "操作", width: "150px", className: "is-actions", sticky: "end" }
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
const paidMembers = computed(() => members.value.filter(row => paymentStatus(row) === "paid"));
const paymentSummary = computed(() => group.value?.payment_summary || {});
const terminalSummary = computed(() => {
  const terminals = Array.from(new Set(members.value.map(row => String(row.request?.terminal || "").trim()).filter(Boolean)));
  return terminals.join(" / ") || group.value?.summary?.terminal_summary || group.value?.terminal || "--";
});
const serviceTimeLabel = computed(() => `${serviceLabel(group.value?.service_type)}时间`);
const autoDispatchSummary = computed(() => buildDispatchSummary());

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function datePart(value) {
  return value ? String(value).slice(0, 10) : "";
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
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
  return `£${Number(value || 0).toFixed(2)}`;
}

function compactDateTime(value) {
  const formatted = formatDateTime(value);
  return formatted === "--" ? formatted : String(formatted).replace(",", "");
}

function dispatchServiceDate(value) {
  if (!value) return "--";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "--";
  const year = String(parsed.getFullYear()).slice(-2);
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  return `${year}年${month}月${day}日`;
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
  if (status === "full" || status === "paid" || status === "confirmed" || status === "published" || status === "matched") return "success";
  if (status === "closed" || status === "cancelled" || status === "canceled") return "neutral";
  return "warning";
}

function paymentStatus(row) {
  const direct = String(row.payment_status || row.request?.payment_status || "").trim().toLowerCase();
  if (direct) return direct;
  const match = String(row.request?.admin_note || "").match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function paymentLabel(row) {
  return paymentStatus(row) === "paid" ? "已付款" : "未付款";
}

function paymentTone(row) {
  return paymentStatus(row) === "paid" ? "success" : "warning";
}

function requestId(row) {
  return row.request?.id || row.request_id || row.transport_request_id || "";
}

function requestDetailHref(row) {
  const id = requestId(row);
  return id ? `/admin/transport/requests/${encodeURIComponent(id)}?return_to=${encodeURIComponent(`/admin/transport/groups/${groupId.value}`)}` : "";
}

function fillForm(record) {
  form.max_passengers = Number(record?.max_passengers || 5);
  form.preferred_time_start = toDatetimeLocal(record?.preferred_time_start || record?.flight_time_reference || record?.group_date);
  form.notes = extractDispatchSummaryOverride(record?.notes) || buildDispatchSummary(record);
}

function withPaymentMarker(adminNote, status) {
  const cleanedNote = String(adminNote || "").replace(/\[payment:(paid|unpaid)\]\s*/gi, "").trim();
  const marker = `[payment:${status}]`;
  return cleanedNote ? `${marker}\n${cleanedNote}` : marker;
}

function memberLuggage(row) {
  const request = row.request || {};
  const noteText = String(request.notes || "");
  const luggageMatch = noteText.match(/行李[:：]\s*([^|]+)/);
  return luggageMatch?.[1]?.trim() || `${Number(request.luggage_count || row.luggage_count_snapshot || 0)} 件`;
}

function parseLuggageTextFromNotes(notes) {
  const luggageMatch = String(notes || "").match(/行李[:：]\s*([^|]+)/);
  return luggageMatch?.[1]?.trim() || "";
}

function parseLuggageCounts(text, fallbackCount = 0) {
  const raw = String(text || "").trim();
  const bigMatch = raw.match(/(\d+)\s*大/);
  const smallMatch = raw.match(/(\d+)\s*小/);
  const big = bigMatch ? Number.parseInt(bigMatch[1], 10) || 0 : 0;
  const small = smallMatch ? Number.parseInt(smallMatch[1], 10) || 0 : 0;
  if (big || small) return { big, small, parsed: true };
  const count = Number(fallbackCount || 0);
  return { big: count, small: 0, parsed: false };
}

function formatLuggageCounts(big, small) {
  return `${Number(big || 0)}大${Number(small || 0)}小`;
}

function memberLuggageSummary(request, row) {
  const luggageText = parseLuggageTextFromNotes(request?.notes);
  const counts = parseLuggageCounts(luggageText, request?.luggage_count || row?.luggage_count_snapshot || 0);
  return {
    big: counts.big,
    small: counts.small
  };
}

function resolveGroupPickupTime(sourceGroup) {
  if (!sourceGroup || typeof sourceGroup !== "object") return null;
  return sourceGroup.preferred_time_start
    || sourceGroup.flight_time_reference
    || sourceGroup.summary?.arrival_time_range?.earliest
    || sourceGroup.arrival_range?.earliest
    || null;
}

function extractDispatchSummaryOverride(notes) {
  const text = String(notes || "");
  const start = text.indexOf(DISPATCH_SUMMARY_START);
  const end = text.indexOf(DISPATCH_SUMMARY_END);
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start + DISPATCH_SUMMARY_START.length, end).trim();
  }
  return text.trim().startsWith("车服信息") ? text.trim() : "";
}

function stripDispatchSummaryOverride(notes) {
  const text = String(notes || "");
  if (text.trim().startsWith("车服信息")) return "";
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

function buildDispatchSummary(sourceGroup = group.value) {
  if (!sourceGroup) return "";
  const summary = sourceGroup.summary || sourceGroup;
  const rows = Array.isArray(sourceGroup.members) ? sourceGroup.members : members.value;
  const normalizedRows = rows.map(row => ({ ...row, request: row.transport_requests || row.transport_request || row.request || row }));
  const payment = sourceGroup.payment_summary || paymentSummary.value || {};
  const isDropoff = sourceGroup.service_type === "dropoff";
  const service = isDropoff ? "送机" : "接机";
  const serviceDate = dispatchServiceDate(resolveGroupPickupTime(sourceGroup) || sourceGroup.group_date);
  const airport = sourceGroup.airport_name || sourceGroup.airport_code || "--";
  const terminalList = Array.from(new Set(normalizedRows.map(row => String(row.request?.terminal || "").trim()).filter(Boolean)));
  const terminal = terminalList.join(" / ") || sourceGroup.terminal || summary.terminal_summary || "--";
  const flightLines = normalizedRows.map((row, index) => {
    const request = row.request || {};
    return `（${index + 1}）${airport}\t${request.terminal || "--"}\t${request.flight_no || "--"}\t${compactDateTime(request.flight_datetime)}`;
  }).join("\n") || "暂无航班信息";
  const contactLines = normalizedRows.map((row, index) => {
    const request = row.request || {};
    return `（${index + 1}）${request.student_name || "--"} 电话：${request.phone || "--"} 微信：${request.wechat || "--"} ${paymentLabel(row)}`;
  }).join("\n") || "暂无成员";
  const memberLuggageTotals = normalizedRows.reduce((sum, row) => {
    const request = row.request || {};
    const luggage = memberLuggageSummary(request, row);
    return {
      big: sum.big + luggage.big,
      small: sum.small + luggage.small
    };
  }, { big: 0, small: 0 });
  const addressLabel = isDropoff ? "出发地" : "地址";
  const addressLines = normalizedRows.map((row, index) => {
    const request = row.request || {};
    const address = isDropoff ? request.location_from : request.location_to;
    return `（${index + 1}）${address || "--"}`;
  }).join("\n") || (isDropoff ? "暂无出发地" : "暂无地址");
  const crossTerminalText = summary.has_cross_terminal || sourceGroup.has_cross_terminal
    ? `有，多航站楼加价 ${money(payment.cross_terminal_surcharge_total_gbp || 0)}`
    : "无";
  return `车服信息

1，用车类型和时间：${serviceDate}${service}${terminal}

2，航班信息：
${flightLines}

3，价格（有无多航站楼）：
人均 ${money(payment.average_price_gbp || 0)}；总价 ${money(payment.total_price_gbp || 0)}；多航站楼：${crossTerminalText}

4，几位和联系电话（以及付款情况）：
${contactLines}

5，行李：默认2大1小/人，总计：${formatLuggageCounts(memberLuggageTotals.big, memberLuggageTotals.small)}

6，${addressLabel}：
${addressLines}

7，司机：
`;
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

async function saveMaxPassengers() {
  if (!group.value || savingMax.value) return;
  const currentCount = Number(group.value.current_passenger_count || members.value.length || 0);
  if (Number(form.max_passengers || 0) < Math.max(currentCount, 1)) {
    notice.value = `最大人数不能小于当前拼车人数 ${currentCount}。`;
    return;
  }
  savingMax.value = true;
  notice.value = "";
  try {
    await updateTransportGroup(groupKey.value, { max_passengers: Number(form.max_passengers || 1) });
    await loadGroup();
    notice.value = "最大人数已保存。";
  } catch (err) {
    notice.value = err.message || "保存最大人数失败。";
  } finally {
    savingMax.value = false;
  }
}

async function saveServiceTime() {
  if (!group.value || savingTime.value) return;
  if (!form.preferred_time_start) {
    notice.value = `请先填写${serviceTimeLabel.value}。`;
    return;
  }
  savingTime.value = true;
  notice.value = "";
  try {
    await updateTransportGroup(groupKey.value, {
      preferred_time_start: form.preferred_time_start,
      group_date: datePart(form.preferred_time_start) || group.value.group_date
    });
    await loadGroup();
    notice.value = `${serviceTimeLabel.value}已保存。`;
  } catch (err) {
    notice.value = err.message || `保存${serviceTimeLabel.value}失败。`;
  } finally {
    savingTime.value = false;
  }
}

async function saveSummary() {
  if (!group.value || savingSummary.value) return;
  savingSummary.value = true;
  notice.value = "";
  try {
    await updateTransportGroup(groupKey.value, {
      notes: mergeNotesWithDispatchSummary(group.value.notes, form.notes)
    });
    await loadGroup();
    notice.value = "司机派单摘要已保存。";
  } catch (err) {
    notice.value = err.message || "保存司机派单摘要失败。";
  } finally {
    savingSummary.value = false;
  }
}

function resetSummary() {
  form.notes = autoDispatchSummary.value;
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(form.notes || "");
    notice.value = "司机派单摘要已复制。";
  } catch (err) {
    notice.value = "复制失败，请手动选择摘要内容复制。";
  }
}

async function markPayment(row, status) {
  const id = requestId(row);
  if (!id || paymentSaving.value) return;
  paymentSaving.value = id;
  notice.value = "";
  try {
    await updateTransportRequest(id, {
      admin_note: withPaymentMarker(row.request?.admin_note, status)
    });
    await loadGroup();
    notice.value = status === "paid" ? "已标记付款。" : "已取消付款标记。";
  } catch (err) {
    notice.value = err.message || "付款状态保存失败。";
  } finally {
    paymentSaving.value = "";
  }
}

async function removeMember(row) {
  const id = requestId(row);
  if (!id || memberSaving.value) return;
  const name = row.request?.student_name || row.request?.order_no || id;
  if (!window.confirm(`确定将 ${name} 移出当前拼车组吗？`)) return;
  memberSaving.value = id;
  notice.value = "";
  try {
    const remainingIds = members.value.map(item => requestId(item)).filter(item => item && item !== id);
    await saveTransportGroupMembers(groupKey.value, remainingIds);
    await loadGroup();
    notice.value = "成员已移出拼车组。";
  } catch (err) {
    notice.value = err.message || "移出成员失败，请稍后重试。";
  } finally {
    memberSaving.value = "";
  }
}

async function addMemberByOrderNo() {
  const orderNo = String(addOrderNo.value || "").trim().toUpperCase();
  if (!orderNo || memberSaving.value) return;
  memberSaving.value = "add";
  notice.value = "";
  try {
    const payload = await fetchTransportRequests({ order_no: orderNo });
    const rows = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    const request = rows.find(item => String(item.order_no || "").toUpperCase() === orderNo) || rows[0];
    if (!request?.id) {
      notice.value = `未找到订单 ${orderNo}。`;
      return;
    }
    const nextIds = Array.from(new Set([...members.value.map(item => requestId(item)).filter(Boolean), request.id]));
    await saveTransportGroupMembers(groupKey.value, nextIds);
    addOrderNo.value = "";
    await loadGroup();
    notice.value = `订单 ${orderNo} 已加入当前拼车组。`;
  } catch (err) {
    notice.value = err.message || "加入成员失败，请检查订单是否同服务类型、同机场且未超人数。";
  } finally {
    memberSaving.value = "";
  }
}

onMounted(loadGroup);
</script>

<template>
  <section class="transport-group-detail-view transport-legacy-detail">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">运营后台</p>
        <h2>拼车组详情</h2>
        <p>按 group_id 查看组概要、费用与付款、加入成员和组内成员。</p>
      </div>
      <div class="view-heading__actions">
        <BackButton href="/admin/transport/groups" label="返回拼车组管理" />
        <a class="secondary-button" href="/admin/transport/requests">查看登记接送机订单</a>
      </div>
    </div>

    <LoadingState v-if="loading">正在加载拼车组详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!group" title="未找到拼车组" description="请从拼车组列表重新进入。" />
    <template v-else>
      <p class="transport-current-group-hint">当前拼车组：{{ displayValue(group.group_id || group.id) }}</p>
      <p v-if="notice" class="inline-notice">{{ notice }}</p>

      <section class="admin-panel transport-detail-panel">
        <h3>组概要</h3>
        <p class="detail-muted">这里展示当前拼车组的关键消息，可直接修改接送时间和最大人数。</p>
        <div class="transport-summary-strip">
          <span>创建时间 <strong>{{ formatDateTime(group.created_at) }}</strong></span>
          <span>Group ID <strong>{{ displayValue(group.group_id || group.id) }}</strong></span>
          <span>服务类型 <StatusBadge tone="neutral">{{ serviceLabel(group.service_type) }}</StatusBadge></span>
          <span>当前拼车人数 <strong>{{ Number(group.current_passenger_count || members.length || 0) }}</strong></span>
          <label>
            <span>最大人数</span>
            <input v-model.number="form.max_passengers" :disabled="savingMax" type="number" min="1" max="9" />
            <button class="table-action-button" type="button" :disabled="savingMax" @click="saveMaxPassengers">
              {{ savingMax ? "保存中..." : "保存" }}
            </button>
          </label>
          <span>机场 <strong>{{ displayValue(group.airport_code) }} · {{ displayValue(group.airport_name) }}</strong></span>
          <span>航站楼情况 <strong>{{ terminalSummary }}</strong></span>
          <label>
            <span>{{ serviceTimeLabel }}</span>
            <input v-model="form.preferred_time_start" :disabled="savingTime" type="datetime-local" />
            <button class="table-action-button" type="button" :disabled="savingTime" @click="saveServiceTime">
              {{ savingTime ? "保存中..." : "保存" }}
            </button>
          </label>
          <span>最近更新时间 <strong>{{ formatDateTime(group.updated_at) }}</strong></span>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>费用与付款</h3>
        <p class="detail-muted">这里显示总价、人均金额，以及组内成员的付款状态。</p>
        <div class="group-payment-cards">
          <article class="group-payment-card group-payment-card--highlight">
            <span>总价</span>
            <strong>{{ money(paymentSummary.total_price_gbp) }}</strong>
          </article>
          <article class="group-payment-card">
            <span>跨航站楼</span>
            <strong>{{ money(paymentSummary.cross_terminal_surcharge_total_gbp) }}</strong>
          </article>
          <article class="group-payment-card">
            <span>当前人均价</span>
            <strong>{{ money(paymentSummary.average_price_gbp) }}</strong>
          </article>
        </div>
        <div class="member-payment-list">
          <div v-for="row in members" :key="requestId(row)" class="member-payment-row">
            <span>
              <strong>{{ displayValue(row.request?.student_name) }}</strong>
              <small>{{ displayValue(row.request?.order_no) }}</small>
            </span>
            <div class="member-payment-row__actions">
              <StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge>
              <button
                class="table-action-button"
                type="button"
                :disabled="paymentSaving === requestId(row)"
                @click="markPayment(row, paymentStatus(row) === 'paid' ? 'unpaid' : 'paid')"
              >
                {{ paymentStatus(row) === "paid" ? "标记未付款" : "标记已付款" }}
              </button>
            </div>
          </div>
          <p v-if="!members.length" class="detail-muted">暂无成员付款状态。</p>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>组内成员列表</h3>
        <p class="detail-muted">这里按成员展示 order_no、initiator、状态、联系方式、航班、行李、付款状态和可执行操作。</p>
        <AdminTable v-if="members.length" :columns="memberColumns" :rows="members">
          <template #cell-order_no="{ row }">
            <strong class="cell-truncate">{{ displayValue(row.request?.order_no || row.order_no) }}</strong>
          </template>
          <template #cell-student="{ row }">
            <span class="cell-stack">
              <strong class="cell-truncate">{{ displayValue(row.request?.student_name || row.student_name) }}</strong>
              <small>{{ row.is_initiator ? "发起人" : "成员" }}</small>
            </span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(row.request?.status)">{{ statusLabel(row.request?.status) }}</StatusBadge>
          </template>
          <template #cell-contact="{ row }">
            <span class="cell-stack">
              <strong>{{ displayValue(row.request?.phone || row.phone) }}</strong>
              <small>{{ displayValue(row.request?.wechat || row.wechat) }}</small>
            </span>
          </template>
          <template #cell-flight="{ row }">
            <span class="cell-stack">
              <strong>{{ displayValue(row.request?.airport_code || row.airport_code) }}</strong>
              <small>{{ displayValue(row.request?.flight_no || row.flight_no) }}</small>
              <small>{{ formatDateTime(row.request?.flight_datetime || row.flight_datetime) }}</small>
            </span>
          </template>
          <template #cell-terminal="{ row }">
            <span>{{ displayValue(row.request?.terminal || row.terminal) }}</span>
          </template>
          <template #cell-luggage="{ row }">
            <span>{{ memberLuggage(row) }}</span>
          </template>
          <template #cell-location="{ row }">
            <span class="cell-truncate" :title="displayValue(row.request?.location_to || row.location_to)">
              {{ displayValue(row.request?.location_to || row.location_to) }}
            </span>
          </template>
          <template #cell-surcharge="{ row }">
            <span>{{ money(row.member_surcharge_gbp || 0) }}</span>
          </template>
          <template #cell-payment="{ row }">
            <StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge>
          </template>
          <template #cell-joined_at="{ row }">
            <span>{{ formatDateTime(row.joined_at || row.created_at) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <div class="table-action-group table-action-group--compact">
              <a v-if="requestDetailHref(row)" class="table-action-button" :href="requestDetailHref(row)">查看订单详情</a>
              <button class="table-action-button" type="button" disabled>更换拼车组</button>
              <button
                class="table-action-button table-action-button--danger"
                type="button"
                :disabled="memberSaving === requestId(row)"
                @click="removeMember(row)"
              >
                {{ memberSaving === requestId(row) ? "移出中..." : "移出" }}
              </button>
            </div>
          </template>
        </AdminTable>
        <p v-else class="detail-muted">暂无成员记录。</p>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>加入成员</h3>
        <form class="transport-force-assign-row" @submit.prevent="addMemberByOrderNo">
          <label>
            <span>按订单编号加入</span>
            <input v-model="addOrderNo" :disabled="memberSaving === 'add'" type="text" placeholder="输入 order_no" autocomplete="off" />
          </label>
          <button class="table-action-button" type="submit" :disabled="memberSaving === 'add' || !addOrderNo.trim()">
            {{ memberSaving === "add" ? "加入中..." : "加入拼车组" }}
          </button>
        </form>
      </section>

      <section class="admin-panel transport-detail-panel">
        <div class="transport-panel-header">
          <div>
            <h3>司机派单摘要</h3>
            <p class="detail-muted">这里按当前拼车组信息自动整理给司机的派单摘要。</p>
          </div>
          <div class="view-heading__actions">
            <button class="table-action-button" type="button" @click="copySummary">一键复制</button>
            <button class="table-action-button" type="button" @click="resetSummary">恢复自动生成</button>
            <button class="table-action-button" type="button" :disabled="savingSummary" @click="saveSummary">
              {{ savingSummary ? "保存中..." : "保存摘要" }}
            </button>
          </div>
        </div>
        <textarea v-model="form.notes" class="transport-dispatch-summary-editor" rows="18"></textarea>
      </section>
    </template>
  </section>
</template>
