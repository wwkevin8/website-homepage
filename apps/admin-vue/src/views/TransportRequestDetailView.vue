<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  fetchTransportGroup,
  fetchTransportGroups,
  fetchTransportRequest,
  saveTransportGroupMembers,
  updateTransportRequest
} from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";

const route = useRoute();
const request = ref(null);
const loading = ref(false);
const saving = ref(false);
const assigning = ref(false);
const error = ref("");
const notice = ref("");
const assignGroupId = ref("");
const assignableGroups = ref([]);

const requestId = computed(() => String(route.params.id || "").trim());
const operationLogs = computed(() => Array.isArray(request.value?.operation_logs) ? request.value.operation_logs : []);
const currentGroupId = computed(() => String(request.value?.group_id || "").trim());
const currentGroupRef = computed(() => String(request.value?.group_ref || request.value?.group_id || "").trim());
const hasCurrentGroup = computed(() => Boolean(currentGroupId.value && currentGroupRef.value));

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

function datePart(value) {
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
    ? `/admin-vue/transport/groups/${encodeURIComponent(groupRef)}?return_to=${encodeURIComponent(`/admin-vue/transport/requests/${requestId.value}`)}`
    : "";
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/transport/requests") ? returnTo : "/admin-vue/transport/requests";
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

function handleAirportCodeChange() {
  const option = airportOptions.find(item => item.code === editableForm.airport_code);
  if (option && (!editableForm.airport_name || airportOptions.some(item => item.name === editableForm.airport_name))) {
    editableForm.airport_name = option.name;
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
    const updated = await updateTransportRequest(requestId.value, {
      airport_code: editableForm.airport_code,
      airport_name: editableForm.airport_name,
      terminal: emptyToNull(editableForm.terminal),
      flight_no: emptyToNull(editableForm.flight_no),
      flight_datetime: emptyToNull(editableForm.flight_datetime),
      location_from: editableForm.location_from,
      location_to: editableForm.location_to,
      preferred_time_start: emptyToNull(editableForm.preferred_time_start),
      notes: emptyToNull(editableForm.notes),
      admin_note: emptyToNull(editableForm.admin_note)
    });
    request.value = updated?.request || updated?.item || updated;
    await loadAssignableGroups(request.value);
    notice.value = "已保存，系统已同步更新上次操作人、时间和操作记录。";
  } catch (err) {
    notice.value = `保存失败：${err.message || "请检查必填字段后重试"}`;
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

onMounted(loadRequest);
</script>

<template>
  <section class="transport-request-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport request detail</p>
        <h2>接送机订单详情</h2>
      </div>
      <div class="view-heading__actions">
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
          <select v-model="editableForm.airport_code" :disabled="saving" @change="handleAirportCodeChange">
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
          <input v-model="editableForm.airport_name" :disabled="saving" />
        </label>

        <label>
          <span>出发航站楼</span>
          <input v-model="editableForm.terminal" :disabled="saving" />
        </label>

        <label>
          <span>航班号</span>
          <input v-model="editableForm.flight_no" :disabled="saving" />
        </label>

        <label>
          <span>航班时间</span>
          <input v-model="editableForm.flight_datetime" :disabled="saving" type="datetime-local" />
        </label>

        <label>
          <span>出发地</span>
          <input v-model="editableForm.location_from" :disabled="saving" />
        </label>

        <label>
          <span>目的地址</span>
          <input v-model="editableForm.location_to" :disabled="saving" />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>接送时间</span>
          <input v-model="editableForm.preferred_time_start" :disabled="saving" type="datetime-local" />
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>备注</span>
          <textarea v-model="editableForm.notes" :disabled="saving" rows="3" placeholder="--"></textarea>
        </label>

        <label class="transport-simple-detail-form__wide">
          <span>内部备注</span>
          <textarea v-model="editableForm.admin_note" :disabled="saving" rows="3" placeholder="--"></textarea>
        </label>

        <div class="transport-simple-detail-form__actions">
          <button class="primary-button" type="submit" :disabled="saving">
            {{ saving ? "保存中..." : "保存订单" }}
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
        <h3>更换现有拼车组</h3>
        <p class="detail-muted">更换到目标拼车组后，系统会自动退出原拼车组，确保一单只属于一个拼车组。</p>
        <form class="transport-force-assign-row" @submit.prevent="assignToGroup(assignGroupId)">
          <label>
            <span>按 Group ID 强制更换</span>
            <input v-model="assignGroupId" :disabled="assigning" type="text" placeholder="输入目标 Group ID" autocomplete="off" />
          </label>
          <button class="table-action-button" type="submit" :disabled="assigning || !assignGroupId.trim()">
            {{ assigning ? "更换中..." : "执行更换" }}
          </button>
        </form>

        <div v-if="assignableGroups.length" class="transport-assign-card-list">
          <article v-for="group in assignableGroups" :key="group.id || group.group_id" class="transport-assign-card">
            <div>
              <strong>{{ displayValue(group.group_id || group.id) }}</strong>
              <p>{{ displayValue(group.airport_code) }} / {{ displayValue(group.terminal) }} / {{ formatDateTime(group.preferred_time_start || group.group_date) }}</p>
              <p>{{ displayValue(group.location_to) }} / 当前 {{ Number(group.current_passenger_count || 0) }} 人 / 剩余 {{ Number(group.remaining_passenger_count || 0) }} 位</p>
            </div>
            <button class="table-action-button" type="button" :disabled="assigning" @click="assignToGroup(group.id || group.group_ref || group.group_id)">
              更换到该拼车组
            </button>
          </article>
        </div>
        <div v-else class="transport-empty-box">当前没有其它可更换的拼车组。</div>
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
</template>
