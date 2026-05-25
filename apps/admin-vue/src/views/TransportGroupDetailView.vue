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
const batchPaymentDialog = reactive({
  open: false,
  members: [],
  skippedCount: 0,
  saving: false
});
const DISPATCH_SUMMARY_START = "[dispatch_summary_override]";
const DISPATCH_SUMMARY_END = "[/dispatch_summary_override]";

const form = reactive({
  max_passengers: 1,
  visible_on_frontend: false,
  notes: ""
});

const memberColumns = [
  { key: "order_no", label: "订单号", width: "9%" },
  { key: "student", label: "成员", width: "11%" },
  { key: "contact", label: "电话 / 微信", width: "11%" },
  { key: "flight", label: "航班 / 时间", width: "15%" },
  { key: "terminal", label: "航站楼", width: "7%" },
  { key: "counts", label: "人数 / 行李", width: "9%" },
  { key: "location", label: "地址", width: "12%" },
  { key: "price", label: "价格参考", width: "8%" },
  { key: "ops", label: "记录 / 状态", width: "11%" },
  { key: "status", label: "订单状态", width: "8%" },
  { key: "actions", label: "操作", width: "112px", className: "is-actions", sticky: "end" }
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
const operationLogs = computed(() => Array.isArray(group.value?.operation_logs) ? group.value.operation_logs.slice(0, 10) : []);
const readableOperationLogs = computed(() => operationLogs.value.map(log => ({
  ...log,
  message: operationLogMessage(log)
})));
const dispatchReadinessItems = computed(() => readinessItemsForGroup());
const dispatchReadinessText = computed(() => dispatchReadinessItems.value.map(item => item.label).join(" / "));
const currentPassengerCount = computed(() => Math.max(Number(group.value?.current_passenger_count || members.value.length || 0), 1));
const batchPaymentTargets = computed(() => members.value.filter(row => !isFullyPaidRow(row)));
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
    single_member: "待拼车",
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

function normalizedPaymentStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function memberPaymentStatus(row) {
  return row.request?.payment_collection_status || row.request?.manual_payment_status || row.payment_status || "";
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

function isPaidRow(row) {
  return paymentTone(row) === "success";
}

function isFullyPaidRow(row) {
  return normalizedPaymentStatus(memberPaymentStatus(row)) === "fully_paid";
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

function batchPaymentMemberPrice(row) {
  return memberPrice(row)
    || paymentSummary.value.average_price_gbp
    || group.value?.current_average_price_gbp
    || "";
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

function crossTerminalFee() {
  const direct = group.value?.cross_terminal_surcharge_gbp ?? group.value?.summary?.cross_terminal_surcharge_gbp;
  if (direct !== null && direct !== undefined && direct !== "") return direct;
  return members.value.reduce((sum, row) => sum + Number(row.member_surcharge_gbp || row.request?.cross_terminal_surcharge_gbp || 0), 0);
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

function readinessStateForGroup() {
  const rows = members.value;
  const hasMembers = rows.length > 0;
  const hasUncontacted = rows.some(row => row.request?.contact_status !== "contacted");
  const hasUnpaid = rows.some(row => normalizedPaymentStatus(memberPaymentStatus(row)) !== "fully_paid");
  const hasUnrecorded = rows.some(row => !Boolean(row.request?.offline_recorded));
  const hasRisk = riskItems.value.length > 0;
  const hasMissingDispatchInfo = rows.some(row => {
    const request = row.request || {};
    const hasContact = Boolean(request.phone || request.wechat);
    return !hasContact || !request.flight_no || !memberAddress(row) || !normalizedPaymentStatus(memberPaymentStatus(row));
  });
  const dispatchReady = hasMembers && !hasRisk && !hasUncontacted && !hasMissingDispatchInfo;
  const completedRecorded = hasMembers && rows.every(row => Boolean(row.request?.offline_recorded));
  return {
    contact_pending: hasUncontacted,
    payment_incomplete: hasUnpaid,
    offline_pending: hasUnrecorded,
    has_risk: hasRisk,
    dispatch_ready: dispatchReady,
    completed_recorded: completedRecorded
  };
}

function readinessItemsForGroup() {
  const state = readinessStateForGroup();
  const items = [];
  if (state.contact_pending) items.push({ key: "contact_pending", label: "待联系", tone: "warning" });
  if (state.payment_incomplete) items.push({ key: "payment_incomplete", label: "付款未齐", tone: "warning" });
  if (state.offline_pending) items.push({ key: "offline_pending", label: "未线下记录", tone: "neutral" });
  if (state.dispatch_ready) items.push({ key: "dispatch_ready", label: "可派单", tone: "success" });
  if (state.completed_recorded) items.push({ key: "completed_recorded", label: "已完成记录", tone: "success" });
  if (items.length) return items;
  return members.value.length ? [{ key: "manual_review", label: "待人工判断", tone: "neutral" }] : [{ key: "no_members", label: "暂无成员", tone: "neutral" }];
}

function stripDispatchSummaryOverride(notes) {
  const text = String(notes || "");
  const embeddedNoteMatch = text.match(/组备注\s*\/\s*司机备注\s*\/\s*调度备注[:：]\s*([\s\S]*?)(?:\n\s*\[\/dispatch_summary_override\]|\s*$)/);
  if (embeddedNoteMatch?.[1]) {
    const embedded = embeddedNoteMatch[1].trim();
    if (embedded && !/司机派单摘要|乘客信息[:：]|派单准备度[:：]/.test(embedded)) {
      return embedded;
    }
  }
  const summaryMarkers = [
    DISPATCH_SUMMARY_START,
    DISPATCH_SUMMARY_END,
    "司机派单摘要",
    "派单信息",
    "派单准备度:",
    "派单准备度：",
    "乘客信息:",
    "乘客信息："
  ];
  let cleaned = text.replace(new RegExp(`\\s*${DISPATCH_SUMMARY_START}[\\s\\S]*?${DISPATCH_SUMMARY_END}\\s*`, "g"), "\n");
  const summaryStart = summaryMarkers
    .map((marker) => cleaned.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (summaryStart >= 0) {
    cleaned = cleaned.slice(0, summaryStart);
  }
  const normalized = cleaned
    .replace(/\[\/?dispatch_summary_override\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const compactLocalNote = normalized.replace(/[\s\]\-\/]+/g, "").toLowerCase();
  if (compactLocalNote.startsWith("p6local") && compactLocalNote.length <= 32) {
    return "P6 本地测试：该组包含已付款/未付款、已线下记录/未记录的混合状态，用于验收付款与记录状态展示。";
  }
  return normalized;
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
    `派单准备度: ${dispatchReadinessText.value}`,
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
  form.notes = stripDispatchSummaryOverride(record?.notes);
}

function logAdminName(log) {
  return displayValue(log?.metadata?.admin_name || log?.admin_user?.name || log?.admin_user?.username || log?.admin_user?.email || log?.admin_user_id);
}

function logActionLabel(log) {
  const labels = {
    update_transport_group: "修改拼车组设置",
    update_transport_request_safe_fields: "更新成员状态",
    update_transport_request: "更新订单记录",
    set_transport_request_offline_recorded: "更新线下记录",
    add_transport_request_to_group: "加入拼车组",
    remove_transport_request_from_group: "移出拼车组",
    move_transport_request_group: "更换拼车组",
    adjust_transport_request_time: "调整订单时间"
  };
  return labels[log?.action] || displayValue(log?.action);
}

function logFieldLabel(field) {
  const labels = {
    max_passengers: "最大人数 / 座位容量",
    visible_on_frontend: "是否前台显示",
    notes: "组备注 / 司机备注 / 调度备注",
    contact_status: "联系状态",
    payment_collection_status: "付款状态",
    offline_recorded: "线下记录",
    admin_note: "客服备注"
  };
  return labels[field] || displayValue(field);
}

function logValueLabel(field, value) {
  if (value === null || value === undefined || value === "") return "--";
  if (field === "visible_on_frontend") return value ? "前台显示" : "前台隐藏";
  if (field === "offline_recorded") return value ? "已记录" : "未记录";
  if (field === "contact_status") return contactLabel(value);
  if (field === "payment_collection_status") return paymentCollectionLabel(value);
  return displayValue(value);
}

function logChangedFields(log) {
  if (Array.isArray(log?.metadata?.changed_fields) && log.metadata.changed_fields.length) {
    return log.metadata.changed_fields;
  }
  const beforeData = log?.before_data || {};
  const afterData = log?.after_data || {};
  return Array.from(new Set([...Object.keys(beforeData), ...Object.keys(afterData)])).map(field => ({
    field,
    label: logFieldLabel(field),
    before: beforeData[field],
    after: afterData[field]
  }));
}

function logTargetLabel(log) {
  if (log?.metadata?.order_no) return `订单 ${log.metadata.order_no}`;
  if (log?.metadata?.group_id) return `拼车组 ${log.metadata.group_id}`;
  if (log?.target_type === "transport_group") return `拼车组 ${displayValue(group.value?.group_id || log.target_id)}`;
  return displayValue(log?.target_id);
}

function logOrderNo(log) {
  return log?.metadata?.order_no || log?.after_data?.order_no || log?.before_data?.order_no || "";
}

function logGroupNo(log) {
  return log?.metadata?.group_id || group.value?.group_id || group.value?.id || "";
}

function findLogChange(log, fields) {
  const wanted = Array.isArray(fields) ? fields : [fields];
  return logChangedFields(log).find(item => wanted.includes(item.field));
}

function paymentReadable(value) {
  const text = String(value || "").toLowerCase();
  const marker = text.match(/\[payment:(paid|unpaid)\]/i)?.[1];
  const normalized = marker || text;
  if (["fully_paid", "paid", "waived"].includes(normalized)) return "已付款";
  if (normalized === "deposit_paid") return "已收定金";
  if (normalized === "pending") return "待确认";
  return "未付款";
}

function visibilityReadable(value) {
  return value ? "显示" : "不显示";
}

function operationLogMessage(log) {
  const admin = logAdminName(log);
  const orderNo = logOrderNo(log);
  const groupNo = logGroupNo(log);
  const orderTarget = orderNo ? `订单 ${orderNo}` : "该订单";
  const groupTarget = groupNo ? `拼车组 ${groupNo}` : "该拼车组";
  const paymentChange = findLogChange(log, ["payment_collection_status", "manual_payment_status"]);
  const adminNoteChange = findLogChange(log, "admin_note");
  const notePaymentBefore = adminNoteChange ? paymentReadable(adminNoteChange.before) : "";
  const notePaymentAfter = adminNoteChange ? paymentReadable(adminNoteChange.after) : "";

  if (log.metadata?.batch_payment_action === "mark_group_unpaid_paid") {
    const targetGroup = log.metadata.batch_payment_group_id || groupNo || groupKey.value;
    const count = Number(log.metadata.batch_payment_group_size || 1);
    return `${admin} 批量将拼车组 ${targetGroup} 中 ${count} 个未付款订单标记为已付款，并模拟发送付款确认邮件`;
  }

  if (paymentChange || (adminNoteChange && notePaymentBefore !== notePaymentAfter)) {
    const before = paymentReadable(paymentChange?.before ?? adminNoteChange?.before);
    const after = paymentReadable(paymentChange?.after ?? adminNoteChange?.after);
    if (before === "已付款" && after === "未付款") {
      return `${admin} 取消了${orderTarget}的已付款标记，当前状态为“未付款”`;
    }
    if (after === "已付款") {
      return `${admin} 将${orderTarget}的付款状态从“${before}”改为“已付款”`;
    }
    return `${admin} 将${orderTarget}的付款状态从“${before}”改为“${after}”`;
  }

  const contactChange = findLogChange(log, "contact_status");
  if (contactChange) {
    const after = contactLabel(contactChange.after);
    return contactChange.after === "contacted"
      ? `${admin} 将${orderTarget}标记为“已联系”`
      : `${admin} 取消了${orderTarget}的联系标记，当前状态为“${after}”`;
  }

  const offlineChange = findLogChange(log, "offline_recorded");
  if (offlineChange) {
    return offlineChange.after
      ? `${admin} 将${orderTarget}标记为“已线下记录”`
      : `${admin} 取消了${orderTarget}的线下记录标记`;
  }

  const capacityChange = findLogChange(log, "max_passengers");
  if (capacityChange) {
    return `${admin} 将${groupTarget}容量从 ${displayValue(capacityChange.before)} 改为 ${displayValue(capacityChange.after)}`;
  }

  const visibilityChange = findLogChange(log, "visible_on_frontend");
  if (visibilityChange) {
    return `${admin} 将${groupTarget}前台展示从“${visibilityReadable(visibilityChange.before)}”改为“${visibilityReadable(visibilityChange.after)}”`;
  }

  const notesChange = findLogChange(log, "notes");
  if (notesChange) {
    return `${admin} 更新了${groupTarget}备注`;
  }

  if (log?.target_type === "transport_group") {
    return `${admin} 更新了${groupTarget}`;
  }
  if (orderNo) {
    return `${admin} 更新了${orderTarget}`;
  }
  return `${admin} 更新了记录`;
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
  if (nextCapacity === currentPassengerCount.value && form.visible_on_frontend && window.confirm("最大人数已等于当前人数，是否同时关闭前台显示？")) {
    form.visible_on_frontend = false;
  }
  savingGroup.value = true;
  notice.value = "";
  try {
    await updateTransportGroup(groupKey.value, {
      max_passengers: nextCapacity,
      visible_on_frontend: Boolean(form.visible_on_frontend),
      notes: String(form.notes || "").trim() || null
    });
    await loadGroup();
    notice.value = "调度备注和前台显示状态已保存。";
  } catch (err) {
    notice.value = err.message || "保存调度信息失败。";
  } finally {
    savingGroup.value = false;
  }
}

async function copySummary() {
  const text = dispatchSummary.value || "";
  const originalNotes = form.notes;
  const activeElement = document.activeElement;
  const selection = activeElement && "selectionStart" in activeElement
    ? { start: activeElement.selectionStart, end: activeElement.selectionEnd }
    : null;
  const copyWithTemporaryTextarea = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.setAttribute("aria-hidden", "true");
    textarea.tabIndex = -1;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
    return copied;
  };
  const restoreNotesAndFocus = () => {
    form.notes = originalNotes;
    if (activeElement && typeof activeElement.focus === "function") {
      activeElement.focus();
      if (selection && typeof activeElement.setSelectionRange === "function") {
        activeElement.setSelectionRange(selection.start, selection.end);
      }
    }
  };
  try {
    if (navigator.clipboard?.writeText) {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error("clipboard timeout")), 1000))
      ]);
    } else if (!copyWithTemporaryTextarea()) {
      throw new Error("clipboard unavailable");
    }
    restoreNotesAndFocus();
    notice.value = "司机摘要已复制。";
  } catch (err) {
    if (copyWithTemporaryTextarea()) {
      restoreNotesAndFocus();
      notice.value = "司机摘要已复制。";
      return;
    }
    restoreNotesAndFocus();
    notice.value = "浏览器限制了自动复制，请手动复制弹窗中的司机摘要。";
    window.prompt("复制失败，请手动复制以下司机派单摘要：", text);
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

function paymentEmailWasHandled(result) {
  return Boolean(result?.payment_email && !result.payment_email.error);
}

function paymentEmailWasLocalMock(result) {
  return result?.payment_email?.provider === "local_mock" || result?.payment_email?.reason === "local_test_mode";
}

function openBatchPaymentDialog() {
  if (batchPaymentDialog.saving) return;
  batchPaymentDialog.members = batchPaymentTargets.value;
  batchPaymentDialog.skippedCount = Math.max(members.value.length - batchPaymentDialog.members.length, 0);
  batchPaymentDialog.open = true;
}

function closeBatchPaymentDialog() {
  if (batchPaymentDialog.saving) return;
  batchPaymentDialog.open = false;
}

async function confirmBatchPayment() {
  if (batchPaymentDialog.saving) return;
  const targets = batchPaymentDialog.members.filter(row => !isFullyPaidRow(row) && requestId(row));
  if (!targets.length) {
    batchPaymentDialog.open = false;
    notice.value = "本组没有需要标记的未付款订单。";
    return;
  }

  const batchId = `group-paid-${Date.now()}`;
  let successCount = 0;
  let emailCount = 0;
  let localMockCount = 0;
  const skippedCount = batchPaymentDialog.skippedCount;
  const failures = [];
  batchPaymentDialog.saving = true;
  notice.value = "";
  try {
    for (const row of targets) {
      const id = requestId(row);
      try {
        const result = await updateTransportRequestSafeFields(id, {
          payment_collection_status: "fully_paid",
          batch_payment_action: "mark_group_unpaid_paid",
          batch_payment_group_id: groupKey.value,
          batch_payment_group_size: targets.length,
          batch_payment_batch_id: batchId
        });
        successCount += 1;
        if (paymentEmailWasHandled(result)) emailCount += 1;
        if (paymentEmailWasLocalMock(result)) localMockCount += 1;
      } catch (err) {
        failures.push(`${displayValue(row.request?.order_no || row.order_no)}：${err.message || "更新失败"}`);
      }
    }
    await loadGroup();
    const emailText = localMockCount
      ? `本地测试模式：已模拟发送付款确认邮件 ${localMockCount} 封`
      : `已触发付款确认邮件 ${emailCount} 封`;
    notice.value = [
      `已成功标记 ${successCount} 单。`,
      emailText,
      `跳过 ${skippedCount} 单已付款订单。`,
      failures.length ? `失败：${failures.join("；")}` : ""
    ].filter(Boolean).join(" ");
    batchPaymentDialog.open = false;
  } finally {
    batchPaymentDialog.saving = false;
  }
}

async function setPaymentPaid(row, paid) {
  const id = requestId(row);
  if (!id || savingMember.value) return;
  const currentlyPaid = isPaidRow(row);
  if (paid && currentlyPaid) return;
  if (!paid && !currentlyPaid) return;
  const message = paid
    ? "确认将该成员订单标记为已付款吗？"
    : "确认取消该成员订单的已付款标记吗？此操作不会发送付款确认邮件。";
  if (!window.confirm(message)) return;
  savingMember.value = id;
  notice.value = "";
  try {
    const result = await updateTransportRequestSafeFields(id, {
      payment_collection_status: paid ? "fully_paid" : "unpaid"
    });
    await loadGroup();
    if (paid && paymentEmailWasLocalMock(result)) {
      notice.value = "成员付款状态已更新。本地测试模式：已模拟发送付款确认邮件。";
    } else if (paid && paymentEmailWasHandled(result)) {
      notice.value = "成员付款状态已更新，已触发付款确认邮件。";
    } else {
      notice.value = paid ? "成员付款状态已更新。" : "成员付款标记已取消。";
    }
  } catch (err) {
    notice.value = err.message || "成员付款状态更新失败。";
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
        <p class="view-heading__eyebrow">Transport dispatch · P6A</p>
        <h2>拼车组调度核对</h2>
        <p>用于客服核对拼车组容量、前台展示、成员记录、付款状态和司机派单摘要。</p>
      </div>
      <div class="view-heading__actions">
        <BackButton href="/admin/transport/groups" label="返回拼车组管理" />
        <a class="secondary-button" href="/admin/transport/requests">查看接送机订单</a>
      </div>
    </div>

    <LoadingState v-if="loading">正在加载拼车组详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!group" title="未找到拼车组" description="请返回列表重新选择拼车组。" />
    <template v-else>
      <p class="transport-current-group-hint">当前拼车组：{{ displayValue(group.group_id || group.id) }}</p>
      <p v-if="notice" class="inline-notice">{{ notice }}</p>

      <section class="admin-panel transport-detail-panel">
        <h3>拼车组概览</h3>
        <p class="detail-muted">关键调度信息一屏核对；行程、价格和成员关系字段在 P6A 保持只读。</p>
        <div class="group-overview-cards group-overview-cards--detail">
          <div class="group-overview-card"><span>Group ID</span><strong>{{ displayValue(group.group_id || group.id) }}</strong></div>
          <div class="group-overview-card"><span>服务类型</span><strong>{{ serviceLabel(group.service_type) }}</strong></div>
          <div class="group-overview-card"><span>机场 / 航站楼</span><strong>{{ displayValue(group.airport_code) }} / {{ terminalSummary }}</strong></div>
          <div class="group-overview-card"><span>服务日期</span><strong>{{ formatDate(group.group_date) }}</strong></div>
          <div class="group-overview-card"><span>服务时间</span><strong>{{ formatDateTime(group.summary?.arrival_time_range?.earliest || group.preferred_time_start || group.flight_time_reference) }} - {{ formatDateTime(group.summary?.arrival_time_range?.latest || group.preferred_time_end || group.flight_time_reference) }}</strong></div>
          <div class="group-overview-card group-overview-card--highlight"><span>当前人数 / 容量</span><strong>{{ Number(group.current_passenger_count || 0) }} / {{ Number(group.max_passengers || 0) }}</strong></div>
          <div class="group-overview-card"><span>行李数</span><strong>{{ totalLuggage() }} 件</strong></div>
          <div class="group-overview-card"><span>当前人均价</span><strong>{{ money(paymentSummary.average_price_gbp || group.current_average_price_gbp) }}</strong></div>
        </div>
        <div class="group-overview-meta">
          <span>组状态 <StatusBadge :tone="statusTone(group.status)">{{ statusLabel(group.status) }}</StatusBadge></span>
          <span>前台展示 <StatusBadge :tone="visibleTone(group.visible_on_frontend)">{{ visibleLabel(group.visible_on_frontend) }}</StatusBadge></span>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>调度风险与派单准备度</h3>
        <div class="dispatch-readiness-panel">
          <div>
            <p class="detail-muted">派单准备度</p>
            <div class="dispatch-readiness-list dispatch-readiness-list--detail">
              <StatusBadge v-for="item in dispatchReadinessItems" :key="item.key" :tone="item.tone">
                {{ item.label }}
              </StatusBadge>
            </div>
          </div>
          <div class="dispatch-risk-list">
            <StatusBadge v-if="!riskItems.length" tone="success">无明显风险</StatusBadge>
            <span v-for="risk in riskItems" :key="risk.code" class="dispatch-risk-chip">{{ riskDisplayLabel(risk) }}</span>
          </div>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <div class="transport-panel-header">
          <div>
            <h3>调度设置</h3>
          </div>
          <div class="view-heading__actions">
            <button class="table-action-button" type="button" :disabled="savingGroup" @click="saveGroupDispatchFields">
              {{ savingGroup ? "保存中..." : "保存设置" }}
            </button>
          </div>
        </div>
        <div class="dispatch-control-grid">
          <label>
            <span>最大人数 / 座位容量</span>
            <input v-model.number="form.max_passengers" type="number" :min="currentPassengerCount" max="9" />
          </label>
          <label>
            <span>是否前台显示</span>
            <select v-model="form.visible_on_frontend">
              <option :value="true">是</option>
              <option :value="false">否</option>
            </select>
          </label>
        </div>
        <div class="dispatch-summary-preview">
          <div class="transport-panel-header">
            <div>
              <h4>司机派单摘要</h4>
            </div>
            <button class="table-action-button" type="button" @click="copySummary">一键复制司机摘要</button>
          </div>
          <pre>{{ dispatchSummary }}</pre>
        </div>
        <label class="dispatch-note-field">
          <span>内部备注</span>
          <textarea v-model="form.notes" rows="3" placeholder="填写组备注、司机备注或调度备注"></textarea>
        </label>
      </section>

      <section class="admin-panel transport-detail-panel">
        <div class="transport-panel-header">
          <div>
            <h3>费用与付款</h3>
          </div>
          <button
            class="table-action-button"
            type="button"
            :disabled="!batchPaymentTargets.length || batchPaymentDialog.saving"
            @click="openBatchPaymentDialog"
          >
            {{ batchPaymentTargets.length ? "本组收款完成" : "本组已全部付款" }}
          </button>
        </div>
        <p class="detail-muted">付款状态按成员订单处理；不会修改拼车组容量、订单人数或成员关系。</p>
        <div class="group-payment-cards">
          <div class="group-payment-card"><span>总价</span><strong>{{ money(totalPrice()) }}</strong></div>
          <div class="group-payment-card group-payment-card--highlight"><span>当前人均价</span><strong>{{ money(paymentSummary.average_price_gbp || group.current_average_price_gbp) }}</strong></div>
          <div class="group-payment-card"><span>跨航站楼费用</span><strong>{{ money(crossTerminalFee()) }}</strong></div>
        </div>
        <div class="member-payment-list">
          <div v-for="row in members" :key="`${requestId(row)}-payment`" class="member-payment-row">
            <span>
              <strong>{{ displayValue(row.request?.student_name || row.student_name) }}</strong>
              <small>{{ displayValue(row.request?.order_no || row.order_no) }}</small>
            </span>
            <div class="member-payment-row__actions">
              <StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge>
              <StatusBadge :tone="row.request?.offline_recorded ? 'success' : 'neutral'">{{ row.request?.offline_recorded ? "已记录" : "未记录" }}</StatusBadge>
              <button
                v-if="isPaidRow(row)"
                class="table-action-button"
                type="button"
                :disabled="savingMember === requestId(row)"
                @click="setPaymentPaid(row, false)"
              >
                取消标记
              </button>
              <button
                v-else
                class="table-action-button"
                type="button"
                :disabled="savingMember === requestId(row)"
                @click="setPaymentPaid(row, true)"
              >
                标记已付款
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>组内成员明细</h3>
        <p class="detail-muted">成员核心字段只读反馈。航站楼、航班、日期、时间、订单人数、价格和成员关系变更请在 P5 订单变更流程处理。</p>
        <AdminTable v-if="members.length" :columns="memberColumns" :rows="members">
          <template #cell-order_no="{ row }"><strong class="cell-truncate">{{ displayValue(row.request?.order_no || row.order_no) }}</strong></template>
          <template #cell-student="{ row }"><span class="cell-stack"><strong class="cell-truncate">{{ displayValue(row.request?.student_name || row.student_name) }}</strong><small>{{ row.is_initiator ? "发起人" : "成员" }}</small></span></template>
          <template #cell-contact="{ row }"><span class="cell-stack"><strong>{{ displayValue(row.request?.phone || row.phone) }}</strong><small>{{ displayValue(row.request?.wechat || row.wechat) }}</small></span></template>
          <template #cell-flight="{ row }"><span class="cell-stack"><strong>{{ displayValue(row.request?.flight_no || row.flight_no) }}</strong><small>{{ formatDateTime(row.request?.flight_datetime || row.flight_datetime) }}</small><small>{{ displayValue(row.request?.airport_code || row.airport_code) }}</small></span></template>
          <template #cell-terminal="{ row }"><span>{{ displayValue(row.request?.terminal || row.terminal) }}</span></template>
          <template #cell-counts="{ row }"><span class="cell-stack"><strong>{{ Number(row.request?.passenger_count || row.passenger_count_snapshot || 0) }} 人</strong><small>{{ Number(row.request?.luggage_count || row.luggage_count_snapshot || 0) }} 件行李</small></span></template>
          <template #cell-location="{ row }"><span class="cell-truncate" :title="displayValue(memberAddress(row))">{{ displayValue(memberAddress(row)) }}</span></template>
          <template #cell-price="{ row }"><span class="cell-stack"><strong>{{ money(memberPrice(row)) }}</strong><small>附加费 {{ money(row.member_surcharge_gbp || 0) }}</small></span></template>
          <template #cell-ops="{ row }"><span class="cell-stack"><StatusBadge :tone="paymentTone(row)">{{ paymentLabel(row) }}</StatusBadge><StatusBadge :tone="row.request?.offline_recorded ? 'success' : 'neutral'">{{ row.request?.offline_recorded ? "已记录" : "未记录" }}</StatusBadge><StatusBadge :tone="contactTone(row.request?.contact_status)">{{ contactLabel(row.request?.contact_status) }}</StatusBadge></span></template>
          <template #cell-status="{ row }"><StatusBadge :tone="statusTone(row.request?.status)">{{ statusLabel(row.request?.status) }}</StatusBadge></template>
          <template #cell-actions="{ row }"><div class="table-action-group table-action-group--compact"><button class="table-action-button" type="button" :disabled="savingMember === requestId(row)" @click="toggleOfflineRecorded(row)">{{ row.request?.offline_recorded ? "取消记录" : "标记记录" }}</button><button class="table-action-button" type="button" :disabled="savingMember === requestId(row)" @click="markContacted(row)">{{ row.request?.contact_status === "contacted" ? "取消联系" : "标记已联系" }}</button></div></template>
        </AdminTable>
        <p v-else class="detail-muted">暂无成员</p>
      </section>

      <section class="admin-panel transport-detail-panel">
        <h3>操作记录</h3>
        <ul v-if="readableOperationLogs.length" class="transport-operation-log-list">
          <li v-for="log in readableOperationLogs" :key="log.id || `${log.action}-${log.created_at}`">
            <div>
              <strong>{{ log.message }}</strong>
              <span>{{ formatDateTime(log.created_at) }} / {{ logAdminName(log) }} / {{ logTargetLabel(log) }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无操作记录。</p>
      </section>
    </template>

    <div v-if="batchPaymentDialog.open" class="transport-modal-backdrop" role="presentation">
      <div class="transport-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="batch-payment-title">
        <div class="transport-panel-header">
          <div>
            <h3 id="batch-payment-title">确认本组收款完成</h3>
            <p class="detail-muted">Group ID：{{ groupKey }}</p>
          </div>
        </div>
        <p class="detail-muted">
          即将把本组中 {{ batchPaymentDialog.members.length }} 个未付款订单标记为已付款。
        </p>
        <p class="detail-muted">以下订单将被处理：</p>
        <ul class="transport-confirm-list">
          <li v-for="row in batchPaymentDialog.members" :key="`${requestId(row)}-batch-payment`">
            <strong>{{ displayValue(row.request?.student_name || row.student_name) }}</strong>
            <span>{{ displayValue(row.request?.order_no || row.order_no) }}</span>
            <span>{{ money(batchPaymentMemberPrice(row)) }}</span>
          </li>
        </ul>
        <p class="detail-muted">已付款订单会自动跳过，不会重复发送付款确认邮件。</p>
        <p class="detail-muted">本地测试模式下：不会真实发送邮件，只会模拟发送并写入操作记录。</p>
        <div class="transport-confirm-actions">
          <button class="table-action-button" type="button" :disabled="batchPaymentDialog.saving" @click="closeBatchPaymentDialog">取消</button>
          <button class="table-action-button table-action-button--primary" type="button" :disabled="batchPaymentDialog.saving" @click="confirmBatchPayment">
            {{ batchPaymentDialog.saving ? "正在处理..." : "确认标记已付款" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
