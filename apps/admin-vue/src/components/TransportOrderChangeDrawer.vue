<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  confirmTransportOrderChange,
  previewTransportOrderChange
} from "@/api/admin-api";

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  request: {
    type: Object,
    default: null
  },
  extraDetail: {
    type: Object,
    default: () => ({})
  },
  currentGroupId: {
    type: String,
    default: ""
  },
  hasCurrentGroup: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["close", "saved"]);

const airportOptions = [
  { code: "LHR", name: "Heathrow" },
  { code: "LGW", name: "Gatwick" },
  { code: "MAN", name: "Manchester" },
  { code: "BHX", name: "Birmingham" },
  { code: "LTN", name: "Luton" },
  { code: "STN", name: "Stansted" }
];

const groupActionOptions = [
  { value: "no_group_change", label: "no_group_change" },
  { value: "keep_group", label: "keep_group" },
  { value: "move_out_no_group", label: "move_out_no_group" },
  { value: "move_out_new_single", label: "move_out_new_single" },
  { value: "transfer_existing_group", label: "transfer_existing_group" }
];

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

const previewLoading = ref(false);
const confirming = ref(false);
const preview = ref(null);
const error = ref("");
const notice = ref("");
const selectedGroupAction = ref("");
const selectedTargetGroupId = ref("");
const nowTick = ref(Date.now());
let previewClock = null;

const requestId = computed(() => String(props.request?.id || props.request?.request_id || "").trim());
const currentGroupLabel = computed(() => String(props.currentGroupId || props.request?.group_id || props.request?.group_ref || "").trim());
const previewExpired = computed(() => {
  const expiresAt = preview.value?.preview_expires_at;
  if (!expiresAt) return false;
  const parsed = new Date(expiresAt).getTime();
  return Number.isFinite(parsed) && parsed <= nowTick.value;
});
const confirmReasonMissing = computed(() => !emptyToNull(changeForm.reason));
const candidateGroups = computed(() => preview.value?.group_context?.candidate_groups || []);
const confirmButtonDisabled = computed(() => {
  if (!preview.value || confirming.value) return true;
  if (preview.value.classification === "ordinary_time_adjustment") return true;
  if (!preview.value.preview_token || previewExpired.value) return true;
  if (confirmReasonMissing.value) return true;
  return selectedGroupAction.value === "transfer_existing_group" && !selectedTargetGroupId.value;
});

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function displayBoolean(value) {
  return value === true ? "是" : value === false ? "否" : "--";
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

function dateOnly(value) {
  const local = formatDateTimeLocal(value);
  return local ? local.slice(0, 10) : "";
}

function serviceLabel(serviceType = props.request?.service_type) {
  if (serviceType === "dropoff") return "送机";
  if (serviceType === "pickup") return "接机";
  return displayValue(serviceType);
}

function paymentStatusLabel(status) {
  const labels = {
    unpaid: "未收款",
    deposit_paid: "已收定金",
    fully_paid: "已收全款"
  };
  return labels[status] || displayValue(status);
}

function currentPaidAmountHint() {
  if (props.request?.payment_collection_status === "fully_paid" && !props.request?.confirmed_price_gbp) {
    return "已收全款但缺少确认价，请客服确认已收金额";
  }
  return `定金参考：${formatMoney(props.request?.deposit_amount_gbp)}`;
}

function populateChangeForm(record = {}) {
  changeForm.airport_code = formText(record.airport_code);
  changeForm.airport_name = formText(record.airport_name, props.extraDetail?.airport_name);
  changeForm.terminal = formText(record.terminal, props.extraDetail?.terminal);
  changeForm.flight_no = formText(record.flight_no, props.extraDetail?.flight_no);
  changeForm.flight_datetime = formatDateTimeLocal(record.flight_datetime);
  changeForm.preferred_time_start = formatDateTimeLocal(firstValue(record.preferred_time_start, record.service_time, props.extraDetail?.preferred_time_start));
  changeForm.preferred_time_end = formatDateTimeLocal(record.preferred_time_end);
  changeForm.passenger_count = Number(record.passenger_count || 1);
  changeForm.luggage_count = Number(record.luggage_count || 0);
  changeForm.shareable = record.shareable !== false;
  changeForm.paid_amount_gbp = "";
  changeForm.reason = "";
}

function resetPreviewState() {
  preview.value = null;
  error.value = "";
  notice.value = "";
  selectedGroupAction.value = "";
  selectedTargetGroupId.value = "";
}

function closeDrawer() {
  if (previewLoading.value || confirming.value) return;
  emit("close");
}

function handleAirportCodeChange() {
  const option = airportOptions.find(item => item.code === changeForm.airport_code);
  if (option && (!changeForm.airport_name || airportOptions.some(item => item.name === changeForm.airport_name))) {
    changeForm.airport_name = option.name;
  }
}

function buildPayload() {
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

function candidateGroupLabel(group) {
  const groupId = group?.group_id || group?.id || group?.group_ref;
  const seats = `${Number(group?.current_passenger_count || 0)}/${Number(group?.max_passengers || 0)}`;
  return `${displayValue(groupId)} / ${displayValue(group?.airport_code)} ${displayValue(group?.terminal)} / ${formatDateTime(group?.preferred_time_start || group?.flight_time_reference || group?.group_date)} / seats ${seats}`;
}

function errorMessage(err) {
  const message = String(err?.message || "");
  if (/expired/i.test(message)) return "预览已过期，请重新预览。";
  if (/stale|changed|snapshot/i.test(message)) return "订单或拼车组信息已变化，请重新预览后再确认。";
  if (/cannot be kept|unsupported group_action|must use|group_action/i.test(message)) return "当前分组处理方式不可用，请重新选择。";
  if (/target_group_id|candidate/i.test(message)) return "目标拼车组不可用，请从预览返回的候选组中选择。";
  if (/duplicate|already confirmed|preview_token/i.test(message)) return "该预览已确认或已失效，请重新预览。";
  if (/paid|payment|price|amount/i.test(message)) return `价格或收款状态需要客服确认：${message}`;
  return message || "订单变更保存失败，请重新预览后再确认。";
}

function previewPricingValue(snapshotName, field) {
  const snapshot = preview.value?.[snapshotName];
  return snapshot?.[field];
}

function highRiskWarnings() {
  const fields = Array.isArray(preview.value?.changed_fields) ? preview.value.changed_fields : [];
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
  if (preview.value?.classification === "ordinary_time_adjustment") {
    add("ordinary_time_adjustment", "此类变更建议使用普通时间调整流程，不强制走 P5。");
  }
  return messages;
}

async function previewImpact() {
  if (!requestId.value || previewLoading.value) return;
  previewLoading.value = true;
  resetPreviewState();
  try {
    const result = await previewTransportOrderChange(requestId.value, buildPayload());
    preview.value = result;
    selectedGroupAction.value = result?.group_context?.required_group_action || "no_group_change";
    if (result?.classification === "ordinary_time_adjustment") {
      notice.value = "此变更属于普通时间调整，建议使用原有普通时间调整流程，不强制走 P5。";
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    previewLoading.value = false;
  }
}

async function confirmImpact() {
  if (!requestId.value || !preview.value || confirming.value) return;
  if (previewExpired.value) {
    error.value = "预览已过期，请重新预览。";
    return;
  }
  if (confirmReasonMissing.value) {
    error.value = "请先填写变更原因。";
    return;
  }
  if (preview.value.classification === "ordinary_time_adjustment") {
    error.value = "普通时间调整请使用原有时间调整流程。";
    return;
  }
  if (selectedGroupAction.value === "transfer_existing_group" && !selectedTargetGroupId.value) {
    error.value = "请先选择预览返回的候选拼车组。";
    return;
  }
  confirming.value = true;
  error.value = "";
  notice.value = "";
  try {
    const result = await confirmTransportOrderChange(requestId.value, {
      ...buildPayload(),
      group_action: selectedGroupAction.value,
      target_group_id: selectedGroupAction.value === "transfer_existing_group" ? selectedTargetGroupId.value : undefined,
      preview_token: preview.value.preview_token,
      source_snapshot_hash: preview.value.source_snapshot_hash
    });
    notice.value = `订单变更已保存。日志 ID：${result?.order_change_log_id || "--"}`;
    emit("saved", {
      result,
      preview: preview.value,
      groupAction: selectedGroupAction.value,
      targetGroupId: selectedTargetGroupId.value
    });
    preview.value = null;
    selectedGroupAction.value = "";
    selectedTargetGroupId.value = "";
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    confirming.value = false;
  }
}

watch(
  () => [props.open, requestId.value],
  ([isOpen]) => {
    if (!isOpen || !props.request) return;
    populateChangeForm(props.request);
    resetPreviewState();
  },
  { immediate: true }
);

onMounted(() => {
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
  <div v-if="open && request" class="membership-modal transport-change-modal" role="dialog" aria-modal="true" aria-label="Order change">
    <button class="membership-modal__backdrop" type="button" aria-label="Close" @click="closeDrawer"></button>
    <div class="membership-modal__panel transport-change-modal__panel">
      <header class="membership-modal__header">
        <div>
          <h3>订单变更</h3>
          <p>先预览影响，再确认保存。普通航班延误建议继续使用原有时间调整流程。</p>
        </div>
        <button class="table-action-button" type="button" :disabled="previewLoading || confirming" @click="closeDrawer">关闭</button>
      </header>

      <p v-if="error" class="inline-notice inline-notice--error">{{ error }}</p>
      <p v-if="notice" class="inline-notice">{{ notice }}</p>

      <section class="transport-change-section">
        <h4>当前订单</h4>
        <dl class="transport-change-summary-grid">
          <div><dt>订单号</dt><dd>{{ displayValue(request.order_no) }}</dd></div>
          <div><dt>姓名</dt><dd>{{ fieldValue(request.student_name, request.name, extraDetail.name) }}</dd></div>
          <div><dt>服务类型</dt><dd>{{ serviceLabel() }}</dd></div>
          <div><dt>机场 / 航站楼</dt><dd>{{ displayValue(request.airport_code) }} / {{ displayValue(request.terminal) }}</dd></div>
          <div><dt>航班号</dt><dd>{{ displayValue(request.flight_no) }}</dd></div>
          <div><dt>服务时间</dt><dd>{{ formatDateTime(firstValue(request.preferred_time_start, request.flight_datetime)) }}</dd></div>
          <div><dt>人数</dt><dd>{{ displayValue(request.passenger_count) }}</dd></div>
          <div><dt>拼车意愿</dt><dd>{{ displayBoolean(request.shareable !== false) }}</dd></div>
          <div><dt>当前组</dt><dd>{{ hasCurrentGroup || currentGroupLabel ? displayValue(currentGroupLabel) : "--" }}</dd></div>
          <div><dt>当前价格 / 已收</dt><dd>{{ formatMoney(firstValue(request.confirmed_price_gbp, request.manual_price_gbp, request.quoted_price_gbp)) }} / {{ currentPaidAmountHint() }}</dd></div>
          <div><dt>付款状态</dt><dd>{{ paymentStatusLabel(request.payment_collection_status) }}</dd></div>
        </dl>
      </section>

      <section class="transport-change-section">
        <h4>变更草稿</h4>
        <form class="transport-change-form" @submit.prevent="previewImpact">
          <label><span>机场</span><select v-model="changeForm.airport_code" :disabled="previewLoading || confirming" @change="handleAirportCodeChange"><option v-for="airport in airportOptions" :key="airport.code" :value="airport.code">{{ airport.code }}</option></select></label>
          <label><span>机场名称</span><input v-model="changeForm.airport_name" :disabled="previewLoading || confirming" /></label>
          <label><span>航站楼</span><input v-model="changeForm.terminal" :disabled="previewLoading || confirming" /></label>
          <label><span>航班号</span><input v-model="changeForm.flight_no" :disabled="previewLoading || confirming" /></label>
          <label><span>航班时间</span><input v-model="changeForm.flight_datetime" type="datetime-local" :disabled="previewLoading || confirming" /></label>
          <label><span>服务开始时间</span><input v-model="changeForm.preferred_time_start" type="datetime-local" :disabled="previewLoading || confirming" /></label>
          <label><span>人数</span><input v-model.number="changeForm.passenger_count" type="number" min="1" step="1" :disabled="previewLoading || confirming" /></label>
          <label><span>行李数量</span><input v-model.number="changeForm.luggage_count" type="number" min="0" step="1" :disabled="previewLoading || confirming" /></label>
          <label><span>是否愿意拼车</span><select v-model="changeForm.shareable" :disabled="previewLoading || confirming"><option :value="true">是</option><option :value="false">否</option></select></label>
          <label><span>已收金额 GBP</span><input v-model="changeForm.paid_amount_gbp" type="number" min="0" step="0.01" :disabled="previewLoading || confirming" placeholder="可选，客服确认已收金额" /></label>
          <label class="transport-change-form__wide"><span>变更原因</span><textarea v-model="changeForm.reason" rows="3" required :disabled="previewLoading || confirming" placeholder="确认保存前必须填写"></textarea></label>
          <div class="transport-change-form__actions">
            <button class="primary-button" type="submit" :disabled="previewLoading || confirming">{{ previewLoading ? "预览中..." : "预览影响" }}</button>
          </div>
        </form>
      </section>

      <section v-if="preview" class="transport-change-section transport-change-preview">
        <h4>预览结果</h4>
        <dl class="transport-change-summary-grid">
          <div><dt>分类</dt><dd>{{ displayValue(preview.classification) }}</dd></div>
          <div><dt>是否重算价格</dt><dd>{{ displayBoolean(preview.requires_reprice) }}</dd></div>
          <div><dt>原订单应收总价</dt><dd>{{ formatMoney(preview.old_price_gbp) }}</dd></div>
          <div><dt>新订单应收总价</dt><dd>{{ formatMoney(preview.new_price_gbp) }}</dd></div>
          <div><dt>订单总价差额</dt><dd>{{ formatMoney(preview.price_delta_gbp) }}</dd></div>
          <div><dt>已收金额</dt><dd>{{ formatMoney(preview.paid_amount_gbp) }}</dd></div>
          <div><dt>需补差价</dt><dd>{{ formatMoney(preview.balance_due_gbp) }}</dd></div>
          <div><dt>需退款</dt><dd>{{ formatMoney(preview.refund_due_gbp) }}</dd></div>
          <div><dt>当前人均价</dt><dd>{{ formatMoney(previewPricingValue("pricing_after", "per_person_price_gbp")) }}</dd></div>
          <div><dt>组总价</dt><dd>{{ formatMoney(previewPricingValue("pricing_after", "group_total_price_gbp")) }}</dd></div>
          <div><dt>原组是否可保留</dt><dd>{{ displayBoolean(preview.group_context?.can_keep_original_group) }}</dd></div>
          <div><dt>推荐 group_action</dt><dd>{{ displayValue(preview.group_context?.required_group_action) }}</dd></div>
          <div><dt>预览有效期</dt><dd>{{ formatDateTime(preview.preview_expires_at) }}</dd></div>
        </dl>

        <div v-if="highRiskWarnings().length" class="transport-change-list transport-change-list--critical">
          <strong>高风险提示</strong>
          <p v-for="risk in highRiskWarnings()" :key="risk.code">{{ risk.message }}</p>
        </div>

        <div v-if="preview.changed_fields?.length" class="transport-change-list">
          <strong>变更摘要</strong>
          <p v-for="item in preview.changed_fields" :key="item.field">{{ displayValue(item.field) }}: {{ displayValue(item.before) }} -> {{ displayValue(item.after) }}</p>
        </div>

        <div v-if="preview.risks?.length" class="transport-change-list transport-change-list--warning">
          <strong>风险提示</strong>
          <p v-for="risk in preview.risks" :key="risk.code">{{ displayValue(risk.code) }}: {{ displayValue(risk.message) }}</p>
        </div>

        <div v-if="candidateGroups.length" class="transport-change-list">
          <strong>候选拼车组</strong>
          <p v-for="candidate in candidateGroups" :key="candidate.id || candidate.group_id">{{ candidateGroupLabel(candidate) }}</p>
        </div>

        <p v-if="preview.classification === 'ordinary_time_adjustment'" class="inline-notice">建议使用普通时间调整流程，不要强行走 P5 订单变更。</p>

        <div v-else class="transport-change-confirm-box">
          <p v-if="previewExpired" class="transport-change-confirm-box__message">预览已过期，请重新预览。</p>
          <p v-else-if="confirmReasonMissing" class="transport-change-confirm-box__message">请填写变更原因后再确认。</p>
          <p v-else-if="selectedGroupAction === 'transfer_existing_group' && !selectedTargetGroupId" class="transport-change-confirm-box__message">请选择一个预览返回的候选拼车组。</p>
          <label>
            <span>最终 group_action</span>
            <select v-model="selectedGroupAction" :disabled="confirming">
              <option v-for="option in groupActionOptions" :key="option.value" :value="option.value" :disabled="option.value === 'transfer_existing_group' && !candidateGroups.length">{{ option.label }}</option>
            </select>
          </label>
          <label v-if="selectedGroupAction === 'transfer_existing_group'">
            <span>目标候选组</span>
            <select v-model="selectedTargetGroupId" :disabled="confirming">
              <option value="">选择预览候选组</option>
              <option v-for="candidate in candidateGroups" :key="candidate.id || candidate.group_id" :value="candidate.group_id || candidate.group_ref || candidate.id">{{ candidateGroupLabel(candidate) }}</option>
            </select>
          </label>
          <button class="primary-button" type="button" :disabled="confirmButtonDisabled" @click="confirmImpact">{{ confirming ? "正在保存..." : "确认保存变更" }}</button>
        </div>
      </section>
    </div>
  </div>
</template>
