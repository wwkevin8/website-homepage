<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchTransportRequest } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import JsonPreview from "@/components/JsonPreview.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const request = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const requestId = computed(() => String(route.params.id || "").trim());

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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? `GBP ${amount.toFixed(2)}` : displayValue(value);
}

const membershipBreakdown = computed(() => parseJson(request.value?.membership_discount_breakdown_json) || null);
const rawDetail = computed(() => ({
  membership_discount_breakdown_json: membershipBreakdown.value,
  luggage_options_json: parseJson(request.value?.luggage_options_json),
  extra_detail_json: parseJson(request.value?.extra_detail_json || request.value?.details_json)
}));

function serviceLabel(serviceType = request.value?.service_type) {
  const labels = {
    pickup: "接机",
    dropoff: "送机"
  };
  return labels[serviceType] || displayValue(serviceType);
}

function statusLabel(status) {
  const labels = {
    pending: "待处理",
    pending_confirmation: "待确认",
    confirmed: "已确认",
    grouped: "已拼车",
    open: "拼车中",
    closed: "已关闭",
    cancelled: "已取消",
    canceled: "已取消"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "confirmed" || status === "grouped") {
    return "success";
  }
  if (status === "cancelled" || status === "canceled" || status === "closed") {
    return "neutral";
  }
  return "warning";
}

function luggageSummary() {
  const text = String(request.value?.notes || "").match(/行李[^：:]*[：:]?\s*([^\n]+)/)?.[1];
  if (text) {
    return text.trim();
  }
  const count = Number(request.value?.luggage_count || 0);
  return count > 0 ? `共 ${count} 件` : "--";
}

function groupHref() {
  const groupRef = String(request.value?.group_ref || request.value?.group_id || "").trim();
  return groupRef ? `/admin-vue/transport/groups/${encodeURIComponent(groupRef)}?return_to=${encodeURIComponent(`/admin-vue/transport/requests/${requestId.value}`)}` : "";
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/transport/requests") ? returnTo : "/admin-vue/transport/requests";
}

function oldDetailHref() {
  return `/transport-admin-request-edit.html?id=${encodeURIComponent(requestId.value)}`;
}

function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

const baseFields = computed(() => [
  field("Order No", request.value?.order_no),
  field("服务类型", serviceLabel()),
  field("状态", statusLabel(request.value?.status)),
  field("创建时间", formatDateTime(request.value?.created_at)),
  field("更新时间", formatDateTime(request.value?.updated_at))
]);

const studentFields = computed(() => [
  field("姓名", request.value?.student_name),
  field("电话", request.value?.phone),
  field("邮箱", firstValue(request.value?.student_email, request.value?.email)),
  field("微信号", request.value?.wechat),
  field("乘客人数", firstValue(request.value?.passenger_count, 1)),
  field("行李数量", luggageSummary(), true)
]);

const flightFields = computed(() => [
  field("机场", [request.value?.airport_code, request.value?.airport_name].filter(Boolean).join(" / ")),
  field("航站楼", request.value?.terminal),
  field("航班号", request.value?.flight_no),
  field("到达/出发日期时间", formatDateTime(request.value?.flight_datetime)),
  field("服务日期", formatDate(firstValue(request.value?.service_date, request.value?.flight_datetime, request.value?.preferred_time_start))),
  field("服务时间", formatDateTime(firstValue(request.value?.preferred_time_start, request.value?.flight_datetime)))
]);

const tripFields = computed(() => [
  field("出发地", request.value?.location_from),
  field("目的地", request.value?.location_to),
  field("接送地址", firstValue(request.value?.pickup_address, request.value?.dropoff_address, request.value?.address_full, request.value?.location_to), true),
  field("公寓/楼宇", firstValue(request.value?.room_or_building, request.value?.apartment_name)),
  field("邮编", request.value?.postcode),
  field("备注", request.value?.notes, true)
]);

const groupFields = computed(() => [
  field("当前 Group ID", firstValue(request.value?.group_id, request.value?.group_ref)),
  field("是否已匹配", firstValue(request.value?.group_id, request.value?.group_ref) ? "是" : "否"),
  field("拼车状态", statusLabel(request.value?.status)),
  field("拼车组引用", request.value?.group_ref)
]);

const noteFields = computed(() => [
  field("用户备注", request.value?.notes, true),
  field("内部备注", request.value?.admin_note, true),
  field("客服备注", firstValue(request.value?.staff_note, request.value?.customer_service_note), true)
]);

const membershipFields = computed(() => [
  field("membership_benefit_claim_id", request.value?.membership_benefit_claim_id),
  field("membership_discount_amount", formatMoney(request.value?.membership_discount_amount)),
  field("extra_charge_amount", formatMoney(request.value?.extra_charge_amount)),
  field("final_price", formatMoney(request.value?.final_price))
]);

function showPlaceholder(action) {
  notice.value = `${action}会在后续迁移阶段实现；当前 Vue 详情页不会发起修改请求。`;
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
  } catch (err) {
    request.value = null;
    error.value = err.message || "接送机订单详情加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadRequest);
</script>

<template>
  <section class="transport-request-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport request readonly detail</p>
        <h2>接送机订单详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回列表" />
        <a class="secondary-button" :href="oldDetailHref()">打开旧详情页</a>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载接送机订单详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!request" title="未找到接送机订单" description="请从接送机订单列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>Order No</span>
          <strong>{{ displayValue(request.order_no) }}</strong>
        </div>
        <StatusBadge :tone="statusTone(request.status)">{{ statusLabel(request.status) }}</StatusBadge>
      </div>

      <DetailSection title="订单基础信息" description="按旧编辑页顶部订单身份信息只读展示。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="学生 / 客户信息" description="展示学生联系方式、乘客人数和行李摘要。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in studentFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="航班与机场信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in flightFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="行程信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in tripFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="拼车信息" description="只读展示当前匹配状态，更换拼车组后续迁移。">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in groupFields" :key="item.label" v-bind="item" />
        </div>
        <a v-if="groupHref()" class="secondary-button detail-inline-link" :href="groupHref()">打开旧拼车组详情</a>
      </DetailSection>

      <DetailSection title="会员抵扣与价格信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in membershipFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="备注信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in noteFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="原始 / 补充字段" description="额外 JSON 默认折叠展示，避免撑开页面。">
        <div class="json-preview-grid">
          <JsonPreview title="membership_discount_breakdown_json" :value="membershipBreakdown" />
          <JsonPreview title="luggage_options_json" :value="rawDetail.luggage_options_json" />
          <JsonPreview title="extra_detail_json" :value="rawDetail.extra_detail_json" />
        </div>
      </DetailSection>

      <DetailSection title="操作区" description="第一轮只读详情不执行保存、删除、分配或付款相关操作。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" @click="showPlaceholder('保存订单')">保存订单</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('更换拼车组')">更换拼车组</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('强制更换')">强制更换</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('重新分配')">重新分配</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除订单')">删除订单</button>
        </div>
      </DetailSection>
    </template>
  </section>
</template>
