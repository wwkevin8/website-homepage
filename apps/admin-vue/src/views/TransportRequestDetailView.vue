<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  confirmTransportOrderChange,
  fetchTransportGroup,
  fetchTransportGroups,
  fetchTransportRequest,
  previewTransportOrderChange,
  saveTransportGroupMembers,
  updateTransportRequestSafeFields
} from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import TransportOrderChangeDrawer from "@/components/TransportOrderChangeDrawer.vue";

const route = useRoute();
const request = ref(null);
const loading = ref(false);
const saving = ref(false);
const assigning = ref(false);
const error = ref("");
const notice = ref("");
const assignGroupId = ref("");
const assignableGroups = ref([]);
const changeDrawerOpen = ref(false);
const changePreviewLoading = ref(false);
const changeConfirming = ref(false);
const changePreview = ref(null);
const changeError = ref("");
const changeNotice = ref("");
const selectedGroupAction = ref("");
const selectedTargetGroupId = ref("");
const nowTick = ref(Date.now());
let previewClock = null;

const requestId = computed(() => String(route.params.id || "").trim());
const operationLogs = computed(() => Array.isArray(request.value?.operation_logs) ? request.value.operation_logs : []);
const currentGroupId = computed(() => String(request.value?.group_id || "").trim());
const currentGroupRef = computed(() => String(request.value?.group_ref || request.value?.group_id || "").trim());
const hasCurrentGroup = computed(() => Boolean(currentGroupId.value && currentGroupRef.value));
const previewExpired = computed(() => {
  const expiresAt = changePreview.value?.preview_expires_at;
  if (!expiresAt) return false;
  const parsed = new Date(expiresAt).getTime();
  return Number.isFinite(parsed) && parsed <= nowTick.value;
});
const confirmReasonMissing = computed(() => !emptyToNull(changeForm.reason));
const confirmButtonDisabled = computed(() => {
  if (!changePreview.value || changeConfirming.value) return true;
  if (changePreview.value.classification === "ordinary_time_adjustment") return true;
  if (!changePreview.value.preview_token || previewExpired.value) return true;
  if (confirmReasonMissing.value) return true;
  return selectedGroupAction.value === "transfer_existing_group" && !selectedTargetGroupId.value;
});

const airportOptions = [
  { code: "LHR", name: "Heathrow" },
  { code: "LGW", name: "Gatwick" },
  { code: "MAN", name: "Manchester" },
  { code: "BHX", name: "Birmingham" },
  { code: "LTN", name: "Luton" },
  { code: "STN", name: "Stansted" }
];

const editableForm = reactive({
  airport_code: "",
  airport_name: "",
  terminal: "",
  flight_no: "",
  flight_datetime: "",
  location_from: "",
  location_to: "",
  preferred_time_start: "",
  notes: "",
  admin_note: ""
});

const changeForm = reactive({
  airport_code: "",
  airport_name: "",
  terminal: "",
  flight_no: "",
  flight_datetime: "",
  preferred_time_start: "",
  preferred_time_end: "",
  passenger_count: 1,
  luggage_count: 0,
  shareable: true,
  paid_amount_gbp: "",
  reason: ""
});

const groupActionOptions = [
  { value: "no_group_change", label: "No group change" },
  { value: "keep_group", label: "Keep original group" },
  { value: "move_out_no_group", label: "Move out, no group" },
  { value: "move_out_new_single", label: "Move out, create single pending group" },
  { value: "transfer_existing_group", label: "Transfer to preview candidate" }
];

function parseJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

const extraDetail = computed(() => parseJson(request.value?.extra_detail_json || request.value?.details_json));

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function displayBoolean(value) {
  return value === true ? "Yes" : value === false ? "No" : "--";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "--";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `GBP ${parsed.toFixed(2)}` : displayValue(value);
}

function fieldValue(...values) {
  return displayValue(firstValue(...values));
}

function formText(...values) {
  const value = firstValue(...values);
  return value ? String(value) : "";
}

function emptyToNull(value) {
  const next = String(value || "").trim();
  return next ? next : null;
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

function formatDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").replace(" ", "T").slice(0, 16);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function localDateTimeToIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function datePart(value) {
  const local = formatDateTimeLocal(value);
  return local ? local.slice(0, 10) : "";
}

function dateOnly(value) {
  const local = formatDateTimeLocal(value);
  return local ? local.slice(0, 10) : "";
}

function serviceLabel() {
  const labels = {
    pickup: "接机",
    dropoff: "送机"
  };
  return labels[request.value?.service_type] || displayValue(request.value?.service_type);
}

function paymentStatusLabel(status) {
  const labels = {
    unpaid: "unpaid",
    deposit_paid: "deposit paid",
    fully_paid: "fully paid"
  };
  return labels[status] || displayValue(status);
}

function currentPaidAmountHint() {
  if (request.value?.payment_collection_status === "fully_paid" && !request.value?.confirmed_price_gbp) {
    return "fully_paid but no confirmed price: confirm paid amount before saving.";
  }
  return `deposit reference: ${formatMoney(request.value?.deposit_amount_gbp)}`;
}

function luggageSummary() {
  const fromJson = firstValue(
    extraDetail.value?.luggage_text,
    extraDetail.value?.luggage,
    extraDetail.value?.luggage_summary,
    extraDetail.value?.luggageDescription
  );
  if (fromJson) return displayValue(fromJson);

  const count = Number(request.value?.luggage_count || 0);
  return count > 0 ? `共 ${count} 件` : "--";
}

function groupDetailHref(groupRef = currentGroupRef.value) {
  return groupRef
    ? `/admin/transport/groups/${encodeURIComponent(groupRef)}?return_to=${encodeURIComponent(`/admin/transport/requests/${requestId.value}`)}`
    : "";
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin/transport/requests") ? returnTo : "/admin/transport/requests";
}

function populateEditableForm(record = {}) {
  editableForm.airport_code = formText(record.airport_code);
  editableForm.airport_name = formText(record.airport_name, extraDetail.value?.airport_name);
  editableForm.terminal = formText(record.terminal, extraDetail.value?.terminal);
  editableForm.flight_no = formText(record.flight_no, extraDetail.value?.flight_no);
  editableForm.flight_datetime = formatDateTimeLocal(record.flight_datetime);
  editableForm.location_from = formText(record.location_from, record.pickup_address, extraDetail.value?.location_from);
  editableForm.location_to = formText(record.location_to, record.dropoff_address, record.address_full, extraDetail.value?.location_to);
  editableForm.preferred_time_start = formatDateTimeLocal(firstValue(record.preferred_time_start, record.service_time, extraDetail.value?.preferred_time_start));
  editableForm.notes = formText(record.notes, extraDetail.value?.notes);
  editableForm.admin_note = formText(record.admin_note, record.staff_note, record.customer_service_note);
}

function populateChangeForm(record = {}) {
  changeForm.airport_code = formText(record.airport_code);
  changeForm.airport_name = formText(record.airport_name, extraDetail.value?.airport_name);
  changeForm.terminal = formText(record.terminal, extraDetail.value?.terminal);
  changeForm.flight_no = formText(record.flight_no, extraDetail.value?.flight_no);
  changeForm.flight_datetime = formatDateTimeLocal(record.flight_datetime);
  changeForm.preferred_time_start = formatDateTimeLocal(firstValue(record.preferred_time_start, record.service_time, extraDetail.value?.preferred_time_start));
  changeForm.preferred_time_end = formatDateTimeLocal(record.preferred_time_end);
  changeForm.passenger_count = Number(record.passenger_count || 1);
  changeForm.luggage_count = Number(record.luggage_count || 0);
  changeForm.shareable = record.shareable !== false;
  changeForm.paid_amount_gbp = "";
  changeForm.reason = "";
}

function handleAirportCodeChange() {
  const option = airportOptions.find(item => item.code === editableForm.airport_code);
  if (option && (!editableForm.airport_name || airportOptions.some(item => item.name === editableForm.airport_name))) {
    editableForm.airport_name = option.name;
  }
}

function handleChangeAirportCodeChange() {
  const option = airportOptions.find(item => item.code === changeForm.airport_code);
  if (option && (!changeForm.airport_name || airportOptions.some(item => item.name === changeForm.airport_name))) {
    changeForm.airport_name = option.name;
  }
}

function logAdminName(log) {
  return displayValue(log?.metadata?.admin_name || log?.admin_user?.name || log?.admin_user?.username || log?.admin_user?.email || log?.admin_user_id);
}

function logActionLabel(log) {
  const labels = {
    update_transport_request: "编辑订单",
    add_transport_request_to_group: "加入拼车组",
    remove_transport_request_from_group: "移出拼车组",
    move_transport_request_group: "更换拼车组"
  };
  return labels[log?.action] || displayValue(log?.action);
}

function logChangedFields(log) {
  if (Array.isArray(log?.metadata?.changed_fields)) {
    return log.metadata.changed_fields;
  }
  const beforeData = log?.before_data || {};
  const afterData = log?.after_data || {};
  return Array.from(new Set([...Object.keys(beforeData), ...Object.keys(afterData)])).map(field => ({
    field,
    label: field,
    before: beforeData[field],
    after: afterData[field]
  }));
}

function openChangeDrawer() {
  if (!request.value) return;
  populateChangeForm(request.value);
  changePreview.value = null;
  changeError.value = "";
  changeNotice.value = "";
  selectedGroupAction.value = "";
  selectedTargetGroupId.value = "";
  changeDrawerOpen.value = true;
}

function closeChangeDrawer() {
  if (changePreviewLoading.value || changeConfirming.value) return;
  changeDrawerOpen.value = false;
}

async function handleOrderChangeSaved() {
  await loadRequest();
  notice.value = "订单变更已保存，订单详情已刷新。";
}

function buildChangePayload() {
  return {
    reason: emptyToNull(changeForm.reason),
    paid_amount_gbp: changeForm.paid_amount_gbp === "" ? undefined : Number(changeForm.paid_amount_gbp),
    changes: {
      airport_code: emptyToNull(changeForm.airport_code),
      airport_name: emptyToNull(changeForm.airport_name),
      terminal: emptyToNull(changeForm.terminal),
      flight_no: emptyToNull(changeForm.flight_no),
      flight_datetime: localDateTimeToIso(changeForm.flight_datetime),
      preferred_time_start: localDateTimeToIso(changeForm.preferred_time_start),
      preferred_time_end: localDateTimeToIso(changeForm.preferred_time_end),
      passenger_count: Number(changeForm.passenger_count || 1),
      luggage_count: Number(changeForm.luggage_count || 0),
      shareable: Boolean(changeForm.shareable)
    }
  };
}

function candidateGroupOptions() {
  return changePreview.value?.group_context?.candidate_groups || [];
}

function candidateGroupLabel(group) {
  const groupId = group?.group_id || group?.id || group?.group_ref;
  const seats = `${Number(group?.current_passenger_count || 0)}/${Number(group?.max_passengers || 0)}`;
  return `${displayValue(groupId)} / ${displayValue(group?.airport_code)} ${displayValue(group?.terminal)} / ${formatDateTime(group?.preferred_time_start || group?.flight_time_reference || group?.group_date)} / seats ${seats}`;
}

function changeErrorMessage(err) {
  const message = String(err?.message || "");
  if (/expired/i.test(message)) return "预览已过期，请重新预览。";
  if (/stale|changed|snapshot/i.test(message)) return "订单或拼车组信息已变化，请重新预览后再确认。";
  if (/cannot be kept|unsupported group_action|must use|group_action/i.test(message)) return "当前分组处理方式不可用，请重新选择。";
  if (/target_group_id|candidate/i.test(message)) return "目标拼车组不可用，请从预览返回的候选组中选择。";
  if (/paid|payment|price|amount/i.test(message)) return `价格或收款状态需要客服确认：${message}`;
  return message || "订单变更保存失败，请重新预览后再确认。";
}

function previewPricingValue(snapshotName, field) {
  const snapshot = changePreview.value?.[snapshotName];
  return snapshot?.[field];
}

function highRiskWarnings() {
  const fields = Array.isArray(changePreview.value?.changed_fields) ? changePreview.value.changed_fields : [];
  const messages = [];
  const add = (code, message) => {
    if (!messages.some(item => item.code === code)) messages.push({ code, message });
  };
  fields.forEach(item => {
    if (item.field === "airport_code") add("airport_change", "换机场会影响价格、拼车匹配和原组保留，请确认后再保存。");
    if (item.field === "terminal") add("terminal_change", "换航站楼可能触发跨航站楼价格和拼车兼容性变化。");
    if (item.field === "passenger_count") add("passenger_count_change", "人数变化会影响容量、组价、人均价和订单应收总价。");
    if (item.field === "shareable" && item.after === false) add("shareable_false", "改为不拼车后必须移出原组，且不会新建待匹配组。");
    if (["flight_datetime", "preferred_time_start"].includes(item.field) && dateOnly(item.before) !== dateOnly(item.after)) {
      add("service_date_change", "服务日期变化必须重新计价并重新判断拼车组。");
    }
  });
  if (changePreview.value?.classification === "ordinary_time_adjustment") {
    add("ordinary_time_adjustment", "此类变更建议使用普通时间调整流程，不强制走 P5。");
  }
  return messages;
}

async function previewChangeImpact() {
  if (!request.value || changePreviewLoading.value) return;
  changePreviewLoading.value = true;
  changeError.value = "";
  changeNotice.value = "";
  changePreview.value = null;
  selectedGroupAction.value = "";
  selectedTargetGroupId.value = "";
  try {
    const preview = await previewTransportOrderChange(requestId.value, buildChangePayload());
    changePreview.value = preview;
    selectedGroupAction.value = preview?.group_context?.required_group_action || "no_group_change";
    if (preview?.classification === "ordinary_time_adjustment") {
      changeNotice.value = "此变更看起来属于普通时间调整，建议使用原有普通时间调整流程，不强制走 P5。";
    }
  } catch (err) {
    changeError.value = changeErrorMessage(err);
  } finally {
    changePreviewLoading.value = false;
  }
}

async function confirmChangeImpact() {
  if (!request.value || !changePreview.value || changeConfirming.value) return;
  if (previewExpired.value) {
    changeError.value = "预览已过期，请重新预览。";
    return;
  }
  if (confirmReasonMissing.value) {
    changeError.value = "请先填写变更原因。";
    return;
  }
  if (changePreview.value.classification === "ordinary_time_adjustment") {
    changeError.value = "普通时间调整请使用原有时间调整流程。";
    return;
  }
  if (selectedGroupAction.value === "transfer_existing_group" && !selectedTargetGroupId.value) {
    changeError.value = "请先选择预览返回的候选拼车组。";
    return;
  }
  changeConfirming.value = true;
  changeError.value = "";
  changeNotice.value = "";
  try {
    const result = await confirmTransportOrderChange(requestId.value, {
      ...buildChangePayload(),
      group_action: selectedGroupAction.value,
      target_group_id: selectedGroupAction.value === "transfer_existing_group" ? selectedTargetGroupId.value : undefined,
      preview_token: changePreview.value.preview_token,
      source_snapshot_hash: changePreview.value.source_snapshot_hash
    });
    changeNotice.value = `订单变更已保存。日志 ID：${result?.order_change_log_id || "--"}`;
    await loadRequest();
    changePreview.value = null;
    selectedGroupAction.value = "";
    selectedTargetGroupId.value = "";
  } catch (err) {
    changeError.value = changeErrorMessage(err);
  } finally {
    changeConfirming.value = false;
  }
}

async function loadAssignableGroups(record) {
  if (!record?.id) {
    assignableGroups.value = [];
    return;
  }
  const refDate = datePart(record.flight_datetime || record.preferred_time_start);
  const payload = await fetchTransportGroups({
    service_type: record.service_type,
    airport_code: record.airport_code,
    date_from: refDate || undefined,
    date_to: refDate || undefined
  }).catch(() => []);
  const groups = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
  assignableGroups.value = groups.filter(group => {
    const groupId = String(group.group_id || "").trim();
    const groupRef = String(group.group_ref || group.id || group.group_id || "").trim();
    return groupId !== currentGroupId.value && groupRef !== currentGroupRef.value;
  });
}

async function saveEditableFields() {
  if (!request.value || saving.value) return;
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    const updated = await updateTransportRequestSafeFields(requestId.value, {
      admin_note: emptyToNull(editableForm.admin_note)
    });
    request.value = updated?.request || updated?.item || updated;
    await loadAssignableGroups(request.value);
    notice.value = "Saved admin note. Use Order Change for itinerary, price, passenger, payment, or carpool changes.";
  } catch (err) {
    notice.value = `Save failed: ${err.message || "please check and retry"}`;
  } finally {
    saving.value = false;
  }
}

async function assignToGroup(targetGroupId) {
  const target = String(targetGroupId || "").trim();
  if (!target || !request.value?.id || assigning.value) return;
  assigning.value = true;
  notice.value = "";
  try {
    const targetGroup = await fetchTransportGroup(target);
    const requestIds = new Set(
      (targetGroup?.members || [])
        .map(member => member.request_id || member.transport_requests?.id)
        .filter(Boolean)
    );
    requestIds.add(request.value.id);
    await saveTransportGroupMembers(target, Array.from(requestIds));
    await loadRequest();
    assignGroupId.value = "";
    notice.value = "已更换拼车组，系统已确保该订单只属于一个拼车组。";
  } catch (err) {
    notice.value = `更换拼车组失败：${err.message || "请检查 Group ID 后重试"}`;
  } finally {
    assigning.value = false;
  }
}

async function loadRequest() {
  if (!requestId.value) {
    request.value = null;
    error.value = "缺少接送机订单 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchTransportRequest(requestId.value);
    request.value = payload?.request || payload?.item || payload;
    await loadAssignableGroups(request.value);
  } catch (err) {
    request.value = null;
    error.value = err.message || "接送机订单详情加载失败";
  } finally {
    loading.value = false;
  }
}

watch(request, value => {
  if (value) populateEditableForm(value);
});

onMounted(() => {
  loadRequest();
  previewClock = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 15000);
});

onUnmounted(() => {
  if (previewClock) {
    window.clearInterval(previewClock);
    previewClock = null;
  }
});
</script>

<template>
  <section class="transport-request-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport request detail</p>
        <h2>接送机订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" @click="openChangeDrawer">
          订单变更
        </button>
        <BackButton :href="listHref()" label="返回列表" />
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载接送机订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!request" title="未找到接送机订单" description="请从接送机订单列表重新进入详情页。" />

    <template v-else>
      <form class="transport-simple-detail-form" @submit.prevent="saveEditableFields">
        <label>
          <span>服务类型</span>
          <input readonly :value="serviceLabel()" />
        </label>

        <label>
          <span>姓名</span>
          <input readonly :value="fieldValue(request.student_name, request.name, extraDetail.name)" />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>邮箱</span>
          <input readonly :value="fieldValue(request.student_email, request.email, extraDetail.email)" />
        </label>

        <label>
          <span>手机号</span>
          <input readonly :value="fieldValue(request.phone, request.mobile, extraDetail.phone)" />
        </label>

        <label>
          <span>微信号</span>
          <input readonly :value="fieldValue(request.wechat, request.wechat_id, extraDetail.wechat)" />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>登记人数</span>
          <input readonly :value="fieldValue(request.passenger_count, extraDetail.passenger_count, 1)" />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>行李数量</span>
          <textarea readonly rows="3" :value="luggageSummary()"></textarea>
        </label>

        <label>
          <span>机场代码</span>
          <select v-model="editableForm.airport_code" disabled @change="handleAirportCodeChange">
            <option v-if="editableForm.airport_code && !airportOptions.some(item => item.code === editableForm.airport_code)" :value="editableForm.airport_code">
              {{ editableForm.airport_code }}
            </option>
            <option v-for="airport in airportOptions" :key="airport.code" :value="airport.code">
              {{ airport.code }}
            </option>
          </select>
        </label>

        <label>
          <span>机场名称</span>
          <input v-model="editableForm.airport_name" readonly />
        </label>

        <label>
          <span>出发航站楼</span>
          <input v-model="editableForm.terminal" readonly />
        </label>

        <label>
          <span>航班号</span>
          <input v-model="editableForm.flight_no" readonly />
        </label>

        <label>
          <span>航班时间</span>
          <input v-model="editableForm.flight_datetime" readonly type="datetime-local" />
        </label>

        <label>
          <span>出发地</span>
          <input v-model="editableForm.location_from" readonly />
        </label>

        <label>
          <span>目的地址</span>
          <input v-model="editableForm.location_to" readonly />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>接送时间</span>
          <input v-model="editableForm.preferred_time_start" readonly type="datetime-local" />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>备注</span>
          <textarea v-model="editableForm.notes" readonly rows="3" placeholder="--"></textarea>
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>内部备注</span>
          <textarea v-model="editableForm.admin_note" :disabled="saving" rows="3" placeholder="--"></textarea>
        </label>

        <p class="transport-form-hint">
          Airport, terminal, flight, service time, passenger, payment and carpool changes must use the Order Change flow.
        </p>

        <div class="transport-simple-detail-form__actions">
          <button class="primary-button" type="submit" :disabled="saving">
            {{ saving ? "Saving..." : "Save admin note" }}
          </button>
        </div>
      </form>

      <section class="transport-detail-panel">
        <p v-if="hasCurrentGroup" class="transport-current-group-hint">
          当前订单 {{ displayValue(request.order_no) }} 的拼车组为
          <a :href="groupDetailHref()"><strong>{{ currentGroupId }}</strong></a>。
        </p>
        <p v-else class="transport-current-group-hint">当前订单暂未关联拼车组。</p>
      </section>

      <section class="transport-detail-panel">
        <h3>Group changes</h3>
        <p class="detail-muted">Direct group replacement is disabled here. Use Order Change so preview, pricing, candidate-group validation and logs stay together.</p>
        <button class="secondary-button" type="button" @click="openChangeDrawer">Open Order Change</button>
      </section>

      <section class="transport-detail-panel">
        <h3>操作记录</h3>
        <ul v-if="operationLogs.length" class="transport-operation-log-list">
          <li v-for="log in operationLogs" :key="log.id || `${log.action}-${log.created_at}`">
            <div>
              <strong>{{ logActionLabel(log) }}</strong>
              <span>{{ formatDateTime(log.created_at) }} / {{ logAdminName(log) }}</span>
            </div>
            <p v-for="item in logChangedFields(log)" :key="`${log.id}-${item.field}`">
              {{ item.label || item.field }}：{{ displayValue(item.before) }} -> {{ displayValue(item.after) }}
            </p>
          </li>
        </ul>
        <div v-else class="transport-empty-box">暂无操作记录。上线后每次保存会记录客服和修改字段。</div>
      </section>
    </template>
  </section>
  <TransportOrderChangeDrawer
    :open="changeDrawerOpen"
    :request="request"
    :extra-detail="extraDetail"
    :current-group-id="currentGroupId"
    :has-current-group="hasCurrentGroup"
    @close="closeChangeDrawer"
    @saved="handleOrderChangeSaved"
  />
  <div v-if="false && changeDrawerOpen" class="membership-modal transport-change-modal" role="dialog" aria-modal="true" aria-label="Order change">
    <button class="membership-modal__backdrop" type="button" aria-label="Close" @click="closeChangeDrawer"></button>
    <div class="membership-modal__panel transport-change-modal__panel">
      <header class="membership-modal__header">
        <div>
          <h3>订单变更</h3>
          <p>先预览影响，再确认保存。普通航班延误建议继续使用原有时间调整流程。</p>
        </div>
        <button class="table-action-button" type="button" :disabled="changePreviewLoading || changeConfirming" @click="closeChangeDrawer">Close</button>
      </header>

      <p v-if="changeError" class="inline-notice inline-notice--error">{{ changeError }}</p>
      <p v-if="changeNotice" class="inline-notice">{{ changeNotice }}</p>

      <section class="transport-change-section">
        <h4>Current order</h4>
        <dl class="transport-change-summary-grid">
          <div><dt>Order no</dt><dd>{{ displayValue(request?.order_no) }}</dd></div>
          <div><dt>Name</dt><dd>{{ fieldValue(request?.student_name, request?.name, extraDetail.name) }}</dd></div>
          <div><dt>Service</dt><dd>{{ serviceLabel() }}</dd></div>
          <div><dt>Airport / terminal</dt><dd>{{ displayValue(request?.airport_code) }} / {{ displayValue(request?.terminal) }}</dd></div>
          <div><dt>Flight no</dt><dd>{{ displayValue(request?.flight_no) }}</dd></div>
          <div><dt>Service time</dt><dd>{{ formatDateTime(firstValue(request?.preferred_time_start, request?.flight_datetime)) }}</dd></div>
          <div><dt>Passengers</dt><dd>{{ displayValue(request?.passenger_count) }}</dd></div>
          <div><dt>Shareable</dt><dd>{{ displayBoolean(request?.shareable !== false) }}</dd></div>
          <div><dt>Current group</dt><dd>{{ hasCurrentGroup ? currentGroupId : "--" }}</dd></div>
          <div><dt>Price / paid</dt><dd>{{ formatMoney(firstValue(request?.confirmed_price_gbp, request?.manual_price_gbp, request?.quoted_price_gbp)) }} / {{ currentPaidAmountHint() }}</dd></div>
          <div><dt>Payment status</dt><dd>{{ paymentStatusLabel(request?.payment_collection_status) }}</dd></div>
        </dl>
      </section>

      <section class="transport-change-section">
        <h4>Change draft</h4>
        <form class="transport-change-form" @submit.prevent="previewChangeImpact">
          <label><span>Airport</span><select v-model="changeForm.airport_code" :disabled="changePreviewLoading || changeConfirming" @change="handleChangeAirportCodeChange"><option v-for="airport in airportOptions" :key="airport.code" :value="airport.code">{{ airport.code }}</option></select></label>
          <label><span>Airport name</span><input v-model="changeForm.airport_name" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Terminal</span><input v-model="changeForm.terminal" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Flight no</span><input v-model="changeForm.flight_no" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Flight datetime</span><input v-model="changeForm.flight_datetime" type="datetime-local" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Service start</span><input v-model="changeForm.preferred_time_start" type="datetime-local" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Passenger count</span><input v-model.number="changeForm.passenger_count" type="number" min="1" step="1" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Luggage count</span><input v-model.number="changeForm.luggage_count" type="number" min="0" step="1" :disabled="changePreviewLoading || changeConfirming" /></label>
          <label><span>Shareable</span><select v-model="changeForm.shareable" :disabled="changePreviewLoading || changeConfirming"><option :value="true">Yes</option><option :value="false">No</option></select></label>
          <label><span>Paid amount GBP</span><input v-model="changeForm.paid_amount_gbp" type="number" min="0" step="0.01" :disabled="changePreviewLoading || changeConfirming" placeholder="Optional confirmed paid amount" /></label>
          <label class="transport-change-form__wide"><span>Reason</span><textarea v-model="changeForm.reason" rows="3" required :disabled="changePreviewLoading || changeConfirming" placeholder="Required for confirmation"></textarea></label>
          <div class="transport-change-form__actions">
            <button class="primary-button" type="submit" :disabled="changePreviewLoading || changeConfirming">{{ changePreviewLoading ? "Previewing..." : "Preview impact" }}</button>
          </div>
        </form>
      </section>

      <section v-if="changePreview" class="transport-change-section transport-change-preview">
        <h4>预览结果</h4>
        <dl class="transport-change-summary-grid">
          <div><dt>分类</dt><dd>{{ displayValue(changePreview.classification) }}</dd></div>
          <div><dt>是否重算价格</dt><dd>{{ displayBoolean(changePreview.requires_reprice) }}</dd></div>
          <div><dt>原订单应收总价</dt><dd>{{ formatMoney(changePreview.old_price_gbp) }}</dd></div>
          <div><dt>新订单应收总价</dt><dd>{{ formatMoney(changePreview.new_price_gbp) }}</dd></div>
          <div><dt>订单总价差额</dt><dd>{{ formatMoney(changePreview.price_delta_gbp) }}</dd></div>
          <div><dt>已收金额</dt><dd>{{ formatMoney(changePreview.paid_amount_gbp) }}</dd></div>
          <div><dt>需补差价</dt><dd>{{ formatMoney(changePreview.balance_due_gbp) }}</dd></div>
          <div><dt>需退款</dt><dd>{{ formatMoney(changePreview.refund_due_gbp) }}</dd></div>
          <div><dt>当前人均价</dt><dd>{{ formatMoney(previewPricingValue("pricing_after", "per_person_price_gbp")) }}</dd></div>
          <div><dt>组总价</dt><dd>{{ formatMoney(previewPricingValue("pricing_after", "group_total_price_gbp")) }}</dd></div>
          <div><dt>原组是否可保留</dt><dd>{{ displayBoolean(changePreview.group_context?.can_keep_original_group) }}</dd></div>
          <div><dt>推荐分组处理</dt><dd>{{ displayValue(changePreview.group_context?.required_group_action) }}</dd></div>
          <div><dt>预览有效期</dt><dd>{{ formatDateTime(changePreview.preview_expires_at) }}</dd></div>
        </dl>

        <div v-if="highRiskWarnings().length" class="transport-change-list transport-change-list--critical">
          <strong>高风险提示</strong>
          <p v-for="risk in highRiskWarnings()" :key="risk.code">{{ risk.message }}</p>
        </div>

        <div v-if="changePreview.changed_fields?.length" class="transport-change-list">
          <strong>Changed fields</strong>
          <p v-for="item in changePreview.changed_fields" :key="item.field">{{ displayValue(item.field) }}: {{ displayValue(item.before) }} -> {{ displayValue(item.after) }}</p>
        </div>

        <div v-if="changePreview.risks?.length" class="transport-change-list transport-change-list--warning">
          <strong>Warnings</strong>
          <p v-for="risk in changePreview.risks" :key="risk.code">{{ displayValue(risk.code) }}: {{ displayValue(risk.message) }}</p>
        </div>

        <div v-if="candidateGroupOptions().length" class="transport-change-list">
          <strong>Candidate groups</strong>
          <p v-for="group in candidateGroupOptions()" :key="group.id || group.group_id">{{ candidateGroupLabel(group) }}</p>
        </div>

        <p v-if="changePreview.classification === 'ordinary_time_adjustment'" class="inline-notice">建议使用普通时间调整流程，不要强行走 P5 订单变更。</p>

        <div v-else class="transport-change-confirm-box">
          <p v-if="previewExpired" class="transport-change-confirm-box__message">预览已过期，请重新预览。</p>
          <p v-else-if="confirmReasonMissing" class="transport-change-confirm-box__message">请填写变更原因后再确认。</p>
          <p v-else-if="selectedGroupAction === 'transfer_existing_group' && !selectedTargetGroupId" class="transport-change-confirm-box__message">请选择一个预览返回的候选拼车组。</p>
          <label>
            <span>Final group_action</span>
            <select v-model="selectedGroupAction" :disabled="changeConfirming">
              <option v-for="option in groupActionOptions" :key="option.value" :value="option.value" :disabled="option.value === 'transfer_existing_group' && !candidateGroupOptions().length">{{ option.label }}</option>
            </select>
          </label>
          <label v-if="selectedGroupAction === 'transfer_existing_group'">
            <span>Target candidate group</span>
            <select v-model="selectedTargetGroupId" :disabled="changeConfirming">
              <option value="">Select preview candidate</option>
              <option v-for="group in candidateGroupOptions()" :key="group.id || group.group_id" :value="group.group_id || group.group_ref || group.id">{{ candidateGroupLabel(group) }}</option>
            </select>
          </label>
          <button class="primary-button" type="button" :disabled="confirmButtonDisabled" @click="confirmChangeImpact">{{ changeConfirming ? "正在保存..." : "确认保存变更" }}</button>
        </div>
      </section>
    </div>
  </div>
</template>
