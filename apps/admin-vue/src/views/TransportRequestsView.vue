<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import readXlsxFile from "read-excel-file";
import {
  bulkSetTransportRequestsOfflineRecorded,
  commitTransportManualImport,
  createManualTransportRequest,
  deleteTransportRequest,
  exportTransportRequests,
  fetchTimeAdjustCandidateGroups,
  fetchTransportRequests,
  previewTransportManualImport,
  adjustTransportRequestTime,
  updateTransportRequest,
  updateTransportRequestSafeFields
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
import importColumns from "../../../../shared/transport-manual-import-columns.json";

const columns = [
  { key: "wb_selected", label: "选择", width: "46px" },
  { key: "wb_row_index", label: "序号", width: "58px" },
  { key: "wb_service_date", label: "服务日期", width: "104px" },
  { key: "wb_service_time", label: "时间段", width: "92px" },
  { key: "wb_student_name", label: "学生姓名", width: "140px" },
  { key: "wb_phone", label: "电话", width: "128px" },
  { key: "wb_wechat", label: "微信", width: "128px" },
  { key: "wb_service_type", label: "服务类型", width: "86px" },
  { key: "wb_airport", label: "机场", width: "82px" },
  { key: "wb_terminal", label: "航站楼", width: "82px" },
  { key: "wb_flight_no", label: "航班号", width: "100px" },
  { key: "wb_flight_datetime", label: "航班时间", width: "142px" },
  { key: "wb_passenger_count", label: "人数", width: "68px" },
  { key: "wb_luggage_count", label: "行李", width: "68px" },
  { key: "wb_group_status", label: "拼车状态/组", width: "138px" },
  { key: "wb_contact_status", label: "联系状态", width: "112px" },
  { key: "wb_payment_collection_status", label: "收款状态", width: "120px" },
  { key: "wb_deposit_amount_gbp", label: "定金", width: "98px" },
  { key: "wb_offline_recorded", label: "是否已记录", width: "104px" },
  { key: "wb_admin_note", label: "客服备注", width: "220px" },
  { key: "wb_last_operation", label: "最后操作", width: "132px" },
  { key: "wb_actions", label: "操作", width: "220px", className: "is-actions", sticky: "end" }
];

const legacyColumns = [
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
  { key: "actions", label: "操作", width: "220px", className: "is-actions", sticky: "end" }
];

const defaultFilters = {
  search: "",
  serviceType: "",
  airportCode: "",
  status: "active",
  contactStatus: "",
  paymentCollectionStatus: "",
  offlineRecorded: "",
  lastOperatedBy: "",
  importBatchId: "",
  source: "",
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
const deleteActionKind = ref("close_order");
const error = ref("");
const notice = ref("");
const showManualDialog = ref(false);
const showBatchDialog = ref(false);
const manualSaving = ref(false);
const manualConfirmWarnings = ref(false);
const manualPreview = ref(null);
const manualGroupChecking = ref(false);
const manualGroupConfirmedId = ref("");
const manualGroupMessage = ref("");
const manualSubmitAttempted = ref(false);
const importPreviewing = ref(false);
const importCommitting = ref(false);
const importPasteText = ref("");
const importRows = ref([]);
const importPreviewRows = ref([]);
const confirmedWarningRows = ref({});
const importFileName = ref("");
const importStatusMessage = ref("");
const workbenchDrafts = reactive({});
const rowSavingIds = ref([]);
const rowErrorMessages = reactive({});
const timeAdjustTarget = ref(null);
const timeAdjustSaving = ref(false);
const timeAdjustError = ref("");
const timeAdjustCandidateLoading = ref(false);
const timeAdjustCandidateError = ref("");
const timeAdjustCandidateGroups = ref([]);
const timeAdjustForm = reactive({
  flight_datetime: "",
  preferred_time_start: "",
  reason: "",
  handling_method: "direct",
  target_group_id: ""
});

const IMPORT_COLUMNS = importColumns;
const IMPORT_TEMPLATE_HEADERS = IMPORT_COLUMNS.map(column => column.label);
const IMPORT_TEMPLATE_NOTES = IMPORT_COLUMNS.map(column => column.note);
const IMPORT_TEMPLATE_EXAMPLES = [
  IMPORT_COLUMNS.map(column => column.example_auto_group ?? ""),
  IMPORT_COLUMNS.map(column => column.example_existing_group ?? "")
];
const IMPORT_HEADER_ALIAS_MAP = IMPORT_COLUMNS.reduce((map, column) => {
  [column.label, ...(column.aliases || [])].forEach(alias => {
    map.set(normalizeImportHeader(alias), column.label);
  });
  return map;
}, new Map());

const IMPORT_TEMPLATE_SAMPLE_TEXT = [
  IMPORT_TEMPLATE_HEADERS.join("\t"),
  ["张三", "07123456789", "wechat_id", "接机", "LHR", "T2", "CZ304", "2026/05/22 12:00", "2026/05/22 10:00", "Nottingham NG1 1AA", "1", "2", "", "未付款", "", "客服备注"].join("\t")
].join("\n");

const manualForm = reactive({
  service_type: "pickup",
  student_name: "",
  english_name: "",
  phone: "",
  wechat: "",
  email: "",
  passenger_count: 1,
  luggage_count: 0,
  luggage_note: "",
  airport_code: "LHR",
  terminal: "",
  flight_no: "",
  flight_datetime: "",
  service_time: "",
  address: "",
  shareable: true,
  price: "",
  payment_status: "unpaid",
  notes: "",
  group_id: ""
});

const hasRequests = computed(() => requests.value.length > 0);
const selectedRows = computed(() => requests.value.filter(row => selectedIds.value.includes(String(row.id))));
const deleteDialogIsTestDelete = computed(() => deleteActionKind.value === "delete_test");
const deleteDialogTitle = computed(() => deleteDialogIsTestDelete.value ? "确认删除测试订单" : "确认关闭接送机订单");
const deleteDialogConfirmLabel = computed(() => deleteDialogIsTestDelete.value ? "确认删除测试单" : "确认关闭订单");
const deleteDialogWarning = computed(() => deleteDialogIsTestDelete.value
  ? "仅明显 P2A/临时测试订单会物理删除，并会同步清理相关拼车组成员关系。请确认这是测试数据。"
  : "真实订单将被关闭并从拼车组中移出，不会物理删除数据库记录。请确认客服已完成必要沟通。");
const manualAddressLabel = computed(() => manualForm.service_type === "dropoff" ? "上车地址 / 接人地址" : "目的地地址");
const manualRequiredErrors = computed(() => {
  const errors = [];
  if (!manualForm.service_type) errors.push("服务类型必填");
  if (!String(manualForm.student_name || "").trim()) errors.push("学生姓名必填");
  if (!String(manualForm.phone || "").trim() && !String(manualForm.wechat || "").trim()) errors.push("手机号/微信号至少填一个");
  if (!Number(manualForm.passenger_count || 0)) errors.push("人数必填");
  if (!String(manualForm.airport_code || "").trim()) errors.push("机场必填");
  if (!String(manualForm.terminal || "").trim()) errors.push("航站楼必填");
  if (!String(manualForm.flight_no || "").trim()) errors.push("航班号必填");
  if (!manualForm.flight_datetime) errors.push("航班日期时间必填");
  if (!manualForm.service_time) errors.push("服务时间必填");
  if (!String(manualForm.address || "").trim()) errors.push(`${manualAddressLabel.value}必填`);
  return errors;
});
const manualFieldErrors = computed(() => {
  if (!manualSubmitAttempted.value) return {};
  const errors = {};
  if (!manualForm.service_type) errors.service_type = "请选择服务类型";
  if (!String(manualForm.student_name || "").trim()) errors.student_name = "请填写学生姓名";
  if (!String(manualForm.phone || "").trim() && !String(manualForm.wechat || "").trim()) {
    errors.contact = "手机号和微信号至少填写一个";
  }
  if (!Number(manualForm.passenger_count || 0)) errors.passenger_count = "请填写人数";
  if (!String(manualForm.airport_code || "").trim()) errors.airport_code = "请填写机场";
  if (!String(manualForm.terminal || "").trim()) errors.terminal = "请填写航站楼";
  if (!String(manualForm.flight_no || "").trim()) errors.flight_no = "请填写航班号";
  if (!manualForm.flight_datetime) errors.flight_datetime = "请选择航班日期时间";
  if (!manualForm.service_time) errors.service_time = "请选择服务时间";
  if (!String(manualForm.address || "").trim()) errors.address = `请填写${manualAddressLabel.value}`;
  return errors;
});
const manualGroupNeedsConfirmation = computed(() => {
  const groupId = String(manualForm.group_id || "").trim();
  return Boolean(groupId) && manualGroupConfirmedId.value !== groupId;
});
const hasImportPasteText = computed(() => Boolean(String(importPasteText.value || "").trim()));
const canPreviewImport = computed(() => hasImportPasteText.value || importRows.value.length > 0 || importPreviewRows.value.length > 0);
const canCommitImport = computed(() => {
  if (!importPreviewRows.value.length) return false;
  return importPreviewRows.value.some(row => row.status !== "error")
    && importPreviewRows.value.every(row => row.status !== "warning" || confirmedWarningRows.value[row.row_index]);
});
const importCommitBlockReason = computed(() => {
  if (importCommitting.value || importPreviewing.value) return "";
  if (importStatusMessage.value && !canPreviewImport.value) return "";
  if (!importPreviewRows.value.length) {
    return canPreviewImport.value
      ? "已有文件/粘贴内容，请先完成预览。"
      : "请先粘贴表格内容或上传 .xlsx / .csv 文件并完成预览。";
  }
  const importableRows = importPreviewRows.value.filter(row => row.status !== "error");
  if (!importableRows.length) return "预览结果没有可导入行，请修正红色错误后重新预览。";
  const unconfirmedRows = importPreviewRows.value.filter(row => row.status === "warning" && !confirmedWarningRows.value[row.row_index]);
  if (unconfirmedRows.length) return "黄色警告行需要管理员勾选确认后才可导入。";
  return "";
});
const allCurrentPageSelected = computed(() => {
  const ids = requests.value.map(row => String(row.id)).filter(Boolean);
  return ids.length > 0 && ids.every(id => selectedIds.value.includes(id));
});
const isTimeAdjustGrouped = computed(() => isRequestGrouped(timeAdjustTarget.value));
const isTimeAdjustTransfer = computed(() => timeAdjustForm.handling_method === "transfer_existing_group");
const timeAdjustDisableReason = computed(() => {
  if (timeAdjustSaving.value || !timeAdjustTarget.value) return "";
  if (!fromDateTimeLocalValue(timeAdjustForm.flight_datetime) || !fromDateTimeLocalValue(timeAdjustForm.preferred_time_start)) {
    return "请填写新的航班时间和接机时间";
  }
  if (!String(timeAdjustForm.reason || "").trim()) return "请填写调整原因";
  if (isTimeAdjustGrouped.value && !["keep_group", "move_out", "transfer_existing_group"].includes(timeAdjustForm.handling_method)) {
    return "请选择处理方式";
  }
  if (isTimeAdjustTransfer.value && timeAdjustCandidateLoading.value) return "候选拼车组加载中，请稍候";
  if (isTimeAdjustTransfer.value && timeAdjustCandidateError.value) return "请先重新加载候选拼车组";
  if (isTimeAdjustTransfer.value && !timeAdjustForm.target_group_id) return "请先选择目标拼车组";
  return "";
});
const timeAdjustConfirmDisabled = computed(() => {
  if (timeAdjustSaving.value) return true;
  if (!timeAdjustTarget.value) return true;
  return Boolean(timeAdjustDisableReason.value);
});

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function displayInputValue(value) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeDraftText(value) {
  const next = String(value ?? "").trim();
  return next || null;
}

function normalizeDraftRequiredText(value) {
  return String(value ?? "").trim();
}

function normalizeDraftDeposit(value) {
  const next = String(value ?? "").trim();
  if (!next) return null;
  const parsed = Number(next);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : next;
}

function rawDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDate(value) {
  return rawDate(value) || "--";
}

function formatTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
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

function toDateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function rowServiceTime(row) {
  return row.preferred_time_start || row.flight_datetime || null;
}

function rowServiceDate(row) {
  return formatDate(rowServiceTime(row));
}

function rowServiceTimeRange(row) {
  const start = row.preferred_time_start || row.flight_datetime;
  return start ? formatTime(start) : "--";
}

function lockTitle() {
  return "涉及拼车逻辑，暂不可直接编辑。";
}

function contactStatusLabel(value) {
  return value === "contacted" ? "已联系" : "未联系";
}

function paymentCollectionStatusLabel(value) {
  const labels = {
    unpaid: "未收款",
    deposit_paid: "已付定金",
    fully_paid: "已付全款"
  };
  return labels[value] || labels.unpaid;
}

function groupStatusLabel(row) {
  if (row.group_id) return "已入组";
  if (row.matching_status_code === "matched") return "已匹配";
  return "未入组";
}

function statusLabel(status) {
  const labels = {
    single_member: "single_member",
    active: "active",
    open: "open",
    full: "full",
    closed: "closed",
    cancelled: "cancelled"
  };
  return labels[status] || displayValue(status);
}

function isRequestGrouped(row) {
  if (!row) return false;
  if (row.group_id || row.group_ref || row.matched_group_id) return true;
  return Array.isArray(row.transport_group_members) && row.transport_group_members.length > 0;
}

function groupInfoText(row) {
  if (!row) return "--";
  const membership = Array.isArray(row.transport_group_members) ? row.transport_group_members[0] : null;
  const groupId = row.group_id || row.group_ref || row.matched_group_id || membership?.group_id;
  if (!groupId) return "未加入拼车组";
  const role = membership?.is_initiator ? "发起人" : "成员";
  return `当前拼车组：${groupId}（${role}）`;
}

function candidateGroupTitle(group) {
  return [
    displayValue(group.group_id),
    statusLabel(group.status),
    formatDate(group.group_date),
    formatDateTime(group.preferred_time_start || group.flight_time_reference),
    group.airport_code,
    group.terminal ? `航站楼 ${group.terminal}` : ""
  ].filter(Boolean).join(" · ");
}

function candidateGroupMeta(group) {
  const members = Array.isArray(group.member_order_nos) && group.member_order_nos.length
    ? `成员 ${group.member_order_nos.join(", ")}`
    : "成员 --";
  return [
    `当前人数 ${displayValue(group.current_passenger_count)}`,
    `剩余座位 ${displayValue(group.remaining_passenger_count)}`,
    members
  ].join(" · ");
}

function rowNumber(row) {
  const page = Number(pagination.value.page || 1);
  const pageSize = Number(pagination.value.page_size || defaultFilters.pageSize || 10);
  const index = requests.value.findIndex(item => item.id === row.id);
  return index >= 0 ? (page - 1) * pageSize + index + 1 : "--";
}

function createWorkbenchDraft(row = {}) {
  return {
    student_name: displayInputValue(row.student_name),
    phone: displayInputValue(row.phone),
    wechat: displayInputValue(row.wechat),
    contact_status: row.contact_status || "uncontacted",
    payment_collection_status: row.payment_collection_status || "unpaid",
    deposit_amount_gbp: displayInputValue(row.deposit_amount_gbp),
    admin_note: displayInputValue(row.admin_note)
  };
}

function draftKey(row) {
  return String(row?.id || row?.request_id || row?.order_no || "");
}

function resetWorkbenchDraft(row) {
  const key = draftKey(row);
  if (!key) return;
  workbenchDrafts[key] = createWorkbenchDraft(row);
  delete rowErrorMessages[key];
}

function ensureWorkbenchDraft(row) {
  const key = draftKey(row);
  if (!key) return createWorkbenchDraft(row);
  if (!workbenchDrafts[key]) {
    workbenchDrafts[key] = createWorkbenchDraft(row);
  }
  return workbenchDrafts[key];
}

function normalizedDraftPayload(row) {
  const draft = ensureWorkbenchDraft(row);
  return {
    student_name: normalizeDraftRequiredText(draft.student_name),
    phone: normalizeDraftText(draft.phone),
    wechat: normalizeDraftText(draft.wechat),
    contact_status: draft.contact_status || "uncontacted",
    payment_collection_status: draft.payment_collection_status || "unpaid",
    deposit_amount_gbp: normalizeDraftDeposit(draft.deposit_amount_gbp),
    admin_note: normalizeDraftText(draft.admin_note)
  };
}

function normalizedRowPayload(row = {}) {
  return {
    student_name: normalizeDraftRequiredText(row.student_name),
    phone: normalizeDraftText(row.phone),
    wechat: normalizeDraftText(row.wechat),
    contact_status: row.contact_status || "uncontacted",
    payment_collection_status: row.payment_collection_status || "unpaid",
    deposit_amount_gbp: normalizeDraftDeposit(row.deposit_amount_gbp),
    admin_note: normalizeDraftText(row.admin_note)
  };
}

function isWorkbenchRowDirty(row) {
  const draft = normalizedDraftPayload(row);
  const source = normalizedRowPayload(row);
  return Object.keys(source).some(field => String(draft[field] ?? "") !== String(source[field] ?? ""));
}

function isRowSaving(row) {
  return rowSavingIds.value.includes(draftKey(row));
}

function formatImportDateTimeValue(value) {
  const date = value instanceof Date
    ? value
    : typeof value === "number" && Number.isFinite(value) && value >= 1
      ? new Date(Date.UTC(1899, 11, 30) + value * 86400000)
      : null;
  if (!date || Number.isNaN(date.getTime()) || date.getUTCFullYear() <= 1900) return value;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

function normalizeImportCellValue(header, value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && !(value instanceof Date)) {
    const nested = value.value ?? value.text ?? value.result ?? value.v ?? value.w;
    return nested === undefined ? String(value) : normalizeImportCellValue(header, nested);
  }
  if (header === "航班日期时间" || header === "服务日期时间") {
    return formatImportDateTimeValue(value);
  }
  if (value instanceof Date) return value.toISOString();
  return value;
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
  return [
    isMembershipRequest(row) ? "is-member-order" : "",
    isWorkbenchRowDirty(row) ? "is-workbench-dirty" : "",
    rowErrorMessages[draftKey(row)] ? "is-workbench-error" : ""
  ].filter(Boolean).join(" ");
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
    search: filters.search.trim(),
    service_type: filters.serviceType,
    airport_code: filters.airportCode,
    status: filters.status,
    contact_status: filters.contactStatus,
    payment_collection_status: filters.paymentCollectionStatus,
    offline_recorded: filters.offlineRecorded,
    last_operated_by: filters.lastOperatedBy,
    import_batch_id: filters.importBatchId.trim(),
    source: filters.source,
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
    requests.value.forEach(row => resetWorkbenchDraft(row));
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
  selectedIds.value = [];
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

function isTestTransportRequest(row) {
  const text = [
    row?.student_name,
    row?.wechat,
    row?.admin_note,
    row?.order_no
  ].filter(Boolean).join(" ").toLowerCase();
  return /p2a|p2aui|test p2a|move regression|ui old date safe|ui old mate safe|predeploy/.test(text);
}

function requestDangerActionLabel(row) {
  return isTestTransportRequest(row) ? "删除测试单" : "关闭订单";
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
    notice.value = `未找到可处理的接送机订单 ID：${displayValue(row?.order_no || row?.id)}`;
    return;
  }
  deleteActionKind.value = isTestTransportRequest(row) ? "delete_test" : "close_order";
  deleteCandidate.value = row;
  notice.value = "";
}

function closeDeleteDialog() {
  if (!deletingId.value) {
    deleteCandidate.value = null;
    deleteActionKind.value = "close_order";
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
    if (deleteActionKind.value === "delete_test") {
      await deleteTransportRequest(id);
      notice.value = `已删除测试订单 ${displayValue(target?.order_no || id)}。`;
    } else {
      await updateTransportRequest(id, { status: "closed" });
      notice.value = `已关闭订单 ${displayValue(target?.order_no || id)}。`;
    }
    deleteCandidate.value = null;
    deleteActionKind.value = "close_order";
    selectedIds.value = selectedIds.value.filter(item => item !== String(id));
    await loadRequests(pagination.value.page || 1);
  } catch (err) {
    notice.value = err.message || "操作失败，请稍后重试。";
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

function resetManualForm() {
  Object.assign(manualForm, {
    service_type: "pickup",
    student_name: "",
    english_name: "",
    phone: "",
    wechat: "",
    email: "",
    passenger_count: 1,
    luggage_count: 0,
    luggage_note: "",
    airport_code: "LHR",
    terminal: "",
    flight_no: "",
    flight_datetime: "",
    service_time: "",
    address: "",
    shareable: true,
    price: "",
    payment_status: "unpaid",
    notes: "",
    group_id: ""
  });
  manualPreview.value = null;
  manualConfirmWarnings.value = false;
  manualGroupConfirmedId.value = "";
  manualGroupMessage.value = "";
  manualSubmitAttempted.value = false;
}

function openManualDialog() {
  resetManualForm();
  showManualDialog.value = true;
  notice.value = "";
}

function closeManualDialog() {
  if (!manualSaving.value) {
    showManualDialog.value = false;
  }
}

function buildManualRow() {
  return {
    服务类型: manualForm.service_type === "dropoff" ? "送机" : "接机",
    学生姓名: manualForm.student_name,
    "拼音/英文名": manualForm.english_name,
    手机号: manualForm.phone,
    微信号: manualForm.wechat,
    邮箱: manualForm.email,
    人数: manualForm.passenger_count,
    行李数量: manualForm.luggage_count,
    行李备注: manualForm.luggage_note,
    英国机场: manualForm.airport_code,
    航站楼: manualForm.terminal,
    航班号: manualForm.flight_no,
    航班日期时间: manualForm.flight_datetime,
    服务时间: manualForm.service_time,
    地址: manualForm.address,
    是否愿意拼车: manualForm.shareable ? "是" : "否",
    价格: manualForm.price,
    付款状态: manualForm.payment_status,
    备注: manualForm.notes,
    "Group ID": manualForm.group_id
  };
}

async function checkManualGroup() {
  const groupId = String(manualForm.group_id || "").trim();
  manualGroupConfirmedId.value = "";
  manualGroupMessage.value = "";
  manualPreview.value = null;
  manualConfirmWarnings.value = false;
  if (!groupId) {
    manualGroupMessage.value = "未填写 Group ID，提交后会自动创建新组。";
    return;
  }
  if (manualRequiredErrors.value.length) {
    manualGroupMessage.value = "请先补齐必填项，再校验 Group ID。";
    return;
  }
  manualGroupChecking.value = true;
  try {
    const payload = await previewTransportManualImport([{ row_index: 1, raw: buildManualRow() }]);
    const row = Array.isArray(payload?.items) ? payload.items[0] : null;
    manualPreview.value = row || null;
    if (!row || row.errors?.length) {
      manualGroupMessage.value = "Group ID 校验未通过，请检查下方红色提示。";
      return;
    }
    manualGroupConfirmedId.value = groupId;
    manualGroupMessage.value = row.warnings?.length
      ? "已找到该 Group，但存在黄色提示；提交时需要再次确认。"
      : "已找到并确认该 Group，可加入。";
  } catch (err) {
    manualGroupMessage.value = err.message || "Group ID 校验失败。";
  } finally {
    manualGroupChecking.value = false;
  }
}

async function submitManualForm() {
  if (manualSaving.value) return;
  manualSubmitAttempted.value = true;
  if (manualRequiredErrors.value.length) {
    notice.value = `请先补齐必填项：${manualRequiredErrors.value.join("、")}`;
    return;
  }
  if (manualGroupNeedsConfirmation.value) {
    notice.value = "请先点击“校验并确认 Group”后再提交。";
    return;
  }
  manualSaving.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await createManualTransportRequest(buildManualRow(), manualConfirmWarnings.value);
    notice.value = `补录订单已创建：${displayValue(result?.request?.order_no)}，Group ID：${displayValue(result?.group_id)}`;
    showManualDialog.value = false;
    resetManualForm();
    await loadRequests(1);
  } catch (err) {
    manualPreview.value = err.body?.error?.details || null;
    if (manualPreview.value?.warnings?.length) {
      notice.value = "存在黄色提示，确认后可再次提交。";
      manualConfirmWarnings.value = true;
    } else {
      notice.value = err.message || "补录失败，请检查字段后重试。";
    }
  } finally {
    manualSaving.value = false;
  }
}

function normalizeImportHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeImportHeaders(headers = []) {
  const canonicalHeaders = [];
  const unknownHeaders = [];
  headers.forEach((header, index) => {
    const normalized = normalizeImportHeader(header);
    if (!normalized) {
      canonicalHeaders.push(`列${index + 1}`);
      return;
    }
    const canonical = IMPORT_HEADER_ALIAS_MAP.get(normalized);
    if (!canonical) unknownHeaders.push(header);
    canonicalHeaders.push(canonical || header);
  });
  if (unknownHeaders.length === headers.length) {
    return {
      headers: canonicalHeaders,
      error: "未识别表头。请使用导入模板，或从 Excel/Google Sheet 复制 Tab 分隔表格，不要用空格分隔。"
    };
  }
  return { headers: canonicalHeaders, error: "" };
}

function parseDelimitedText(text) {
  const rawText = String(text || "");
  const lines = rawText.split(/\r?\n/).map(line => line.replace(/\r/g, "")).filter(line => line.trim());
  if (!rawText.trim()) {
    return { rows: [], error: "请先粘贴表格内容或上传 CSV/XLSX 文件。" };
  }
  const headerLine = lines[0];
  let delimiter = "\t";
  if (headerLine.includes("\t")) {
    delimiter = "\t";
  } else if (headerLine.includes(",")) {
    delimiter = ",";
  } else {
    return {
      rows: [],
      error: "未识别表头。请使用导入模板，或从 Excel/Google Sheet 复制 Tab 分隔表格，不要用空格分隔。"
    };
  }
  const headers = headerLine.split(delimiter).map(item => item.trim());
  const normalizedHeaders = normalizeImportHeaders(headers);
  if (normalizedHeaders.error) {
    return { rows: [], error: normalizedHeaders.error };
  }
  const canonicalHeaders = normalizedHeaders.headers;
  const missingHeaders = IMPORT_TEMPLATE_HEADERS.filter(header => !canonicalHeaders.includes(header));
  if (missingHeaders.length) {
    return {
      rows: [],
      error: `缺少必填字段：${missingHeaders.join("、")}。请使用导入模板。`
    };
  }
  if (lines.length < 2) {
    return {
      rows: [],
      error: "模板已读取，但没有订单数据。请在第二行开始填写订单后重新上传。"
    };
  }
  const rows = lines.slice(1).map((line, index) => {
    const values = line.split(delimiter);
    const raw = {};
    canonicalHeaders.forEach((header, headerIndex) => {
      raw[header || `列${headerIndex + 1}`] = normalizeImportCellValue(header, values[headerIndex]);
    });
    return { row_index: index + 1, raw };
  });
  return { rows, error: "" };
}

function parseSheetRows(sheetRows = []) {
  const headers = (sheetRows[0] || []).map((value, index) => String(value || `列${index + 1}`).trim());
  if (!headers.length || headers.every(header => !header)) {
    return { rows: [], error: "未识别表头，请使用导入模板。" };
  }
  const normalizedHeaders = normalizeImportHeaders(headers);
  if (normalizedHeaders.error) {
    return { rows: [], error: normalizedHeaders.error };
  }
  const canonicalHeaders = normalizedHeaders.headers;
  const missingHeaders = IMPORT_TEMPLATE_HEADERS.filter(header => !canonicalHeaders.includes(header));
  if (missingHeaders.length) {
    return {
      rows: [],
      error: `缺少必填字段：${missingHeaders.join("、")}。请使用导入模板。`
    };
  }
  const dataRows = sheetRows.slice(1).filter(values => (values || []).some(value => String(value ?? "").trim()));
  if (!dataRows.length) {
    return {
      rows: [],
      error: "模板已读取，但没有订单数据。请在第二行开始填写订单后重新上传。"
    };
  }
  const rows = dataRows.map((values, index) => {
    const raw = {};
    canonicalHeaders.forEach((header, headerIndex) => {
      raw[header] = normalizeImportCellValue(header, values[headerIndex]);
    });
    return { row_index: index + 1, raw };
  });
  return { rows, error: "" };
}

function openBatchDialog() {
  showBatchDialog.value = true;
  importPasteText.value = "";
  importRows.value = [];
  importPreviewRows.value = [];
  confirmedWarningRows.value = {};
  importFileName.value = "";
  importStatusMessage.value = "";
  notice.value = "";
}

function closeBatchDialog() {
  if (!importPreviewing.value && !importCommitting.value) {
    showBatchDialog.value = false;
  }
}

function importPreviewSummary(rows = importPreviewRows.value) {
  const ready = rows.filter(row => row.status === "ready").length;
  const warning = rows.filter(row => row.status === "warning").length;
  const failed = rows.filter(row => row.status === "error").length;
  return `预览完成：可导入 ${ready} 行，警告 ${warning} 行，错误 ${failed} 行`;
}

async function previewImportRows(rows, options = {}) {
  if (!rows.length || importPreviewing.value) {
    importStatusMessage.value = rows.length ? "正在预览，请稍候。" : "请先粘贴表格内容或上传 .xlsx / .csv 文件。";
    return;
  }
  importPreviewing.value = true;
  importStatusMessage.value = options.statusMessage || `已解析 ${rows.length} 行，正在预览……`;
  notice.value = "";
  error.value = "";
  try {
    importRows.value = rows;
    const payload = await previewTransportManualImport(rows);
    importPreviewRows.value = Array.isArray(payload?.items) ? payload.items : [];
    confirmedWarningRows.value = {};
    importStatusMessage.value = importPreviewRows.value.length
      ? importPreviewSummary()
      : "预览完成，但没有返回可展示的订单行。请检查模板内容后重新预览。";
  } catch (err) {
    importPreviewRows.value = [];
    confirmedWarningRows.value = {};
    importStatusMessage.value = err.message || "预览失败，请检查导入内容。";
  } finally {
    importPreviewing.value = false;
  }
}

function previewPastedRows(event) {
  const text = event?.currentTarget?.closest(".batch-import-panel")?.querySelector("textarea")?.value ?? importPasteText.value;
  importPasteText.value = text;
  if (!String(text || "").trim() && importRows.value.length) {
    previewImportRows(importRows.value, { statusMessage: `已解析 ${importRows.value.length} 行，正在预览……` });
    return;
  }
  const parsed = parseDelimitedText(text);
  if (parsed.error) {
    importStatusMessage.value = parsed.error;
    notice.value = "";
    importRows.value = [];
    importPreviewRows.value = [];
    confirmedWarningRows.value = {};
    return;
  }
  importFileName.value = "";
  previewImportRows(parsed.rows, { statusMessage: `已解析 ${parsed.rows.length} 行，正在预览……` });
}

async function copyImportTemplate() {
  const template = IMPORT_TEMPLATE_HEADERS.join("\t");
  try {
    await navigator.clipboard.writeText(template);
    notice.value = "导入模板表头已复制。";
  } catch (error) {
    importPasteText.value = template;
    notice.value = "浏览器不允许直接复制，已放入粘贴框。";
  }
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsvTemplate() {
  const rows = [IMPORT_TEMPLATE_HEADERS, ...IMPORT_TEMPLATE_EXAMPLES];
  return `\uFEFF${rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n")}\r\n`;
}

function downloadCsvTemplate() {
  downloadBlob(new Blob([buildCsvTemplate()], { type: "text/csv;charset=utf-8" }), "transport-manual-import-template.csv");
  notice.value = "CSV 导入模板已下载。";
}

function escapeExcelCell(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeExcelCell(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosTime = 0;
  const dosDate = 0x5b75;

  files.forEach(file => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0x0800);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, dosTime);
    writeUint16(local, 12, dosDate);
    writeUint32(local, 14, checksum);
    writeUint32(local, 18, dataBytes.length);
    writeUint32(local, 22, dataBytes.length);
    writeUint16(local, 26, nameBytes.length);
    local.set(nameBytes, 30);
    localParts.push(local, dataBytes);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, dosTime);
    writeUint16(central, 14, dosDate);
    writeUint32(central, 16, checksum);
    writeUint32(central, 20, dataBytes.length);
    writeUint32(central, 24, dataBytes.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + dataBytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, files.length);
  writeUint16(end, 10, files.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, offset);
  return concatBytes([...localParts, centralDirectory, end]);
}

function buildXlsxTemplate() {
  return createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="导入模板" sheetId="1" r:id="rId1"/><sheet name="填写示例" sheetId="2" r:id="rId2"/></sheets></workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`
    },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml([IMPORT_TEMPLATE_HEADERS]) },
    { name: "xl/worksheets/sheet2.xml", content: sheetXml([IMPORT_TEMPLATE_HEADERS, ...IMPORT_TEMPLATE_EXAMPLES]) }
  ]);
}

function downloadExcelTemplate() {
  downloadBlob(new Blob([buildXlsxTemplate()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "transport-manual-import-template.xlsx");
  notice.value = "Excel 导入模板已下载。";
}

async function handleImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  importFileName.value = file.name;
  importRows.value = [];
  importPreviewRows.value = [];
  confirmedWarningRows.value = {};
  importStatusMessage.value = "正在解析文件……";
  notice.value = "";
  error.value = "";
  let rows = [];
  try {
    if (/\.xls$/i.test(file.name) && !/\.xlsx$/i.test(file.name)) {
      importStatusMessage.value = "当前文件格式不支持，请上传 .xlsx 或 .csv 文件。";
      event.target.value = "";
      return;
    }
    if (/\.csv$/i.test(file.name)) {
      const parsed = parseDelimitedText(await file.text());
      if (parsed.error) {
        importStatusMessage.value = parsed.error;
        event.target.value = "";
        return;
      }
      rows = parsed.rows;
    } else if (/\.xlsx$/i.test(file.name)) {
      const parsed = parseSheetRows(await readXlsxFile(file));
      if (parsed.error) {
        importStatusMessage.value = parsed.error;
        event.target.value = "";
        return;
      }
      rows = parsed.rows;
    } else {
      importStatusMessage.value = "当前文件格式不支持，请上传 .xlsx 或 .csv 文件。";
      event.target.value = "";
      return;
    }
  } catch (err) {
    importStatusMessage.value = err.message || "文件解析失败，请确认上传的是 .xlsx 或 .csv 文件。";
    event.target.value = "";
    return;
  }
  importRows.value = rows;
  await previewImportRows(rows, { statusMessage: `已解析 ${rows.length} 行，正在预览……` });
  event.target.value = "";
}

function rowTone(row) {
  if (row.status === "error") return "danger";
  if (row.status === "warning") return "warning";
  return "success";
}

function groupDestination(group) {
  if (!group) return "--";
  return displayValue(group.location_to || group.location_from);
}

function groupSummaryText(group) {
  if (!group) return "";
  return [
    serviceLabel(group.service_type),
    group.airport_code,
    group.terminal,
    group.group_date || formatDateTime(group.preferred_time_start),
    `当前人数 ${displayValue(group.current_passenger_count)}`,
    groupDestination(group)
  ].filter(Boolean).join(" / ");
}

function rowStatusLabel(row) {
  if (row.status === "error") return "不可导入";
  if (row.status === "warning") return "警告";
  return "可导入";
}

async function setPreviewGroupId(row, value) {
  const source = importRows.value.find(item => Number(item.row_index) === Number(row.row_index));
  if (source) {
    source.raw = { ...(source.raw || {}), "Group ID": value };
  }
  if (importRows.value.length) {
    await refreshImportPreview();
  }
}

async function refreshImportPreview() {
  if (importRows.value.length) {
    await previewImportRows(importRows.value, { statusMessage: `已解析 ${importRows.value.length} 行，正在预览……` });
    return;
  }
  if (hasImportPasteText.value) {
    previewPastedRows();
    return;
  }
  if (importPreviewRows.value.length) {
    importStatusMessage.value = importPreviewSummary();
    return;
  }
  importStatusMessage.value = "请先粘贴表格内容或上传 .xlsx / .csv 文件。";
}

function toggleWarningConfirmation(row) {
  confirmedWarningRows.value = {
    ...confirmedWarningRows.value,
    [row.row_index]: !confirmedWarningRows.value[row.row_index]
  };
}

async function commitImportRows() {
  if (importCommitting.value || !importRows.value.length) return;
  if (!importPreviewRows.value.length) {
    notice.value = "请先完成预览，确认每一行状态后再导入。";
    return;
  }
  if (!canCommitImport.value) {
    notice.value = "没有可导入行，或仍有黄色提示未确认。红色错误行不会导入。";
    return;
  }
  importCommitting.value = true;
  notice.value = "";
  error.value = "";
  try {
    const result = await commitTransportManualImport(importRows.value, confirmedWarningRows.value);
    notice.value = `批量补录完成：导入 ${Number(result?.imported_count || 0)} 条，批次 ${displayValue(result?.import_batch_id)}。`;
    filters.importBatchId = result?.import_batch_id || "";
    showBatchDialog.value = false;
    await loadRequests(1);
  } catch (err) {
    notice.value = err.message || "批量导入失败，请重新预览后再提交。";
  } finally {
    importCommitting.value = false;
  }
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
  const selectedCount = selectedIds.value.length;
  const actionLabel = value ? "标记为已线下记录" : "取消线下记录";
  const confirmed = window.confirm(`确认将选中的 ${selectedCount} 条订单${actionLabel}吗？操作完成后列表会刷新。`);
  if (!confirmed) return;
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

async function saveWorkbenchRow(row) {
  const id = requestActionId(row);
  const key = draftKey(row);
  if (!id || !key || isRowSaving(row)) return;

  const payload = normalizedDraftPayload(row);
  if (!payload.student_name) {
    rowErrorMessages[key] = "学生姓名不能为空。";
    return;
  }
  if (payload.deposit_amount_gbp !== null && typeof payload.deposit_amount_gbp !== "number") {
    rowErrorMessages[key] = "定金金额必须是 0 或以上的数字。";
    return;
  }

  rowSavingIds.value = [...rowSavingIds.value, key];
  delete rowErrorMessages[key];
  notice.value = "";
  error.value = "";
  try {
    const updated = await updateTransportRequestSafeFields(id, payload);
    const nextRow = updated?.request || updated?.item || updated;
    requests.value = requests.value.map(item => (item.id === row.id ? { ...item, ...nextRow } : item));
    resetWorkbenchDraft({ ...row, ...nextRow });
    notice.value = `订单 ${displayValue(row.order_no)} 的客服工作台字段已保存。`;
  } catch (err) {
    rowErrorMessages[key] = `保存失败：${err.message || "请检查后重试"}。草稿已保留。`;
    notice.value = rowErrorMessages[key];
  } finally {
    rowSavingIds.value = rowSavingIds.value.filter(item => item !== key);
  }
}

function openTimeAdjustDialog(row) {
  timeAdjustTarget.value = row;
  timeAdjustError.value = "";
  timeAdjustCandidateError.value = "";
  timeAdjustCandidateGroups.value = [];
  timeAdjustForm.flight_datetime = toDateTimeLocalValue(row.flight_datetime);
  timeAdjustForm.preferred_time_start = toDateTimeLocalValue(row.preferred_time_start || row.flight_datetime);
  timeAdjustForm.reason = "";
  timeAdjustForm.handling_method = isRequestGrouped(row) ? "keep_group" : "direct";
  timeAdjustForm.target_group_id = "";
}

function closeTimeAdjustDialog() {
  if (timeAdjustSaving.value) return;
  timeAdjustTarget.value = null;
  timeAdjustError.value = "";
  timeAdjustCandidateError.value = "";
  timeAdjustCandidateGroups.value = [];
  timeAdjustForm.target_group_id = "";
}

async function loadTimeAdjustCandidateGroups() {
  const row = timeAdjustTarget.value;
  const id = requestActionId(row);
  if (!row || !id || !isTimeAdjustTransfer.value) return;

  const flightDatetime = fromDateTimeLocalValue(timeAdjustForm.flight_datetime);
  const preferredTimeStart = fromDateTimeLocalValue(timeAdjustForm.preferred_time_start);
  timeAdjustForm.target_group_id = "";
  timeAdjustCandidateGroups.value = [];
  timeAdjustCandidateError.value = "";

  if (!flightDatetime || !preferredTimeStart) {
    timeAdjustCandidateError.value = "请先填写有效的新航班时间和接机时间。";
    return;
  }

  timeAdjustCandidateLoading.value = true;
  try {
    const payload = await fetchTimeAdjustCandidateGroups(id, {
      flight_datetime: flightDatetime,
      preferred_time_start: preferredTimeStart
    });
    timeAdjustCandidateGroups.value = Array.isArray(payload?.candidate_groups) ? payload.candidate_groups : [];
  } catch (err) {
    timeAdjustCandidateError.value = err.message || "候选拼车组加载失败，请稍后重试。";
  } finally {
    timeAdjustCandidateLoading.value = false;
  }
}

async function saveTimeAdjustment() {
  const row = timeAdjustTarget.value;
  const id = requestActionId(row);
  if (!row || !id || timeAdjustConfirmDisabled.value) return;

  const flightDatetime = fromDateTimeLocalValue(timeAdjustForm.flight_datetime);
  const preferredTimeStart = fromDateTimeLocalValue(timeAdjustForm.preferred_time_start);
  if (!flightDatetime || !preferredTimeStart) {
    timeAdjustError.value = "请填写有效的新航班时间和接机时间。";
    return;
  }

  timeAdjustSaving.value = true;
  timeAdjustError.value = "";
  notice.value = "";
  error.value = "";
  try {
    const payload = {
      flight_datetime: flightDatetime,
      preferred_time_start: preferredTimeStart,
      reason: String(timeAdjustForm.reason || "").trim(),
      handling_method: timeAdjustForm.handling_method
    };
    if (timeAdjustForm.handling_method === "transfer_existing_group") {
      payload.target_group_id = timeAdjustForm.target_group_id;
    }
    const updated = await adjustTransportRequestTime(id, payload);
    const nextRow = updated?.request || updated?.item || updated;
    requests.value = requests.value.map(item => (item.id === row.id ? { ...item, ...nextRow } : item));
    resetWorkbenchDraft({ ...row, ...nextRow });
    notice.value = `订单 ${displayValue(row.order_no)} 的接机/航班时间已保存。`;
    timeAdjustTarget.value = null;
  } catch (err) {
    timeAdjustError.value = err.message || "时间调整保存失败，请检查后重试。";
  } finally {
    timeAdjustSaving.value = false;
  }
}

onMounted(() => {
  loadRequests(1);
});

watch(
  () => [
    filters.search,
    filters.serviceType,
    filters.airportCode,
    filters.status,
    filters.contactStatus,
    filters.paymentCollectionStatus,
    filters.offlineRecorded,
    filters.lastOperatedBy,
    filters.importBatchId,
    filters.source,
    filters.dateFrom,
    filters.dateTo,
    filters.sort
  ],
  () => {
    selectedIds.value = [];
  }
);

watch(
  () => filters.pageSize,
  () => {
    selectedIds.value = [];
    loadRequests(1);
  }
);

watch(
  () => [
    manualForm.group_id,
    manualForm.service_type,
    manualForm.airport_code,
    manualForm.terminal,
    manualForm.service_time,
    manualForm.flight_datetime,
    manualForm.address,
    manualForm.passenger_count
  ],
  () => {
    manualGroupConfirmedId.value = "";
    manualGroupMessage.value = "";
    manualPreview.value = null;
    manualConfirmWarnings.value = false;
  }
);

watch(
  () => [
    timeAdjustForm.handling_method,
    timeAdjustForm.flight_datetime,
    timeAdjustForm.preferred_time_start,
    timeAdjustTarget.value?.id
  ],
  () => {
    if (isTimeAdjustTransfer.value) {
      loadTimeAdjustCandidateGroups();
      return;
    }
    timeAdjustForm.target_group_id = "";
    timeAdjustCandidateGroups.value = [];
    timeAdjustCandidateError.value = "";
  }
);
</script>

<template>
  <section class="transport-requests-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 5 transport list migration</p>
        <h2>登记接送机订单</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" @click="openBatchDialog">批量补录</button>
        <button class="primary-button" type="button" @click="openManualDialog">补录接送机订单</button>
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
    <EmptyState v-else-if="!hasRequests" title="暂无符合条件的接机送机订单" description="请调整关键词、机场、状态或日期范围后重试。" />
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
              {{ deletingId === String(requestActionId(row)) ? "处理中..." : requestDangerActionLabel(row) }}
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
        <template #cell-wb_selected="{ row }">
          <input
            type="checkbox"
            :checked="selectedIds.includes(String(row.id))"
            :aria-label="`选择订单 ${displayValue(row.order_no)}`"
            @change="toggleRowSelection(row)"
          />
        </template>
        <template #cell-wb_row_index="{ row }">
          <span class="workbench-row-number">{{ rowNumber(row) }}</span>
        </template>
        <template #cell-wb_service_date="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ rowServiceDate(row) }}</span>
        </template>
        <template #cell-wb_service_time="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ rowServiceTimeRange(row) }}</span>
        </template>
        <template #cell-wb_student_name="{ row }">
          <input v-model="ensureWorkbenchDraft(row).student_name" class="workbench-input" />
        </template>
        <template #cell-wb_phone="{ row }">
          <input v-model="ensureWorkbenchDraft(row).phone" class="workbench-input" />
        </template>
        <template #cell-wb_wechat="{ row }">
          <input v-model="ensureWorkbenchDraft(row).wechat" class="workbench-input" />
        </template>
        <template #cell-wb_service_type="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ serviceLabel(row.service_type) }}</span>
        </template>
        <template #cell-wb_airport="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ displayValue(row.airport_code || row.airport_name) }}</span>
        </template>
        <template #cell-wb_terminal="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ displayValue(row.terminal) }}</span>
        </template>
        <template #cell-wb_flight_no="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ displayValue(row.flight_no) }}</span>
        </template>
        <template #cell-wb_flight_datetime="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ formatDateTime(row.flight_datetime) }}</span>
        </template>
        <template #cell-wb_passenger_count="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ displayValue(row.passenger_count) }}</span>
        </template>
        <template #cell-wb_luggage_count="{ row }">
          <span class="locked-cell" :title="lockTitle()">{{ displayValue(row.luggage_count) }}</span>
        </template>
        <template #cell-wb_group_status="{ row }">
          <span class="cell-stack" :title="lockTitle()">
            <strong class="cell-truncate locked-cell">{{ groupStatusLabel(row) }}</strong>
            <a v-if="groupHref(row)" class="table-link cell-truncate" :href="groupHref(row)">{{ displayValue(row.group_id) }}</a>
            <small v-else class="cell-truncate">--</small>
          </span>
        </template>
        <template #cell-wb_contact_status="{ row }">
          <select v-model="ensureWorkbenchDraft(row).contact_status" class="workbench-input">
            <option value="uncontacted">未联系</option>
            <option value="contacted">已联系</option>
          </select>
        </template>
        <template #cell-wb_payment_collection_status="{ row }">
          <select v-model="ensureWorkbenchDraft(row).payment_collection_status" class="workbench-input">
            <option value="unpaid">未收款</option>
            <option value="deposit_paid">已付定金</option>
            <option value="fully_paid">已付全款</option>
          </select>
        </template>
        <template #cell-wb_deposit_amount_gbp="{ row }">
          <input v-model="ensureWorkbenchDraft(row).deposit_amount_gbp" class="workbench-input" min="0" step="0.01" type="number" />
        </template>
        <template #cell-wb_offline_recorded="{ row }">
          <StatusBadge :tone="row.offline_recorded ? 'success' : 'neutral'">
            {{ offlineRecordedLabel(row.offline_recorded) }}
          </StatusBadge>
        </template>
        <template #cell-wb_admin_note="{ row }">
          <textarea v-model="ensureWorkbenchDraft(row).admin_note" class="workbench-input workbench-note" rows="2"></textarea>
        </template>
        <template #cell-wb_last_operation="{ row }">
          <span class="cell-stack" :title="[row.last_operated_by, formatDateTime(row.last_operated_at)].filter(Boolean).join(' / ') || '--'">
            <strong class="cell-truncate">{{ displayValue(row.last_operated_by) }}</strong>
            <small class="cell-truncate">{{ formatDateTime(row.last_operated_at) }}</small>
          </span>
        </template>
        <template #cell-wb_actions="{ row }">
          <div class="table-action-group table-action-group--compact workbench-actions">
            <button
              class="table-action-button table-action-button--paid"
              type="button"
              :disabled="isRowSaving(row) || !isWorkbenchRowDirty(row)"
              @click="saveWorkbenchRow(row)"
            >
              {{ isRowSaving(row) ? "保存中..." : isWorkbenchRowDirty(row) ? "保存" : "已保存" }}
            </button>
            <button class="table-action-button" type="button" @click="openTimeAdjustDialog(row)">调整时间</button>
            <button class="table-action-button" type="button" @click="openRequestDetail(row)">详情</button>
            <button
              class="table-action-button table-action-button--danger"
              type="button"
              :disabled="deletingId === String(requestActionId(row))"
              @click="openDeleteDialog(row)"
            >
              {{ deletingId === String(requestActionId(row)) ? "处理中..." : requestDangerActionLabel(row) }}
            </button>
            <small v-if="isWorkbenchRowDirty(row)" class="workbench-dirty-label">未保存修改</small>
            <small v-if="rowErrorMessages[draftKey(row)]" class="workbench-error-label">{{ rowErrorMessages[draftKey(row)] }}</small>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>

    <ConfirmDialog
      :open="Boolean(timeAdjustTarget)"
      title="调整接机/航班时间"
      confirm-label="保存调整"
      cancel-label="取消"
      :loading="timeAdjustSaving"
      panel-class="confirm-dialog__panel--wide"
      :confirm-disabled="timeAdjustConfirmDisabled"
      tone="neutral"
      @cancel="closeTimeAdjustDialog"
      @confirm="saveTimeAdjustment"
    >
      <div class="time-adjust-dialog">
        <div class="time-adjust-readonly-grid">
          <div>
            <span>当前航班时间</span>
            <strong>{{ formatDateTime(timeAdjustTarget?.flight_datetime) }}</strong>
          </div>
          <div>
            <span>当前接机时间</span>
            <strong>{{ formatDateTime(timeAdjustTarget?.preferred_time_start || timeAdjustTarget?.flight_datetime) }}</strong>
          </div>
          <div class="time-adjust-readonly-grid__wide">
            <span>当前拼车组信息</span>
            <strong>{{ groupInfoText(timeAdjustTarget) }}</strong>
          </div>
        </div>

        <div class="manual-import-grid">
          <label class="field">
            <span>新航班时间 *</span>
            <input v-model="timeAdjustForm.flight_datetime" required type="datetime-local" />
          </label>
          <label class="field">
            <span>新接机时间 *</span>
            <input v-model="timeAdjustForm.preferred_time_start" required type="datetime-local" />
          </label>
          <label class="field manual-import-grid__wide">
            <span>调整原因 *</span>
            <textarea v-model="timeAdjustForm.reason" rows="3" placeholder="请填写客服确认的调整原因"></textarea>
          </label>
        </div>

        <div v-if="isTimeAdjustGrouped" class="time-adjust-options">
          <span class="time-adjust-options__title">处理方式 *</span>
          <label class="time-adjust-option">
            <input v-model="timeAdjustForm.handling_method" type="radio" value="keep_group" />
            <span>
              <strong>保留在当前拼车组</strong>
              <small>适用于轻微延误且客服确认仍可同行；不改拼车组成员、人数和剩余座位。</small>
            </span>
          </label>
          <label class="time-adjust-option">
            <input v-model="timeAdjustForm.handling_method" type="radio" value="move_out" />
            <span>
              <strong>移出当前拼车组并新建单人待匹配组</strong>
              <small>适用于时间变化较大；会同步原组人数，并给该订单保留新的单人拼车组容器。</small>
            </span>
          </label>
          <label class="time-adjust-option">
            <input v-model="timeAdjustForm.handling_method" type="radio" value="transfer_existing_group" />
            <span>
              <strong>转移到其他已有合适拼车组</strong>
              <small>系统会按新时间、机场、服务类型、座位和拼车状态筛选候选组；客服只能从候选组中选择，不能手动输入 group_id。</small>
            </span>
          </label>
          <div v-if="isTimeAdjustTransfer" class="time-adjust-candidates">
            <div class="time-adjust-candidates__header">
              <strong>候选拼车组</strong>
              <button class="table-action-button" type="button" :disabled="timeAdjustCandidateLoading" @click="loadTimeAdjustCandidateGroups">刷新</button>
            </div>
            <p v-if="timeAdjustCandidateLoading" class="time-adjust-hint">正在加载候选拼车组...</p>
            <p v-else-if="timeAdjustCandidateError" class="workbench-error-label">{{ timeAdjustCandidateError }}</p>
            <p v-else-if="!timeAdjustCandidateGroups.length" class="time-adjust-hint">没有符合条件的已有拼车组，可选择移出并新建单人待匹配组。</p>
            <div v-else class="time-adjust-candidate-list">
              <label
                v-for="group in timeAdjustCandidateGroups"
                :key="group.group_id"
                class="time-adjust-candidate"
                :class="{ 'is-selected': timeAdjustForm.target_group_id === group.group_id }"
              >
                <input v-model="timeAdjustForm.target_group_id" type="radio" :value="group.group_id" />
                <span>
                  <strong>{{ candidateGroupTitle(group) }}</strong>
                  <small>{{ candidateGroupMeta(group) }}</small>
                  <small v-if="Array.isArray(group.warnings) && group.warnings.length" class="time-adjust-candidate__warning">
                    {{ group.warnings.map(item => item.message || item.code).join("；") }}
                  </small>
                </span>
              </label>
            </div>
          </div>
        </div>
        <p v-else class="time-adjust-hint">该订单未加入拼车组，保存后只更新本订单时间，不创建拼车组、不自动匹配。</p>
        <p v-if="timeAdjustDisableReason" class="workbench-error-label">{{ timeAdjustDisableReason }}</p>
        <p v-if="timeAdjustError" class="workbench-error-label">{{ timeAdjustError }}</p>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      :open="showManualDialog"
      title="补录接送机订单"
      :confirm-label="manualConfirmWarnings ? '确认黄色提示并补录' : '提交补录'"
      :loading="manualSaving"
      panel-class="confirm-dialog__panel--wide"
      :confirm-disabled="false"
      @cancel="closeManualDialog"
      @confirm="submitManualForm"
    >
      <div v-if="manualSubmitAttempted && manualRequiredErrors.length" class="import-error-box">
        <strong>必填项未完成</strong>
        <ul>
          <li v-for="item in manualRequiredErrors" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div class="manual-import-sections">
        <section class="manual-import-section">
          <h4>学生信息</h4>
          <p class="manual-section-hint">手机号和微信号至少填写一个。</p>
          <div class="manual-import-grid">
            <label class="field">
              <span>学生姓名 *</span>
              <input v-model="manualForm.student_name" required />
              <small v-if="manualFieldErrors.student_name" class="field-error">{{ manualFieldErrors.student_name }}</small>
            </label>
            <label class="field"><span>拼音/英文名</span><input v-model="manualForm.english_name" /></label>
            <label class="field">
              <span>手机号</span>
              <input v-model="manualForm.phone" placeholder="手机号/微信号至少填一个" />
              <small v-if="manualFieldErrors.contact" class="field-error">{{ manualFieldErrors.contact }}</small>
            </label>
            <label class="field">
              <span>微信号</span>
              <input v-model="manualForm.wechat" placeholder="手机号/微信号至少填一个" />
              <small v-if="manualFieldErrors.contact" class="field-error">{{ manualFieldErrors.contact }}</small>
            </label>
            <label class="field"><span>邮箱</span><input v-model="manualForm.email" type="email" /></label>
            <label class="field">
              <span>人数 *</span>
              <input v-model.number="manualForm.passenger_count" min="1" required type="number" />
              <small v-if="manualFieldErrors.passenger_count" class="field-error">{{ manualFieldErrors.passenger_count }}</small>
            </label>
          </div>
        </section>

        <section class="manual-import-section">
          <h4>行程信息</h4>
          <div class="manual-import-grid">
            <label class="field">
              <span>服务类型 *</span>
              <select v-model="manualForm.service_type" required>
                <option value="pickup">接机</option>
                <option value="dropoff">送机</option>
              </select>
              <small v-if="manualFieldErrors.service_type" class="field-error">{{ manualFieldErrors.service_type }}</small>
            </label>
            <label class="field">
              <span>机场 *</span>
              <input v-model="manualForm.airport_code" placeholder="LHR / LGW" required />
              <small v-if="manualFieldErrors.airport_code" class="field-error">{{ manualFieldErrors.airport_code }}</small>
            </label>
            <label class="field">
              <span>航站楼 *</span>
              <input v-model="manualForm.terminal" required />
              <small v-if="manualFieldErrors.terminal" class="field-error">{{ manualFieldErrors.terminal }}</small>
            </label>
            <label class="field">
              <span>航班号 *</span>
              <input v-model="manualForm.flight_no" required />
              <small v-if="manualFieldErrors.flight_no" class="field-error">{{ manualFieldErrors.flight_no }}</small>
            </label>
            <label class="field">
              <span>航班日期时间 *</span>
              <input v-model="manualForm.flight_datetime" required type="datetime-local" />
              <small v-if="manualFieldErrors.flight_datetime" class="field-error">{{ manualFieldErrors.flight_datetime }}</small>
            </label>
            <label class="field">
              <span>服务时间 *</span>
              <input v-model="manualForm.service_time" required type="datetime-local" />
              <small v-if="manualFieldErrors.service_time" class="field-error">{{ manualFieldErrors.service_time }}</small>
            </label>
            <label class="field manual-import-grid__wide">
              <span>{{ manualAddressLabel }} *</span>
              <input v-model="manualForm.address" required />
              <small v-if="manualFieldErrors.address" class="field-error">{{ manualFieldErrors.address }}</small>
            </label>
            <label class="field"><span>行李数量</span><input v-model.number="manualForm.luggage_count" min="0" type="number" /></label>
            <label class="field manual-import-grid__wide"><span>行李备注</span><input v-model="manualForm.luggage_note" /></label>
          </div>
        </section>

        <section class="manual-import-section">
          <h4>拼车与付款</h4>
          <div class="manual-import-grid">
            <label class="field">
              <span>是否愿意拼车</span>
              <select v-model="manualForm.shareable">
                <option :value="true">是</option>
                <option :value="false">否</option>
              </select>
            </label>
            <label class="field"><span>价格</span><input v-model="manualForm.price" inputmode="decimal" /></label>
            <label class="field">
              <span>付款状态</span>
              <select v-model="manualForm.payment_status">
                <option value="unpaid">未付款</option>
                <option value="paid">已付款</option>
                <option value="pending">待确认</option>
                <option value="waived">免付</option>
              </select>
            </label>
            <label class="field manual-import-grid__wide"><span>已有 Group ID</span><input v-model="manualForm.group_id" placeholder="可留空自动建组" /></label>
            <div class="manual-import-grid__wide group-check-panel">
              <div class="batch-import-actions">
                <button class="secondary-button" type="button" :disabled="manualGroupChecking || !manualForm.group_id" @click="checkManualGroup">
                  {{ manualGroupChecking ? "校验中..." : "校验并确认 Group" }}
                </button>
                <span v-if="manualForm.group_id && manualGroupConfirmedId === manualForm.group_id" class="import-success-text">已确认可加入</span>
                <span v-else-if="manualForm.group_id" class="import-warning-text">填写已有 Group ID 后必须先校验确认</span>
              </div>
              <p v-if="manualGroupMessage" class="muted-line">{{ manualGroupMessage }}</p>
              <article v-if="manualPreview?.target_group" class="group-summary-card">
                <div><span>Group ID</span><strong>{{ manualPreview.target_group.group_id }}</strong></div>
                <div><span>服务类型</span><strong>{{ serviceLabel(manualPreview.target_group.service_type) }}</strong></div>
                <div><span>机场</span><strong>{{ displayValue(manualPreview.target_group.airport_code) }}</strong></div>
                <div><span>航站楼</span><strong>{{ displayValue(manualPreview.target_group.terminal) }}</strong></div>
                <div><span>日期</span><strong>{{ displayValue(manualPreview.target_group.group_date || formatDateTime(manualPreview.target_group.preferred_time_start)) }}</strong></div>
                <div><span>当前人数</span><strong>{{ displayValue(manualPreview.target_group.current_passenger_count) }}</strong></div>
                <div class="group-summary-card__wide"><span>目的地/上车地</span><strong>{{ groupDestination(manualPreview.target_group) }}</strong></div>
              </article>
            </div>
          </div>
        </section>

        <section class="manual-import-section">
          <h4>备注</h4>
          <label class="field"><span>备注</span><textarea v-model="manualForm.notes" rows="3"></textarea></label>
        </section>
      </div>
      <div v-if="manualPreview?.warnings?.length" class="import-warning-box">
        <strong>黄色提示</strong>
        <ul>
          <li v-for="warning in manualPreview.warnings" :key="warning.code + warning.message">{{ warning.message }}</li>
        </ul>
      </div>
      <div v-if="manualPreview?.errors?.length" class="import-error-box">
        <strong>不可提交</strong>
        <ul>
          <li v-for="item in manualPreview.errors" :key="item.code + item.message">{{ item.message }}</li>
        </ul>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      :open="showBatchDialog"
      title="批量补录接送机订单"
      confirm-label="导入可导入行"
      :loading="importCommitting"
      :confirm-disabled="!canCommitImport"
      @cancel="closeBatchDialog"
      @confirm="commitImportRows"
    >
      <div class="batch-import-panel">
        <label class="field">
          <span>粘贴 Excel / Google Sheet 内容</span>
          <textarea v-model="importPasteText" rows="6" placeholder="第一行为表头，下面每行一条订单"></textarea>
        </label>
        <div class="batch-import-actions">
          <button class="secondary-button" type="button" @click="copyImportTemplate">复制导入模板</button>
          <button class="secondary-button" type="button" @click="downloadCsvTemplate">下载 CSV 模板</button>
          <button class="secondary-button" type="button" @click="downloadExcelTemplate">下载 Excel 模板</button>
          <button class="secondary-button" type="button" :disabled="importPreviewing" @click="previewPastedRows">预览粘贴内容</button>
          <label class="secondary-button batch-import-file">
            上传 CSV / XLSX
            <input accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" @change="handleImportFile" />
          </label>
          <button class="secondary-button" type="button" :disabled="importPreviewing || !canPreviewImport" @click="refreshImportPreview">重新校验预览</button>
        </div>
        <p v-if="importStatusMessage" class="muted-line">{{ importStatusMessage }}</p>
        <p v-if="importCommitBlockReason" class="muted-line">{{ importCommitBlockReason }}</p>
        <details class="import-template-help">
          <summary>模板字段说明</summary>
          <ol>
            <li v-for="item in IMPORT_TEMPLATE_NOTES" :key="item">{{ item }}</li>
          </ol>
        </details>
        <details class="import-template-help">
          <summary>可直接测试的粘贴示例</summary>
          <textarea class="template-sample-textarea" readonly rows="3" :value="IMPORT_TEMPLATE_SAMPLE_TEXT"></textarea>
        </details>
        <p v-if="importFileName" class="muted-line">已读取文件：{{ importFileName }}</p>
        <div v-if="importPreviewRows.length" class="import-preview-table-wrap">
          <table class="import-preview-table">
            <thead>
              <tr>
                <th>原始行号</th>
                <th>行状态</th>
                <th>学生姓名</th>
                <th>手机号/微信号</th>
                <th>服务类型</th>
                <th>机场</th>
                <th>航站楼</th>
                <th>航班号</th>
                <th>航班日期时间</th>
                <th>服务日期时间</th>
                <th>地址</th>
                <th>人数</th>
                <th>行李数量</th>
                <th>价格</th>
                <th>付款状态</th>
                <th>Group ID</th>
                <th>错误/警告原因</th>
                <th>确认</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in importPreviewRows" :key="row.row_index" :class="`is-${row.status}`">
                <td>{{ row.row_index }}</td>
                <td><StatusBadge :tone="rowTone(row)">{{ rowStatusLabel(row) }}</StatusBadge></td>
                <td>{{ displayValue(row.clean?.student_name) }}</td>
                <td>{{ displayValue(row.clean?.phone || row.clean?.wechat) }}</td>
                <td>{{ serviceLabel(row.clean?.service_type) }}</td>
                <td>{{ displayValue(row.clean?.airport_code) }}</td>
                <td>{{ displayValue(row.clean?.terminal) }}</td>
                <td>{{ displayValue(row.clean?.flight_no) }}</td>
                <td>{{ formatDateTime(row.clean?.flight_datetime) }}</td>
                <td>{{ formatDateTime(row.clean?.service_time) }}</td>
                <td>{{ displayValue(row.clean?.address) }}</td>
                <td>{{ displayValue(row.clean?.passenger_count) }}</td>
                <td>{{ displayValue(row.clean?.luggage_note || row.clean?.luggage_count) }}</td>
                <td>{{ displayValue(row.clean?.price) }}</td>
                <td>{{ displayValue(row.clean?.payment_status) }}</td>
                <td>
                  <input
                    class="import-group-input"
                    :value="row.clean?.group_id || ''"
                    placeholder="留空新建组"
                    @change="setPreviewGroupId(row, $event.target.value)"
                  />
                  <small v-if="row.target_group" class="muted-line">{{ groupSummaryText(row.target_group) }}</small>
                  <div v-if="row.candidate_groups?.length" class="candidate-group-list">
                    <button
                      v-for="group in row.candidate_groups || []"
                      :key="group.group_id"
                      class="table-action-button"
                      type="button"
                      @click="setPreviewGroupId(row, group.group_id)"
                    >
                      {{ group.group_id }}
                    </button>
                  </div>
                </td>
                <td>
                  <ul class="import-issues">
                    <li v-for="item in row.errors" :key="item.code + item.message" class="is-error">{{ item.message }}</li>
                    <li v-for="item in row.warnings" :key="item.code + item.message" class="is-warning">{{ item.message }}</li>
                  </ul>
                </td>
                <td>
                  <label v-if="row.warnings?.length && row.status !== 'error'" class="checkbox-line">
                    <input
                      type="checkbox"
                      :checked="Boolean(confirmedWarningRows[row.row_index])"
                      @change="toggleWarningConfirmation(row)"
                    />
                    确认
                  </label>
                  <span v-else>--</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ConfirmDialog>

    <ConfirmDialog
      :open="Boolean(deleteCandidate)"
      :title="deleteDialogTitle"
      :confirm-label="deleteDialogConfirmLabel"
      :loading="Boolean(deletingId)"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    >
      <p class="confirm-dialog__warning">{{ deleteDialogWarning }}</p>
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
