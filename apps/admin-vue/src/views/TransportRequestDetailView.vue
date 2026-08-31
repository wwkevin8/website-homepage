<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  fetchTransportGroup,
  fetchTransportRequest,
  updateTransportRequestSafeFields
} from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import TransportOrderChangeDrawer from "@/components/TransportOrderChangeDrawer.vue";

const route = useRoute();
const request = ref(null);
const currentGroupDetail = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const changeDrawerOpen = ref(false);
const operationLogOpen = ref(false);

const requestId = computed(() => String(route.params.id || "").trim());
const operationLogs = computed(() => Array.isArray(request.value?.operation_logs) ? request.value.operation_logs : []);
const currentGroupId = computed(() => String(request.value?.group_id || "").trim());
const currentGroupRef = computed(() => String(request.value?.group_ref || request.value?.group_id || "").trim());
const hasCurrentGroup = computed(() => Boolean(currentGroupId.value && currentGroupRef.value));
const currentGroupPassengerText = computed(() => {
  const group = currentGroupDetail.value;
  if (!group) return "--";
  return `${Number(group.current_passenger_count || group.summary?.current_passenger_count || 0)} / ${Number(group.max_passengers || group.summary?.max_passengers || 0)}`;
});

const editableForm = reactive({
  admin_note: ""
});

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
    unpaid: "未收款",
    deposit_paid: "已收定金",
    fully_paid: "已收全款"
  };
  return labels[status] || displayValue(status);
}

function collectedAmountText() {
  return formatMoney(firstValue(
    request.value?.paid_amount_gbp,
    request.value?.received_amount_gbp,
    request.value?.collected_amount_gbp,
    request.value?.deposit_amount_gbp,
    request.value?.confirmed_price_gbp
  ));
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

function groupStatusLabel(status) {
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

function offlineRecordedLabel(value) {
  return value ? "已记录" : "未记录";
}

function groupInfoText() {
  if (!hasCurrentGroup.value) return "暂无拼车组";
  const parts = [
    displayValue(currentGroupId.value),
    `人数 ${currentGroupPassengerText.value}`,
    groupStatusLabel(currentGroupDetail.value?.status || request.value?.status),
    dispatchStatusLabel(currentGroupDetail.value?.dispatch_status)
  ];
  return parts.filter(Boolean).join(" / ");
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin/transport/requests") ? returnTo : "/admin/transport/requests";
}

function populateEditableForm(record = {}) {
  editableForm.admin_note = formText(record.admin_note, record.staff_note, record.customer_service_note);
}

function logAdminName(log) {
  return displayValue(log?.metadata?.admin_name || log?.admin_user?.name || log?.admin_user?.username || log?.admin_user?.email || log?.admin_user_id);
}

function logActionLabel(log) {
  const labels = {
    update_transport_request: "编辑订单",
    add_transport_request_to_group: "加入拼车组",
    remove_transport_request_from_group: "移出拼车组",
    move_transport_request_group: "更换拼车组",
    transport_request_group_changed: "更换拼车组",
    transport_request_removed_from_group: "移出当前组",
    transport_group_created_from_request: "从订单创建拼车组"
  };
  return log?.action_label || labels[log?.action] || (String(log?.action || "").startsWith("transport_membership_") ? "会员权益信息已更新" : "订单信息已更新");
}

function safeLogValue(value) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "object") return "结构化信息已更新";
  return String(value);
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
  changeDrawerOpen.value = true;
}

function closeChangeDrawer() {
  changeDrawerOpen.value = false;
}

function openOperationLog() {
  operationLogOpen.value = true;
}

function closeOperationLog() {
  operationLogOpen.value = false;
}

async function handleOrderChangeSaved() {
  await loadRequest();
  notice.value = "订单变更已保存，订单详情已刷新。";
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
    notice.value = "Saved admin note. Use Order Change for itinerary, price, passenger, payment, or carpool changes.";
  } catch (err) {
    notice.value = `Save failed: ${err.message || "please check and retry"}`;
  } finally {
    saving.value = false;
  }
}

async function loadCurrentGroupDetail(record = request.value) {
  currentGroupDetail.value = null;
  const groupRef = String(record?.group_ref || record?.group_id || "").trim();
  if (!groupRef) return;
  try {
    currentGroupDetail.value = await fetchTransportGroup(groupRef);
  } catch (err) {
    currentGroupDetail.value = null;
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
    await loadCurrentGroupDetail(request.value);
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
});
</script>

<template>
  <section class="transport-request-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">接送机订单详情</p>
        <h2>接送机订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" @click="openOperationLog">
          查看操作记录
        </button>
        <button class="secondary-button" type="button" @click="openChangeDrawer">
          编辑行程信息
        </button>
        <BackButton :href="listHref()" label="返回列表" />
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载接送机订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!request" title="未找到接送机订单" description="请从接送机订单列表重新进入详情页。" />

    <template v-else>
      <section class="transport-detail-panel">
        <div class="transport-panel-header">
          <div>
            <h3>订单信息</h3>
            <p class="detail-muted">详情页仅展示当前订单信息；行程字段请通过“编辑行程信息”修改。</p>
          </div>
        </div>
        <dl class="transport-readonly-detail-grid">
          <div><dt>服务类型</dt><dd>{{ serviceLabel() }}</dd></div>
          <div><dt>姓名</dt><dd>{{ fieldValue(request.student_name, request.name, extraDetail.name) }}</dd></div>
          <div><dt>电话</dt><dd>{{ fieldValue(request.phone, request.mobile, extraDetail.phone) }}</dd></div>
          <div><dt>微信</dt><dd>{{ fieldValue(request.wechat, request.wechat_id, extraDetail.wechat) }}</dd></div>
          <div><dt>人数</dt><dd>{{ fieldValue(request.passenger_count, extraDetail.passenger_count, 1) }}</dd></div>
          <div><dt>行李数量</dt><dd>{{ luggageSummary() }}</dd></div>
          <div><dt>机场</dt><dd>{{ fieldValue(request.airport_code, extraDetail.airport_code) }}</dd></div>
          <div><dt>机场名称</dt><dd>{{ fieldValue(request.airport_name, extraDetail.airport_name) }}</dd></div>
          <div><dt>航站楼</dt><dd>{{ fieldValue(request.terminal, extraDetail.terminal) }}</dd></div>
          <div><dt>航班号</dt><dd>{{ fieldValue(request.flight_no, extraDetail.flight_no) }}</dd></div>
          <div><dt>航班时间</dt><dd>{{ formatDateTime(firstValue(request.flight_datetime, extraDetail.flight_datetime)) }}</dd></div>
          <div><dt>服务时间</dt><dd>{{ formatDateTime(firstValue(request.preferred_time_start, request.service_time, extraDetail.preferred_time_start)) }}</dd></div>
          <div class="transport-readonly-detail-grid__wide"><dt>出发地</dt><dd>{{ fieldValue(request.location_from, request.pickup_address, extraDetail.location_from) }}</dd></div>
          <div class="transport-readonly-detail-grid__wide"><dt>目的地</dt><dd>{{ fieldValue(request.location_to, request.dropoff_address, request.address_full, extraDetail.location_to) }}</dd></div>
          <div class="transport-readonly-detail-grid__wide"><dt>客户备注</dt><dd>{{ fieldValue(request.notes, extraDetail.notes) }}</dd></div>
          <div><dt>收款状态</dt><dd>{{ paymentStatusLabel(request.payment_collection_status) }}</dd></div>
          <div><dt>已收金额</dt><dd>{{ collectedAmountText() }}</dd></div>
          <div><dt>是否已记录</dt><dd>{{ offlineRecordedLabel(request.offline_recorded) }}</dd></div>
          <div class="transport-readonly-detail-grid__wide">
            <dt>拼车组信息</dt>
            <dd>
              {{ groupInfoText() }}
              <a v-if="hasCurrentGroup" :href="groupDetailHref()">查看拼车组</a>
            </dd>
          </div>
        </dl>
      </section>

      <form class="transport-detail-panel transport-admin-note-panel" @submit.prevent="saveEditableFields">
        <label>
          <span>内部备注</span>
          <textarea v-model="editableForm.admin_note" :disabled="saving" rows="4" placeholder="--"></textarea>
        </label>
        <div class="transport-simple-detail-form__actions">
          <button class="primary-button" type="submit" :disabled="saving">
            {{ saving ? "保存中..." : "保存内部备注" }}
          </button>
        </div>
      </form>
    </template>
  </section>
  <div v-if="operationLogOpen" class="membership-modal transport-log-drawer" role="dialog" aria-modal="true" aria-label="查看操作记录">
    <button class="membership-modal__backdrop" type="button" aria-label="关闭" @click="closeOperationLog"></button>
    <div class="membership-modal__panel transport-log-drawer__panel">
      <header class="membership-modal__header">
        <div>
          <h3>操作记录</h3>
          <p>查看该订单的审计记录。</p>
        </div>
        <button class="table-action-button" type="button" @click="closeOperationLog">关闭</button>
      </header>
      <div v-if="!operationLogs.length" class="transport-empty-box">暂无操作记录</div>
      <div v-else class="transport-log-drawer__body">
        <article v-for="log in operationLogs" :key="log.id || `${log.action}-${log.created_at}`" class="transport-log-card">
          <div class="transport-log-card__meta">
            <strong>{{ log.display_summary || logActionLabel(log) }}</strong>
            <span>{{ logAdminName(log) }} / {{ formatDateTime(log.created_at) }}</span>
          </div>
          <dl v-if="log.display_details?.length" class="transport-operation-log-grid">
            <div v-for="detail in log.display_details" :key="`${detail.label}-${detail.value}`">
              <dt>{{ detail.label }}</dt>
              <dd>{{ detail.value }}</dd>
            </div>
          </dl>
          <table v-if="!log.display_summary" class="transport-log-table">
            <thead>
              <tr>
                <th>操作类型</th>
                <th>修改字段</th>
                <th>修改前</th>
                <th>修改后</th>
                <th>操作人</th>
                <th>操作时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in logChangedFields(log)" :key="`${log.id || log.action}-${item.field}`">
                <td>{{ logActionLabel(log) }}</td>
                <td>{{ item.label || item.field || "--" }}</td>
                <td>{{ safeLogValue(item.before) }}</td>
                <td>{{ safeLogValue(item.after) }}</td>
                <td>{{ logAdminName(log) }}</td>
                <td>{{ formatDateTime(log.created_at) }}</td>
              </tr>
              <tr v-if="!logChangedFields(log).length">
                <td>{{ logActionLabel(log) }}</td>
                <td>--</td>
                <td>--</td>
                <td>--</td>
                <td>{{ logAdminName(log) }}</td>
                <td>{{ formatDateTime(log.created_at) }}</td>
              </tr>
            </tbody>
          </table>
        </article>
      </div>
    </div>
  </div>
  <TransportOrderChangeDrawer
    :open="changeDrawerOpen"
    :request="request"
    :extra-detail="extraDetail"
    :current-group-id="currentGroupId"
    :has-current-group="hasCurrentGroup"
    @close="closeChangeDrawer"
    @saved="handleOrderChangeSaved"
  />
</template>
