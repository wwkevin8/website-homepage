<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchTransportGroup } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import JsonPreview from "@/components/JsonPreview.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const group = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const groupId = computed(() => String(route.params.id || "").trim());

const memberColumns = [
  { key: "order_no", label: "订单号", width: "11%" },
  { key: "student_name", label: "学生姓名", width: "12%" },
  { key: "contact", label: "电话 / 微信", width: "14%" },
  { key: "flight_no", label: "航班号", width: "10%" },
  { key: "flight_datetime", label: "到达/出发时间", width: "14%" },
  { key: "luggage", label: "行李数量", width: "10%" },
  { key: "payment", label: "付款状态", width: "10%" },
  { key: "actions", label: "操作", width: "120px", className: "is-actions", sticky: "end" }
];

function parseJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (err) {
    return value;
  }
}

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatDate(value) {
  const text = String(value || "").slice(0, 10);
  if (!text) {
    return "--";
  }
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
  if (!value) {
    return "--";
  }
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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? `GBP ${amount.toFixed(2)}` : displayValue(value);
}

function serviceLabel(serviceType = group.value?.service_type) {
  const labels = {
    pickup: "接机",
    dropoff: "送机"
  };
  return labels[serviceType] || displayValue(serviceType);
}

function statusLabel(status) {
  const labels = {
    single_member: "拼车中",
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
  if (status === "full") {
    return "success";
  }
  if (status === "closed" || status === "cancelled" || status === "canceled") {
    return "neutral";
  }
  return "warning";
}

function paymentStatusLabel(status) {
  return status === "paid" ? "已付款" : status === "unpaid" ? "未付款" : displayValue(status);
}

function paymentStatusTone(status) {
  return status === "paid" ? "success" : "warning";
}

function currentCount() {
  return Number(group.value?.summary?.current_passenger_count || group.value?.current_passenger_count || groupMembers.value.length || 0);
}

function maxPassengers() {
  return Number(group.value?.summary?.max_passengers || group.value?.max_passengers || 0);
}

function remainingSeats() {
  const max = maxPassengers();
  return max > 0 ? Math.max(max - currentCount(), 0) : "--";
}

function paymentSummary() {
  return group.value?.payment_summary || {};
}

function allPaidLabel() {
  const payment = paymentSummary();
  const total = Number(payment.total_member_count || currentCount() || 0);
  const unpaid = Number(payment.unpaid_member_count || 0);
  return total > 0 && unpaid <= 0 ? "是" : "否";
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

const groupMembers = computed(() => {
  const members = Array.isArray(group.value?.members) ? group.value.members : [];
  return members.map(member => {
    const request = member.transport_requests || member.request || {};
    return {
      id: member.id,
      request_id: member.request_id || request.id,
      order_no: request.order_no || member.order_no,
      student_name: request.student_name || member.student_name,
      phone: request.phone,
      wechat: request.wechat,
      flight_no: request.flight_no,
      flight_datetime: request.flight_datetime,
      luggage: firstValue(request.luggage_count, member.luggage_count_snapshot, "--"),
      location_to: request.location_to,
      terminal: request.terminal,
      payment_status: member.payment_status || request.payment_status,
      joined_at: member.joined_at || member.created_at
    };
  });
});

const baseFields = computed(() => [
  field("Group ID", firstValue(group.value?.group_id, group.value?.id)),
  field("服务类型", serviceLabel()),
  field("组状态", statusLabel(group.value?.status)),
  field("创建时间", formatDateTime(group.value?.created_at)),
  field("更新时间", formatDateTime(group.value?.updated_at))
]);

const tripFields = computed(() => [
  field("机场", [group.value?.airport_code, group.value?.airport_name].filter(Boolean).join(" / ")),
  field("航站楼", firstValue(group.value?.terminal_summary, group.value?.terminal)),
  field("接送时间", formatDateTime(firstValue(group.value?.preferred_time_start, group.value?.flight_time_reference))),
  field("出行日期", formatDate(group.value?.group_date)),
  field("目的地", group.value?.location_to, true),
  field("出发地/送达地", firstValue(group.value?.location_from, group.value?.location_to), true),
  field("跨航站楼费", formatMoney(firstValue(group.value?.cross_terminal_surcharge_total_gbp, paymentSummary().cross_terminal_surcharge_total_gbp)))
]);

const seatFields = computed(() => [
  field("当前人数", currentCount()),
  field("最大人数", maxPassengers() || "--"),
  field("剩余座位", remainingSeats()),
  field("是否满员", maxPassengers() > 0 && currentCount() >= maxPassengers() ? "是" : "否")
]);

const paymentFields = computed(() => [
  field("是否全部已付款", allPaidLabel()),
  field("已付款人数", firstValue(paymentSummary().paid_member_count, "--")),
  field("未付款人数", firstValue(paymentSummary().unpaid_member_count, "--")),
  field("总价", formatMoney(paymentSummary().total_price_gbp)),
  field("当前人均价", formatMoney(paymentSummary().average_price_gbp)),
  field("跨航站楼附加费", formatMoney(paymentSummary().cross_terminal_surcharge_total_gbp))
]);

const noteFields = computed(() => [
  field("用户备注", group.value?.user_note, true),
  field("内部备注", group.value?.admin_note, true),
  field("组备注", group.value?.notes, true)
]);

const dispatchSummary = computed(() => {
  return firstValue(group.value?.dispatch_summary, group.value?.driver_dispatch_summary, group.value?.driver_note, group.value?.notes);
});

const rawDetail = computed(() => ({
  summary: group.value?.summary,
  payment_summary: group.value?.payment_summary,
  member_details: group.value?.member_details,
  raw_notes_json: parseJson(group.value?.notes_json)
}));

function oldDetailHref() {
  return `/transport-admin-group-edit.html?id=${encodeURIComponent(groupId.value)}`;
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/transport/") ? returnTo : "/admin-vue/transport/groups";
}

function requestHref(member) {
  const id = member.request_id || member.order_no;
  return id ? `/admin-vue/transport/requests/${encodeURIComponent(id)}?return_to=${encodeURIComponent(`/admin-vue/transport/groups/${groupId.value}`)}` : "";
}

function showPlaceholder(action) {
  notice.value = `${action}会在后续迁移阶段实现；当前 Vue 详情页不会发起修改请求。`;
}

async function loadGroup() {
  if (!groupId.value) {
    group.value = null;
    error.value = "缺少拼车组 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchTransportGroup(groupId.value);
    group.value = payload?.group || payload?.item || payload;
  } catch (err) {
    group.value = null;
    error.value = err.message || "拼车组详情加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadGroup);
</script>

<template>
  <section class="transport-group-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport group readonly detail</p>
        <h2>拼车组详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回列表" />
        <a class="secondary-button" :href="oldDetailHref()">打开旧拼车组详情</a>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载拼车组详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!group" title="未找到拼车组" description="请从拼车组列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>Group ID</span>
          <strong>{{ displayValue(group.group_id || group.id) }}</strong>
        </div>
        <StatusBadge :tone="statusTone(group.status)">{{ statusLabel(group.status) }}</StatusBadge>
      </div>

      <DetailSection title="拼车组基础信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="行程信息" description="按旧拼车组详情页的行程和机场信息只读展示。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in tripFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="人数与座位信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in seatFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="费用与付款信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in paymentFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="组内成员列表" description="成员操作暂不迁移；每个成员可进入 Vue 接送机订单详情。">
        <AdminTable :columns="memberColumns" :rows="groupMembers">
          <template #cell-order_no="{ row }">
            <strong class="cell-truncate" :title="displayValue(row.order_no)">{{ displayValue(row.order_no) }}</strong>
          </template>
          <template #cell-student_name="{ row }">
            <span class="cell-stack">
              <strong class="cell-truncate" :title="displayValue(row.student_name)">{{ displayValue(row.student_name) }}</strong>
              <small>{{ displayValue(row.terminal) }}</small>
            </span>
          </template>
          <template #cell-contact="{ row }">
            <span class="cell-stack" :title="[row.phone, row.wechat].filter(Boolean).join(' / ') || '--'">
              <span class="cell-truncate">{{ displayValue(row.phone) }}</span>
              <small>{{ displayValue(row.wechat) }}</small>
            </span>
          </template>
          <template #cell-flight_no="{ row }">
            <span class="cell-truncate" :title="displayValue(row.flight_no)">{{ displayValue(row.flight_no) }}</span>
          </template>
          <template #cell-flight_datetime="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.flight_datetime)">{{ formatDateTime(row.flight_datetime) }}</span>
          </template>
          <template #cell-luggage="{ row }">
            <span class="cell-truncate">{{ displayValue(row.luggage) }}</span>
          </template>
          <template #cell-payment="{ row }">
            <StatusBadge :tone="paymentStatusTone(row.payment_status)">
              {{ paymentStatusLabel(row.payment_status) }}
            </StatusBadge>
          </template>
          <template #cell-actions="{ row }">
            <a v-if="requestHref(row)" class="table-action-button" :href="requestHref(row)">订单详情</a>
            <span v-else class="cell-truncate">--</span>
          </template>
        </AdminTable>
      </DetailSection>

      <DetailSection title="司机 / 派单摘要" description="仅展示已有摘要或备注，不在 Vue 中重新生成复杂派单文本。">
        <details v-if="dispatchSummary" class="detail-text-block" open>
          <summary>派单摘要 / 司机备注</summary>
          <pre>{{ dispatchSummary }}</pre>
        </details>
        <p v-else class="detail-muted">暂无司机派单摘要。</p>
      </DetailSection>

      <DetailSection title="备注与内部信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="原始 / 补充字段" description="复杂字段默认折叠展示，避免撑开页面。">
        <div class="json-preview-grid">
          <JsonPreview title="summary" :value="rawDetail.summary" />
          <JsonPreview title="payment_summary" :value="rawDetail.payment_summary" />
          <JsonPreview title="member_details" :value="rawDetail.member_details" />
          <JsonPreview title="notes_json" :value="rawDetail.raw_notes_json" />
        </div>
      </DetailSection>

      <DetailSection title="操作区" description="第一轮只读详情不执行删除、付款确认、成员修改或行程修改。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" @click="showPlaceholder('保存修改')">保存修改</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('确认全部付款')">确认全部付款</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('修改接送时间')">修改接送时间</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('修改最大人数')">修改最大人数</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('移除/修改成员')">移除/修改成员</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除拼车组')">删除拼车组</button>
        </div>
      </DetailSection>
    </template>
  </section>
</template>
