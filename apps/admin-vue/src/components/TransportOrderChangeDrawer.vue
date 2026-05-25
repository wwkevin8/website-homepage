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

const FIELD_LABELS = {
  deposit_amount_gbp: "\u5df2\u6536\u91d1\u989d",
  service_type: "服务类型",
  airport_code: "机场代码",
  airport_name: "机场名称",
  terminal: "航站楼",
  flight_no: "航班号",
  flight_datetime: "航班时间",
  preferred_time_start: "服务开始时间",
  preferred_time_end: "服务结束时间",
  location_from: "出发地",
  location_to: "目的地",
  passenger_count: "人数",
  luggage_count: "行李数量",
  notes: "客户备注",
  customer_note: "客户备注",
  admin_note: "内部备注",
  internal_note: "内部备注",
  paid_amount: "已收金额",
  paid_amount_gbp: "已收金额",
  shareable: "是否愿意拼车"
};

const GROUP_ACTION_LABELS = {
  no_group_change: "不调整拼车组",
  keep_group: "不调整拼车组",
  keep_current_group: "不调整拼车组",
  move_out_new_single: "移出并创建新的单人拼车组",
  transfer_existing_group: "加入指定兼容拼车组",
  move_to_candidate_group: "加入指定兼容拼车组"
};

const CLASSIFICATION_LABELS = {
  order_change: "订单行程变更",
  ordinary_time_adjustment: "订单时间调整"
};

const DISPATCH_STATUS_LABELS = {
  pending_dispatch: "待调度",
  driver_assigned: "已派车",
  driver_notified: "已通知司机",
  in_progress: "服务中",
  completed: "已完成",
  cancelled: "已取消"
};

const changeForm = reactive({
  service_type: "pickup",
  airport_code: "",
  airport_name: "",
  terminal: "",
  flight_no: "",
  flight_datetime: "",
  preferred_time_start: "",
  preferred_time_end: "",
  location_from: "",
  location_to: "",
  passenger_count: 1,
  luggage_count: 0,
  notes: "",
  admin_note: "",
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
const targetGroupSearch = ref("");
const targetGroupSearchLoading = ref(false);
const targetGroupSearchResult = ref(null);
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
const candidateGroups = computed(() => preview.value?.group_context?.candidate_groups || []);
const selectableTargetGroups = computed(() => {
  const groups = [...candidateGroups.value];
  const searchedGroup = targetGroupSearchResult.value?.joinable ? targetGroupSearchResult.value.group : null;
  const searchedGroupId = searchedGroup?.group_id || searchedGroup?.group_ref || searchedGroup?.id;
  if (searchedGroup && searchedGroupId && !groups.some(group => {
    const groupId = group?.group_id || group?.group_ref || group?.id;
    return String(groupId || "") === String(searchedGroupId);
  })) {
    groups.unshift(searchedGroup);
  }
  return groups;
});
const canKeepOriginalGroup = computed(() => preview.value?.group_context?.can_keep_original_group === true);
const requiresMoveOutForRouteUpdate = computed(() => preview.value?.group_context?.multi_member_route_update_requires_move_out === true);
const mustLeaveCurrentGroup = computed(() => props.hasCurrentGroup && (requiresMoveOutForRouteUpdate.value || !canKeepOriginalGroup.value));
const recommendedGroupAction = computed(() => normalizeGroupAction(preview.value?.group_context?.required_group_action));
const recommendedReason = computed(() => buildRecommendedReason());
const selectedGroupActionLabel = computed(() => groupActionLabel(selectedGroupAction.value));
const groupActionOptions = computed(() => {
  return [
    {
      value: "no_group_change",
      label: groupActionLabel("no_group_change"),
      disabled: mustLeaveCurrentGroup.value,
      reason: mustLeaveCurrentGroup.value ? "\u5f53\u524d\u4fee\u6539\u4e0d\u80fd\u7ee7\u7eed\u4fdd\u7559\u5728\u5f53\u524d\u62fc\u8f66\u7ec4\uff0c\u8bf7\u9009\u62e9\u79fb\u51fa\u65b0\u5efa\u6216\u52a0\u5165\u517c\u5bb9\u62fc\u8f66\u7ec4\u3002" : ""
    },
    {
      value: "move_out_new_single",
      label: groupActionLabel("move_out_new_single"),
      disabled: false,
      reason: ""
    },
    {
      value: "transfer_existing_group",
      label: groupActionLabel("transfer_existing_group"),
      disabled: false,
      reason: ""
    }
  ];
});
const confirmButtonDisabled = computed(() => {
  if (!preview.value || confirming.value) return true;
  if (!preview.value.preview_token || previewExpired.value) return true;
  const selectedOption = groupActionOptions.value.find(item => item.value === selectedGroupAction.value);
  if (!selectedOption || selectedOption.disabled) return true;
  return selectedGroupAction.value === "transfer_existing_group" && !selectedTargetGroupId.value;
});
const confirmButtonLabel = computed(() => {
  if (confirming.value) return "正在保存...";
  return "确认保存";
});

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "未填写" : String(value);
}

function displayBoolean(value) {
  return value === true ? "是" : value === false ? "否" : "未填写";
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "未填写";
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

function fieldLabel(field) {
  return FIELD_LABELS[field] || FIELD_LABELS[String(field || "").replace(/_gbp$/, "")] || displayValue(field);
}

function classificationLabel(value) {
  return CLASSIFICATION_LABELS[value] || displayValue(value);
}

function groupActionLabel(value) {
  return GROUP_ACTION_LABELS[value] || displayValue(value);
}

function normalizeGroupAction(value) {
  if (value === "keep_group" || value === "keep_current_group") return "no_group_change";
  if (value === "move_to_candidate_group") return "transfer_existing_group";
  if (value === "move_out_or_transfer") return "move_out_new_single";
  if (value === "new_single_pending_group") return "move_out_new_single";
  return value || "no_group_change";
}

function dispatchStatusLabel(status) {
  return DISPATCH_STATUS_LABELS[status] || "待调度";
}

function formatDisplayDateTime(value) {
  if (!value) return "未填写";
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

function displayFieldValue(field, value) {
  if (value === null || value === undefined || value === "") return "未填写";
  if (["flight_datetime", "preferred_time_start", "preferred_time_end"].includes(field)) {
    return formatDisplayDateTime(value);
  }
  if (field === "service_type") return serviceLabel(value);
  if (field === "shareable") return displayBoolean(value);
  return String(value);
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

function airportLocationFallback(record = {}) {
  return formText(record.airport_name, record.airport_code, props.extraDetail?.airport_name);
}

function addressLocationFallback(record = {}) {
  return formText(
    record.pickup_address,
    record.dropoff_address,
    record.address_full,
    record.address,
    props.extraDetail?.location_to,
    props.extraDetail?.location_from
  );
}

function populateChangeForm(record = {}) {
  changeForm.airport_code = formText(record.airport_code);
  changeForm.service_type = formText(record.service_type) || "pickup";
  changeForm.airport_name = formText(record.airport_name, props.extraDetail?.airport_name);
  changeForm.terminal = formText(record.terminal, props.extraDetail?.terminal);
  changeForm.flight_no = formText(record.flight_no, props.extraDetail?.flight_no);
  changeForm.flight_datetime = formatDateTimeLocal(record.flight_datetime);
  changeForm.preferred_time_start = formatDateTimeLocal(firstValue(record.preferred_time_start, record.service_time, props.extraDetail?.preferred_time_start));
  changeForm.preferred_time_end = formatDateTimeLocal(record.preferred_time_end);
  changeForm.location_from = formText(
    record.location_from,
    props.extraDetail?.location_from,
    changeForm.service_type === "pickup" ? airportLocationFallback(record) : addressLocationFallback(record)
  );
  changeForm.location_to = formText(
    record.location_to,
    props.extraDetail?.location_to,
    changeForm.service_type === "dropoff" ? airportLocationFallback(record) : addressLocationFallback(record)
  );
  changeForm.passenger_count = Number(record.passenger_count || 1);
  changeForm.luggage_count = Number(record.luggage_count || 0);
  changeForm.notes = formText(record.notes);
  changeForm.admin_note = formText(record.admin_note);
  changeForm.shareable = true;
  changeForm.paid_amount_gbp = record.deposit_amount_gbp === null || record.deposit_amount_gbp === undefined ? "" : String(record.deposit_amount_gbp);
  changeForm.reason = "";
}

function resetPreviewState() {
  preview.value = null;
  error.value = "";
  notice.value = "";
  selectedGroupAction.value = "";
  selectedTargetGroupId.value = "";
  targetGroupSearch.value = "";
  targetGroupSearchResult.value = null;
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
    changes: {
      service_type: emptyToNull(changeForm.service_type),
      airport_code: emptyToNull(changeForm.airport_code),
      airport_name: emptyToNull(changeForm.airport_name),
      terminal: emptyToNull(changeForm.terminal),
      flight_no: emptyToNull(changeForm.flight_no),
      flight_datetime: localDateTimeToIso(changeForm.flight_datetime),
      preferred_time_start: localDateTimeToIso(changeForm.preferred_time_start),
      preferred_time_end: localDateTimeToIso(changeForm.preferred_time_end),
      location_from: emptyToNull(changeForm.location_from),
      location_to: emptyToNull(changeForm.location_to),
      passenger_count: Number(changeForm.passenger_count || 1),
      luggage_count: Number(changeForm.luggage_count || 0),
      deposit_amount_gbp: changeForm.paid_amount_gbp === "" ? null : Number(changeForm.paid_amount_gbp),
      shareable: true,
      notes: emptyToNull(changeForm.notes),
      admin_note: emptyToNull(changeForm.admin_note)
    }
  };
}

function candidateGroupLabel(group) {
  const groupId = group?.group_id || group?.id || group?.group_ref;
  const seats = `${Number(group?.current_passenger_count || 0)}/${Number(group?.max_passengers || 0)}`;
  return `${displayValue(groupId)} / ${displayValue(group?.group_date)} / ${displayValue(group?.airport_code)} / ${displayValue(group?.terminal_summary || group?.terminal)} / ${seats} 人 / ${dispatchStatusLabel(group?.dispatch_status)}`;
}

function candidateGroupOptionLabel(group) {
  const groupId = group?.group_id || group?.group_ref || group?.id;
  const serviceTime = group?.preferred_time_start || group?.flight_time_reference || group?.service_time || group?.group_date;
  const seats = `${Number(group?.current_passenger_count || 0)}/${Number(group?.max_passengers || 0)}`;
  return [
    displayValue(groupId),
    `机场：${displayValue(group?.airport_code)}`,
    `航站楼：${displayValue(group?.terminal_summary || group?.terminal)}`,
    `服务时间：${formatDisplayDateTime(serviceTime)}`,
    `人数：${seats}`
  ].join(" / ");
}

function newSingleGroupPreview() {
  return {
    service_type: changeForm.service_type,
    service_date: dateOnly(changeForm.preferred_time_start || changeForm.flight_datetime),
    airport_code: changeForm.airport_code,
    terminal: changeForm.terminal,
    service_time: localDateTimeToIso(changeForm.preferred_time_start || changeForm.flight_datetime),
    passenger_count: changeForm.passenger_count
  };
}

function riskMessage(risk) {
  const raw = String(risk?.message || risk?.code || risk || "");
  const code = String(risk?.code || "");
  if (code === "multi_member_group_requires_move_out") {
    return raw.includes("服务日期已变化")
      ? "服务日期已变化，该订单不能继续保留在当前多人拼车组。"
      : "该订单已加入多人拼车组，修改机场/服务类型会影响拼车匹配。";
  }
  if (/no confirmed price|explicit paid amount|fully_paid_amount_unconfirmed/i.test(raw) || code === "fully_paid_amount_unconfirmed") {
    return "当前订单没有确认价格或明确已收金额，请客服手动确认费用。";
  }
  if (/address changes can affect price|address_change_price_recheck/i.test(raw) || code === "address_change_price_recheck") {
    return "地址变更可能影响价格，请客服手动确认费用。";
  }
  if (/service date changes require regrouping|service_date/i.test(raw) || code.includes("service_date")) {
    return "服务日期变化需要重新评估拼车组。";
  }
  if (/Airport changes require price/i.test(raw)) return "机场变更需要重新计价并重新评估拼车组。";
  if (/candidate group lookup failed/i.test(raw)) return "兼容拼车组加载失败，请稍后重试。";
  if (/price|amount|payment/i.test(raw)) return "该修改可能影响价格，请客服手动确认费用。";
  return raw || "请客服确认该风险后再保存。";
}

function buildRecommendedReason() {
  const reasons = preview.value?.group_context?.reasons || [];
  if (requiresMoveOutForRouteUpdate.value) {
    if (reasons.includes("service_date_changed")) return "服务日期已变化，该订单不能继续保留在当前多人拼车组。";
    if (reasons.includes("airport_changed")) return "机场已变化，该订单不能继续保留在当前多人拼车组。";
    if (reasons.includes("service_type_changed")) return "服务类型已变化，该订单不能继续保留在当前多人拼车组。";
  }
  if (reasons.includes("service_date_changed")) return "服务日期变化，原拼车组不建议继续保留。";
  if (reasons.includes("airport_changed")) return "机场变化，原拼车组不建议继续保留。";
  if (reasons.includes("service_type_changed")) return "服务类型变化，原拼车组不建议继续保留。";
  if (reasons.includes("capacity_exceeded")) return "人数变化后可能超过原拼车组容量。";
  if (reasons.includes("shareable_disabled")) return "订单改为不拼车，需要移出当前拼车组。";
  if (!canKeepOriginalGroup.value && props.hasCurrentGroup) return "当前修改会影响拼车匹配，建议重新处理拼车组。";
  return "系统根据本次修改自动推荐。";
}

function actionConsequences() {
  const lines = ["订单行程信息会被更新"];
  if (selectedGroupAction.value === "no_group_change") {
    lines.push("订单继续留在当前拼车组，group_members 关系不变");
  }
  if (selectedGroupAction.value === "move_out_new_single") {
    lines.push("订单会从原拼车组移出");
    lines.push("系统会创建新的单人拼车组");
  }
  if (selectedGroupAction.value === "transfer_existing_group") {
    lines.push("订单会从原拼车组移出");
    lines.push("订单会转入所选目标拼车组");
  }
  if (["move_out_new_single", "transfer_existing_group"].includes(selectedGroupAction.value)) {
    lines.push("原拼车组如变成 0 人，将立即删除");
  }
  if (preview.value?.price_recheck_required || preview.value?.requires_reprice) {
    lines.push("该修改可能影响价格，请客服手动确认费用");
  }
  return lines;
}

function errorMessage(err) {
  const message = String(err?.message || "");
  if (/expired/i.test(message)) return "预览已过期，请重新预览。";
  if (/stale|changed|snapshot/i.test(message)) return "订单或拼车组信息已变化，请重新预览后再确认。";
  if (/多人拼车组|service type|airport\/date/i.test(message)) return message;
  if (/cannot be kept|unsupported group_action|must use|group_action/i.test(message)) return "当前分组处理方式不可用，请重新选择。";
  if (/target_group_id|candidate/i.test(message)) return "目标拼车组不可用，请从预览返回的兼容组中选择。";
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
  if (requiresMoveOutForRouteUpdate.value) {
    const reasons = preview.value?.group_context?.keep_original_group_reasons || [];
    add(
      "multi_member_route_update_requires_move_out",
      reasons.includes("service_date_changed")
        ? "服务日期已变化，该订单不能继续保留在当前多人拼车组。"
        : "该订单已加入多人拼车组，本次修改会影响拼车匹配。"
    );
  }
  fields.forEach(item => {
    if (item.field === "airport_code") add("airport_change", "换机场会影响价格、拼车匹配和原组保留，请确认后再保存。");
    if (item.field === "terminal") add("terminal_change", "换航站楼可能触发跨航站楼价格和拼车兼容性变化。");
    if (item.field === "passenger_count") add("passenger_count_change", "人数变化会影响容量、组价、人均价和订单应收总价。");
    if (item.field === "shareable" && item.after === false) add("shareable_false", "改为不拼车后必须移出原组，且不会新建待匹配组。");
    if (["flight_datetime", "preferred_time_start"].includes(item.field) && dateOnly(item.before) !== dateOnly(item.after)) {
      add("service_date_change", "服务日期变化必须重新计价并重新判断拼车组。");
    }
  });
  if (preview.value?.price_recheck_required || preview.value?.requires_reprice) {
    add("price_recheck_required", "该修改可能影响价格，请客服手动确认费用。");
  }
  return messages;
}

function displayRiskWarnings() {
  const messages = [];
  const add = (code, message) => {
    const normalized = String(message || "").trim();
    if (!normalized) return;
    if (!messages.some(item => item.message === normalized || item.code === code)) {
      messages.push({ code, message: normalized });
    }
  };

  highRiskWarnings().forEach(item => add(item.code, item.message));
  (preview.value?.risks || []).forEach(item => add(item.code || item.message, riskMessage(item)));

  return messages;
}

async function previewImpact() {
  if (!requestId.value || previewLoading.value) return;
  previewLoading.value = true;
  resetPreviewState();
  try {
    const result = await previewTransportOrderChange(requestId.value, buildPayload());
    preview.value = result;
    selectedGroupAction.value = normalizeGroupAction(result?.group_context?.required_group_action) || "no_group_change";
    if (result?.price_recheck_required || result?.requires_reprice) {
      notice.value = "该修改可能影响价格，请客服手动确认费用。";
    }
  } catch (err) {
    error.value = errorMessage(err);
  } finally {
    previewLoading.value = false;
  }
}

async function searchTargetGroup() {
  if (!requestId.value || targetGroupSearchLoading.value) return;
  const query = String(targetGroupSearch.value || "").trim();
  if (!query) {
    targetGroupSearchResult.value = {
      joinable: false,
      reason: "请输入要搜索的拼车组编号。"
    };
    return;
  }
  targetGroupSearchLoading.value = true;
  targetGroupSearchResult.value = null;
  error.value = "";
  try {
    const result = await previewTransportOrderChange(requestId.value, {
      ...buildPayload(),
      target_group_search: query
    });
    preview.value = result;
    const searchResult = result?.group_context?.searched_target_group || null;
    targetGroupSearchResult.value = searchResult || {
      joinable: false,
      reason: "未返回拼车组校验结果，请重新预览后再试。"
    };
    if (searchResult?.joinable && searchResult.group) {
      selectedGroupAction.value = "transfer_existing_group";
      selectedTargetGroupId.value = searchResult.group.group_id || searchResult.group.group_ref || searchResult.group.id || "";
    }
  } catch (err) {
    targetGroupSearchResult.value = {
      joinable: false,
      reason: errorMessage(err)
    };
  } finally {
    targetGroupSearchLoading.value = false;
  }
}

async function confirmImpact() {
  if (!requestId.value || !preview.value || confirming.value) return;
  if (previewExpired.value) {
    error.value = "预览已过期，请重新预览。";
    return;
  }
  const selectedOption = groupActionOptions.value.find(item => item.value === selectedGroupAction.value);
  if (!selectedOption || selectedOption.disabled) {
    error.value = selectedOption?.reason || "当前分组处理方式不可用，请重新预览后选择。";
    return;
  }
  if (selectedGroupAction.value === "transfer_existing_group" && !selectedTargetGroupId.value) {
    error.value = "请先选择预览返回的兼容拼车组。";
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
      target_group_search: selectedGroupAction.value === "transfer_existing_group" ? selectedTargetGroupId.value : undefined,
      preview_token: preview.value.preview_token,
      source_snapshot_hash: preview.value.source_snapshot_hash
    });
    notice.value = result?.pricing?.price_recheck_required || preview.value?.price_recheck_required || preview.value?.requires_reprice
      ? "保存成功，司机摘要已更新。该修改可能影响价格，请客服手动确认费用。"
      : "保存成功，司机摘要已更新。";
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
  <div v-if="open && request" class="membership-modal transport-change-modal" role="dialog" aria-modal="true" aria-label="编辑行程信息">
    <button class="membership-modal__backdrop" type="button" aria-label="Close" @click="closeDrawer"></button>
    <div class="membership-modal__panel transport-change-modal__panel">
      <header class="membership-modal__header">
        <div>
          <h3>编辑行程信息</h3>
          <p>先预览影响，再确认保存。修改机场、日期、服务类型可能影响拼车组和价格。</p>
        </div>
        <button class="table-action-button" type="button" :disabled="previewLoading || confirming" @click="closeDrawer">关闭</button>
      </header>

      <p v-if="error" class="inline-notice inline-notice--error">{{ error }}</p>
      <p v-if="notice" class="inline-notice">{{ notice }}</p>

      <section class="transport-change-section">
        <h4>变更草稿</h4>
        <form class="transport-change-form" @submit.prevent="previewImpact">
          <label><span>服务类型</span><select v-model="changeForm.service_type" :disabled="previewLoading || confirming"><option value="pickup">接机</option><option value="dropoff">送机</option></select></label>
          <label><span>机场</span><select v-model="changeForm.airport_code" :disabled="previewLoading || confirming" @change="handleAirportCodeChange"><option v-for="airport in airportOptions" :key="airport.code" :value="airport.code">{{ airport.code }}</option></select></label>
          <label><span>机场名称</span><input v-model="changeForm.airport_name" :disabled="previewLoading || confirming" /></label>
          <label><span>航站楼</span><input v-model="changeForm.terminal" :disabled="previewLoading || confirming" /></label>
          <label><span>航班号</span><input v-model="changeForm.flight_no" :disabled="previewLoading || confirming" /></label>
          <label><span>航班时间</span><input v-model="changeForm.flight_datetime" type="datetime-local" :disabled="previewLoading || confirming" /></label>
          <label><span>服务开始时间</span><input v-model="changeForm.preferred_time_start" type="datetime-local" :disabled="previewLoading || confirming" /></label>
          <label><span>服务结束时间（可选）</span><input v-model="changeForm.preferred_time_end" type="datetime-local" :disabled="previewLoading || confirming" /></label>
          <label><span>出发地</span><input v-model="changeForm.location_from" :disabled="previewLoading || confirming" /></label>
          <label><span>目的地</span><input v-model="changeForm.location_to" :disabled="previewLoading || confirming" /></label>
          <label><span>人数</span><input v-model.number="changeForm.passenger_count" type="number" min="1" step="1" :disabled="previewLoading || confirming" /></label>
          <label><span>行李数量</span><input v-model.number="changeForm.luggage_count" type="number" min="0" step="1" :disabled="previewLoading || confirming" /></label>
          <label><span>已收金额 GBP</span><input v-model="changeForm.paid_amount_gbp" type="number" min="0" step="0.01" :disabled="previewLoading || confirming" placeholder="可选，客服确认已收金额" /></label>
          <label class="transport-change-form__wide"><span>客户备注</span><textarea v-model="changeForm.notes" rows="2" :disabled="previewLoading || confirming" placeholder="客户可见备注"></textarea></label>
          <label class="transport-change-form__wide"><span>内部备注</span><textarea v-model="changeForm.admin_note" rows="2" :disabled="previewLoading || confirming" placeholder="内部客服备注"></textarea></label>
          <div class="transport-change-form__actions">
            <button class="primary-button" type="submit" :disabled="previewLoading || confirming">{{ previewLoading ? "预览中..." : "预览影响" }}</button>
          </div>
        </form>
      </section>

      <section v-if="preview" class="transport-change-section transport-change-preview">
        <div v-if="preview.changed_fields?.length" class="transport-change-list">
          <strong>变更摘要</strong>
          <table class="transport-change-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>修改前</th>
                <th>修改后</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in preview.changed_fields" :key="item.field">
                <td>{{ fieldLabel(item.field) }}</td>
                <td>{{ displayFieldValue(item.field, item.before) }}</td>
                <td>{{ displayFieldValue(item.field, item.after) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="displayRiskWarnings().length" class="transport-change-list transport-change-list--warning">
          <strong>风险提示</strong>
          <p v-for="risk in displayRiskWarnings()" :key="risk.code || risk.message">{{ risk.message }}</p>
        </div>

        <div class="transport-change-confirm-box">
          <p v-if="previewExpired" class="transport-change-confirm-box__message">预览已过期，请重新预览。</p>
          <p v-else-if="selectedGroupAction === 'transfer_existing_group' && !selectedTargetGroupId" class="transport-change-confirm-box__message">请选择一个预览返回的兼容拼车组。</p>
          <p v-if="requiresMoveOutForRouteUpdate" class="transport-change-confirm-box__message">
            当前订单不能继续留在原多人拼车组，请选择新建单人组或加入兼容拼车组。
          </p>
          <div v-if="false && requiresMoveOutForRouteUpdate" class="transport-change-action-note">
            <strong>最终处理方式：{{ groupActionLabel("move_out_new_single") }}</strong>
          </div>
          <label>
            <span>最终处理方式</span>
            <select v-model="selectedGroupAction" :disabled="confirming">
              <option v-for="option in groupActionOptions" :key="option.value" :value="option.value" :disabled="option.disabled">{{ option.label }}</option>
            </select>
          </label>
          <p v-if="groupActionOptions.find(item => item.value === selectedGroupAction)?.reason" class="transport-change-confirm-box__message">
            {{ groupActionOptions.find(item => item.value === selectedGroupAction)?.reason }}
          </p>
          <div v-if="selectedGroupAction === 'move_out_new_single'" class="transport-change-action-note">
            <p>确认后系统会将该订单移出原拼车组，并根据修改后的行程信息创建一个新的单人拼车组。</p>
            <dl class="transport-change-summary-grid">
              <div><dt>服务类型</dt><dd>{{ serviceLabel(newSingleGroupPreview().service_type) }}</dd></div>
              <div><dt>服务日期</dt><dd>{{ displayValue(newSingleGroupPreview().service_date) }}</dd></div>
              <div><dt>机场</dt><dd>{{ displayValue(newSingleGroupPreview().airport_code) }}</dd></div>
              <div><dt>航站楼</dt><dd>{{ displayValue(newSingleGroupPreview().terminal) }}</dd></div>
              <div><dt>服务时间</dt><dd>{{ formatDisplayDateTime(newSingleGroupPreview().service_time) }}</dd></div>
              <div><dt>预计人数</dt><dd>{{ Number(newSingleGroupPreview().passenger_count || 0) }} 人</dd></div>
            </dl>
          </div>
          <div v-if="selectedGroupAction === 'transfer_existing_group'" class="transport-change-action-note">
            <label>
              <span>搜索拼车组编号</span>
              <input v-model="targetGroupSearch" :disabled="confirming || targetGroupSearchLoading" placeholder="输入 GRP-..." @keyup.enter.prevent="searchTargetGroup" />
            </label>
            <div class="transport-change-form__actions">
              <button class="secondary-button" type="button" :disabled="confirming || targetGroupSearchLoading" @click="searchTargetGroup">
                {{ targetGroupSearchLoading ? "校验中..." : "校验拼车组" }}
              </button>
            </div>
            <p v-if="targetGroupSearchResult" class="transport-change-confirm-box__message">
              {{ targetGroupSearchResult.joinable ? "该拼车组可以加入，已自动选中。" : targetGroupSearchResult.reason }}
            </p>
            <strong>目标拼车组</strong>
            <label>
              <span>目标拼车组</span>
              <select v-model="selectedTargetGroupId" :disabled="confirming || !selectableTargetGroups.length">
                <option value="">请选择目标拼车组</option>
                <option
                  v-for="candidate in selectableTargetGroups"
                  :key="candidate.id || candidate.group_id"
                  :value="candidate.group_id || candidate.group_ref || candidate.id"
                >
                  {{ candidateGroupOptionLabel(candidate) }}
                </option>
              </select>
            </label>
            <p v-if="!selectableTargetGroups.length">暂无可加入的兼容拼车组。可以输入拼车组编号校验原因。</p>
          </div>
          <div class="transport-change-action-summary">
            <strong>当前选择：{{ selectedGroupActionLabel }}</strong>
            <span>确认后：</span>
            <ul>
              <li v-for="item in actionConsequences()" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div class="transport-change-form__actions">
            <button class="secondary-button" type="button" :disabled="confirming" @click="closeDrawer">取消</button>
            <button class="primary-button" type="button" :disabled="confirmButtonDisabled" @click="confirmImpact">{{ confirmButtonLabel }}</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
