<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchPostageOrder, fetchPostageOrders, updatePostageOrder } from "@/api/admin-api";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const STATUS_OPTIONS = [
  ["", "全部"],
  ["new", "新提交"],
  ["contacted", "已联系"],
  ["pending_pickup", "待取件"],
  ["picked_up", "已取件"],
  ["weighed_pending_quote", "已称重 / 待报价"],
  ["pending_payment", "待付款"],
  ["paid", "已付款"],
  ["shipped", "已发货"],
  ["completed", "已完成"],
  ["cancelled", "已取消"]
];

const BOX_DELIVERY_OPTIONS = [
  ["", "全部送箱状态"],
  ["not_required", "无需送箱"],
  ["pending", "待送箱"],
  ["arranged", "已安排送箱"],
  ["delivered", "已送箱"],
  ["issue", "送箱异常"]
];

const PAYMENT_OPTIONS = [
  ["", "全部付款状态"],
  ["unpaid", "未付款"],
  ["pending_confirmation", "待确认"],
  ["paid", "已付款"],
  ["refunded", "已退款"],
  ["not_required", "无需付款"]
];

const QUICK_FILTERS = [
  ["", "快捷筛选"],
  ["box_delivery_today", "今日送箱"],
  ["box_delivery_tomorrow", "明日送箱"],
  ["box_delivery_this_week", "本周送箱"],
  ["pickup_today", "今日取件"],
  ["pickup_tomorrow", "明日取件"],
  ["pickup_this_week", "本周取件"],
  ["sensitive", "含敏感物品"],
  ["need_boxes", "需要纸箱"],
  ["need_box_delivery_upstairs", "需要上楼送箱"],
  ["need_pickup_upstairs", "需要上楼取件"],
  ["unassigned", "未分配负责人"],
  ["has_note", "有备注"],
  ["missing_logistics", "待填写物流"],
  ["missing_final_total", "待登记金额"],
  ["pending_payment", "待付款"]
];

const statusLabel = Object.fromEntries(STATUS_OPTIONS.filter(([value]) => value));
const boxDeliveryLabel = Object.fromEntries(BOX_DELIVERY_OPTIONS.filter(([value]) => value));
const paymentLabel = Object.fromEntries(PAYMENT_OPTIONS.filter(([value]) => value));

const filters = reactive({
  search: "",
  status: "",
  boxDeliveryStatus: "",
  paymentStatus: "",
  quickFilter: "",
  sort: "created_desc",
  pageSize: 20
});
const orders = ref([]);
const pagination = ref({ page: 1, page_size: 20, total: 0, total_pages: 0 });
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const drawerOpen = ref(false);
const selected = ref(null);
const draft = reactive({});
const itemTypesText = ref("");

const hasOrders = computed(() => orders.value.length > 0);

function display(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatDate(value) {
  const text = String(value || "").slice(0, 10);
  return text || "--";
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/London",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? `£${number.toFixed(2)}` : String(value);
}

function fullAddress(row, prefix) {
  return [
    row[`${prefix}_building`],
    row[`${prefix}_room`],
    row[`${prefix}_address`],
    row[`${prefix}_postcode`]
  ].filter(Boolean).join(" / ");
}

function rowSummary(row) {
  return [
    row.preferred_route,
    row.box_count ? `${row.box_count}箱` : "",
    row.single_box_weight ? `${row.single_box_weight}kg/箱` : "",
    row.need_boxes ? "需纸箱" : "",
    row.need_box_delivery ? "需送箱" : "",
    row.pickup_need_upstairs ? "取件上楼" : ""
  ].filter(Boolean).join(" · ") || "--";
}

function buildQuery(page = 1) {
  return {
    page,
    page_size: filters.pageSize,
    search: filters.search.trim(),
    status: filters.status,
    box_delivery_status: filters.boxDeliveryStatus,
    payment_status: filters.paymentStatus,
    quick_filter: filters.quickFilter,
    sort: filters.sort
  };
}

async function loadOrders(page = 1) {
  loading.value = true;
  error.value = "";
  try {
    const data = await fetchPostageOrders(buildQuery(page));
    orders.value = data.items || [];
    pagination.value = {
      page: data.page || page,
      page_size: data.page_size || filters.pageSize,
      total: data.total || 0,
      total_pages: data.total_pages || 0
    };
  } catch (loadError) {
    error.value = loadError.message || "邮寄工单加载失败";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadOrders(1);
}

function resetFilters() {
  Object.assign(filters, {
    search: "",
    status: "",
    boxDeliveryStatus: "",
    paymentStatus: "",
    quickFilter: "",
    sort: "created_desc",
    pageSize: 20
  });
  loadOrders(1);
}

function fillDraft(order) {
  Object.keys(draft).forEach(key => delete draft[key]);
  Object.assign(draft, {
    assigned_to: order.assigned_to || "",
    status: order.status || "new",
    box_delivery_status: order.box_delivery_status || "not_required",
    payment_status: order.payment_status || "unpaid",
    customer_name: order.customer_name || "",
    wechat_id: order.wechat_id || "",
    phone: order.phone || "",
    email: order.email || "",
    service_type: order.service_type || "",
    preferred_route: order.preferred_route || "",
    box_count: order.box_count || 1,
    single_box_weight: order.single_box_weight || "",
    different_box_weights: Boolean(order.different_box_weights),
    need_boxes: Boolean(order.need_boxes),
    box_type: order.box_type || "",
    need_packing_materials: Boolean(order.need_packing_materials),
    packing_materials: order.packing_materials || "",
    has_sensitive_items: Boolean(order.has_sensitive_items),
    user_note: order.user_note || "",
    need_box_delivery: Boolean(order.need_box_delivery),
    box_delivery_same_as_pickup: Boolean(order.box_delivery_same_as_pickup),
    box_delivery_address: order.box_delivery_address || "",
    box_delivery_postcode: order.box_delivery_postcode || "",
    box_delivery_building: order.box_delivery_building || "",
    box_delivery_room: order.box_delivery_room || "",
    box_delivery_need_upstairs: Boolean(order.box_delivery_need_upstairs),
    box_delivery_has_lift: Boolean(order.box_delivery_has_lift),
    preferred_box_delivery_date: formatDate(order.preferred_box_delivery_date).replace("--", ""),
    preferred_box_delivery_time_slot: order.preferred_box_delivery_time_slot || "",
    box_delivery_note: order.box_delivery_note || "",
    need_pickup: Boolean(order.need_pickup),
    pickup_address: order.pickup_address || "",
    pickup_postcode: order.pickup_postcode || "",
    pickup_building: order.pickup_building || "",
    pickup_room: order.pickup_room || "",
    pickup_need_upstairs: Boolean(order.pickup_need_upstairs),
    pickup_has_lift: Boolean(order.pickup_has_lift),
    preferred_pickup_date: formatDate(order.preferred_pickup_date).replace("--", ""),
    preferred_pickup_time_slot: order.preferred_pickup_time_slot || "",
    pickup_note: order.pickup_note || "",
    recipient_country: order.recipient_country || "",
    recipient_city: order.recipient_city || "",
    recipient_name: order.recipient_name || "",
    recipient_phone: order.recipient_phone || "",
    recipient_address: order.recipient_address || "",
    actual_box_count: order.actual_box_count || "",
    actual_weight_note: order.actual_weight_note || "",
    weighing_note: order.weighing_note || "",
    final_route: order.final_route || "",
    final_postage: order.final_postage || 0,
    final_box_fee: order.final_box_fee || 0,
    final_packing_fee: order.final_packing_fee || 0,
    box_delivery_fee: order.box_delivery_fee || 0,
    box_delivery_upstairs_fee: order.box_delivery_upstairs_fee || 0,
    pickup_upstairs_fee: order.pickup_upstairs_fee || 0,
    other_fee: order.other_fee || 0,
    discount: order.discount || 0,
    final_total: order.final_total ?? "",
    fee_note: order.fee_note || "",
    paid_at: order.paid_at ? String(order.paid_at).slice(0, 16) : "",
    payment_method: order.payment_method || "",
    payment_note: order.payment_note || "",
    carrier: order.carrier || "",
    tracking_number: order.tracking_number || "",
    shipped_at: formatDate(order.shipped_at).replace("--", ""),
    tracking_url: order.tracking_url || "",
    logistics_note: order.logistics_note || "",
    internal_note: order.internal_note || ""
  });
  itemTypesText.value = Array.isArray(order.item_types) ? order.item_types.join("、") : "";
}

async function openDrawer(order) {
  error.value = "";
  try {
    const detail = await fetchPostageOrder(order.id);
    selected.value = detail;
    fillDraft(detail);
    drawerOpen.value = true;
  } catch (loadError) {
    error.value = loadError.message || "邮寄工单详情加载失败";
  }
}

function closeDrawer() {
  drawerOpen.value = false;
  selected.value = null;
}

function splitItemTypes() {
  return itemTypesText.value
    .split(/[、,，]/)
    .map(item => item.trim())
    .filter(Boolean);
}

async function saveDraft() {
  if (!selected.value) return;
  saving.value = true;
  notice.value = "";
  try {
    const payload = {
      ...draft,
      item_types: splitItemTypes(),
      paid_at: draft.paid_at ? new Date(draft.paid_at).toISOString() : null
    };
    const updated = await updatePostageOrder(selected.value.id, payload);
    selected.value = updated;
    fillDraft(updated);
    notice.value = "邮寄工单已保存";
    await loadOrders(pagination.value.page || 1);
  } catch (saveError) {
    error.value = saveError.message || "保存失败";
  } finally {
    saving.value = false;
  }
}

async function quickStatus(order, status) {
  try {
    await updatePostageOrder(order.id, { status });
    await loadOrders(pagination.value.page || 1);
  } catch (updateError) {
    error.value = updateError.message || "状态更新失败";
  }
}

function buildSummary(order) {
  const lines = [
    "【邮寄需求】",
    `订单编号：${order.order_no || ""}`,
    `姓名：${order.customer_name || ""}`,
    `微信：${order.wechat_id || ""}`,
    `电话：${order.phone || ""}`,
    `服务类型：${order.service_type || ""}`,
    `预期路线：${order.preferred_route || ""}`,
    `箱数：${order.box_count || ""}`,
    `预计单箱重量：${order.single_box_weight || ""}`,
    `是否需要纸箱：${order.need_boxes ? "是" : "否"}`,
    `纸箱型号：${order.box_type || ""}`,
    `是否需要送箱：${order.need_box_delivery ? "是" : "否"}`,
    `送箱地址：${fullAddress(order, "box_delivery")}`,
    `期望送箱时间：${[order.preferred_box_delivery_date, order.preferred_box_delivery_time_slot].filter(Boolean).join(" ")}`,
    `送箱状态：${boxDeliveryLabel[order.box_delivery_status] || ""}`,
    `是否需要取件：${order.need_pickup ? "是" : "否"}`,
    `取件地址：${fullAddress(order, "pickup")}`,
    `期望取件时间：${[order.preferred_pickup_date, order.preferred_pickup_time_slot].filter(Boolean).join(" ")}`,
    `收件国家/地区：${order.recipient_country || ""}`,
    `收件城市：${order.recipient_city || ""}`,
    `收件人：${order.recipient_name || ""}`,
    `收件电话：${order.recipient_phone || ""}`,
    `物品类型：${Array.isArray(order.item_types) ? order.item_types.join("、") : ""}`,
    `敏感物品：${order.has_sensitive_items ? "是" : "否"}`,
    `当前状态：${statusLabel[order.status] || ""}`,
    `付款状态：${paymentLabel[order.payment_status] || ""}`,
    `最终金额：${order.final_total ?? ""}`,
    `备注：${order.user_note || order.internal_note || ""}`
  ];
  if (order.carrier || order.tracking_number || order.tracking_url) {
    lines.push("", `承运商：${order.carrier || ""}`, `物流单号：${order.tracking_number || ""}`, `查询链接：${order.tracking_url || ""}`);
  }
  return lines.join("\n");
}

async function copySummary(order) {
  await navigator.clipboard?.writeText(buildSummary(order)).catch(() => {});
  notice.value = "摘要已复制";
}

onMounted(() => {
  loadOrders(1);
});
</script>

<template>
  <div class="admin-page postage-orders-view">
    <header class="admin-page-header">
      <div>
        <p class="admin-page-kicker">Postage</p>
        <h1>邮寄工单</h1>
        <p>客服在这里处理邮寄需求、送箱、取件、称重、费用、付款和物流。</p>
      </div>
    </header>

    <form class="admin-filter-panel postage-order-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field postage-order-filter-panel__search">
        <span>搜索</span>
        <input v-model="filters.search" type="search" placeholder="订单号 / 姓名 / 微信 / 手机 / 公寓 / 收件城市 / 物流单号" />
      </label>
      <label class="field">
        <span>订单状态</span>
        <select v-model="filters.status">
          <option v-for="[value, label] in STATUS_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span>送箱状态</span>
        <select v-model="filters.boxDeliveryStatus">
          <option v-for="[value, label] in BOX_DELIVERY_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span>付款状态</span>
        <select v-model="filters.paymentStatus">
          <option v-for="[value, label] in PAYMENT_OPTIONS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span>快捷筛选</span>
        <select v-model="filters.quickFilter">
          <option v-for="[value, label] in QUICK_FILTERS" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label class="field">
        <span>排序</span>
        <select v-model="filters.sort">
          <option value="created_desc">最新提交</option>
          <option value="box_delivery_asc">送箱时间最近</option>
          <option value="pickup_asc">取件时间最近</option>
        </select>
      </label>
      <label class="field">
        <span>每页</span>
        <select v-model.number="filters.pageSize" @change="loadOrders(1)">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <div class="filter-actions postage-order-filter-panel__actions">
        <button type="submit">筛选</button>
        <button type="reset">重置</button>
      </div>
    </form>

    <p v-if="notice" class="admin-notice is-success">{{ notice }}</p>
    <ErrorState v-if="error" :message="error" />
    <LoadingState v-if="loading" label="正在加载邮寄工单..." />
    <EmptyState v-else-if="!hasOrders" title="暂无邮寄工单" description="新提交的邮寄需求会出现在这里。" />

    <div v-else class="admin-table-wrap postage-orders-table">
      <table class="admin-table">
        <thead>
          <tr>
            <th>订单编号</th>
            <th>提交时间</th>
            <th>送箱时间</th>
            <th>取件时间</th>
            <th>姓名</th>
            <th>微信 / 电话</th>
            <th>服务类型</th>
            <th>信息摘要</th>
            <th>敏感品</th>
            <th>最终金额</th>
            <th>付款</th>
            <th>订单状态</th>
            <th>送箱状态</th>
            <th>负责人</th>
            <th class="is-actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="order in orders" :key="order.id">
            <td><strong>{{ order.order_no }}</strong></td>
            <td>{{ formatDateTime(order.created_at) }}</td>
            <td>{{ [formatDate(order.preferred_box_delivery_date), order.preferred_box_delivery_time_slot].filter((item) => item && item !== "--").join(" ") || "--" }}</td>
            <td>{{ [formatDate(order.preferred_pickup_date), order.preferred_pickup_time_slot].filter((item) => item && item !== "--").join(" ") || "--" }}</td>
            <td>{{ display(order.customer_name) }}</td>
            <td>{{ [order.wechat_id, order.phone].filter(Boolean).join(" / ") || "--" }}</td>
            <td>{{ display(order.service_type) }}</td>
            <td class="is-wrap">{{ rowSummary(order) }}</td>
            <td>
              <StatusBadge :tone="order.has_sensitive_items ? 'danger' : 'neutral'">
                {{ order.has_sensitive_items ? "敏感品" : "普通" }}
              </StatusBadge>
            </td>
            <td>{{ formatMoney(order.final_total) }}</td>
            <td>{{ paymentLabel[order.payment_status] || order.payment_status }}</td>
            <td>{{ statusLabel[order.status] || order.status }}</td>
            <td>{{ boxDeliveryLabel[order.box_delivery_status] || order.box_delivery_status }}</td>
            <td>{{ display(order.assigned_to) }}</td>
            <td class="is-actions">
              <button type="button" @click="openDrawer(order)">打开详情</button>
              <button type="button" @click="copySummary(order)">复制摘要</button>
              <select :value="order.status" @change="quickStatus(order, $event.target.value)">
                <option v-for="[value, label] in STATUS_OPTIONS.filter(([value]) => value)" :key="value" :value="value">{{ label }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Pagination
      v-if="pagination.total_pages > 1"
      :page="pagination.page"
      :total-pages="pagination.total_pages"
      @change="loadOrders"
    />

    <div v-if="drawerOpen && selected" class="postage-order-drawer">
      <div class="postage-order-drawer__backdrop" @click="closeDrawer"></div>
      <aside class="postage-order-drawer__panel" role="dialog" aria-modal="true" aria-label="邮寄工单详情">
        <header class="postage-order-drawer__header">
          <div>
            <p class="admin-page-kicker">Postage Detail</p>
            <h2>{{ selected.order_no }}</h2>
            <p>{{ statusLabel[selected.status] }} · {{ boxDeliveryLabel[selected.box_delivery_status] }}</p>
          </div>
          <button type="button" @click="closeDrawer">关闭</button>
        </header>

        <form class="postage-order-drawer__body" @submit.prevent="saveDraft">
          <section class="postage-order-editor-section">
            <h3>基本信息</h3>
            <div class="postage-order-editor-grid">
              <label><span>订单状态</span><select v-model="draft.status"><option v-for="[value, label] in STATUS_OPTIONS.filter(([value]) => value)" :key="value" :value="value">{{ label }}</option></select></label>
              <label><span>送箱状态</span><select v-model="draft.box_delivery_status"><option v-for="[value, label] in BOX_DELIVERY_OPTIONS.filter(([value]) => value)" :key="value" :value="value">{{ label }}</option></select></label>
              <label><span>付款状态</span><select v-model="draft.payment_status"><option v-for="[value, label] in PAYMENT_OPTIONS.filter(([value]) => value)" :key="value" :value="value">{{ label }}</option></select></label>
              <label><span>负责人</span><input v-model="draft.assigned_to"></label>
            </div>
          </section>

          <section class="postage-order-editor-section">
            <h3>用户信息</h3>
            <div class="postage-order-editor-grid">
              <label><span>姓名</span><input v-model="draft.customer_name"></label>
              <label><span>微信</span><input v-model="draft.wechat_id"></label>
              <label><span>电话</span><input v-model="draft.phone"></label>
              <label><span>邮箱</span><input v-model="draft.email"></label>
            </div>
          </section>

          <section class="postage-order-editor-section">
            <h3>邮寄需求</h3>
            <div class="postage-order-editor-grid">
              <label><span>服务类型</span><input v-model="draft.service_type"></label>
              <label><span>预期路线</span><input v-model="draft.preferred_route"></label>
              <label><span>预计箱数</span><input v-model.number="draft.box_count" type="number" min="1"></label>
              <label><span>预计单箱重量</span><input v-model="draft.single_box_weight" type="number" min="0" step="0.1"></label>
              <label><span>纸箱型号</span><input v-model="draft.box_type" placeholder="2号箱子不可用"></label>
              <label><span>包装材料</span><input v-model="draft.packing_materials"></label>
              <label class="postage-order-check"><input v-model="draft.need_boxes" type="checkbox"><span>需要纸箱</span></label>
              <label class="postage-order-check"><input v-model="draft.need_packing_materials" type="checkbox"><span>需要包装材料</span></label>
              <label class="postage-order-check"><input v-model="draft.has_sensitive_items" type="checkbox"><span>敏感品 / 需客服确认</span></label>
              <label class="postage-order-editor-wide"><span>物品类型</span><input v-model="itemTypesText" placeholder="用顿号或逗号分隔"></label>
              <label class="postage-order-editor-wide"><span>用户备注</span><textarea v-model="draft.user_note" rows="2"></textarea></label>
            </div>
          </section>

          <section class="postage-order-editor-section">
            <h3>送箱信息</h3>
            <div class="postage-order-editor-grid">
              <label class="postage-order-check"><input v-model="draft.need_box_delivery" type="checkbox"><span>需要送箱</span></label>
              <label class="postage-order-check"><input v-model="draft.box_delivery_same_as_pickup" type="checkbox"><span>送箱地址与取件地址相同</span></label>
              <label><span>送箱日期</span><input v-model="draft.preferred_box_delivery_date" type="date"></label>
              <label><span>送箱时间段</span><input v-model="draft.preferred_box_delivery_time_slot"></label>
              <label><span>送箱公寓</span><input v-model="draft.box_delivery_building"></label>
              <label><span>送箱房间</span><input v-model="draft.box_delivery_room"></label>
              <label><span>送箱 Postcode</span><input v-model="draft.box_delivery_postcode"></label>
              <label class="postage-order-editor-wide"><span>送箱地址</span><textarea v-model="draft.box_delivery_address" rows="2"></textarea></label>
              <label class="postage-order-check"><input v-model="draft.box_delivery_need_upstairs" type="checkbox"><span>上楼送箱</span></label>
              <label class="postage-order-check"><input v-model="draft.box_delivery_has_lift" type="checkbox"><span>有电梯</span></label>
              <label class="postage-order-editor-wide"><span>送箱备注</span><textarea v-model="draft.box_delivery_note" rows="2"></textarea></label>
            </div>
          </section>

          <section class="postage-order-editor-section">
            <h3>取件和收件信息</h3>
            <div class="postage-order-editor-grid">
              <label class="postage-order-check"><input v-model="draft.need_pickup" type="checkbox"><span>需要取件</span></label>
              <label><span>取件日期</span><input v-model="draft.preferred_pickup_date" type="date"></label>
              <label><span>取件时间段</span><input v-model="draft.preferred_pickup_time_slot"></label>
              <label><span>取件公寓</span><input v-model="draft.pickup_building"></label>
              <label><span>取件房间</span><input v-model="draft.pickup_room"></label>
              <label><span>取件 Postcode</span><input v-model="draft.pickup_postcode"></label>
              <label class="postage-order-editor-wide"><span>取件地址</span><textarea v-model="draft.pickup_address" rows="2"></textarea></label>
              <label class="postage-order-check"><input v-model="draft.pickup_need_upstairs" type="checkbox"><span>上楼取件</span></label>
              <label class="postage-order-check"><input v-model="draft.pickup_has_lift" type="checkbox"><span>有电梯</span></label>
              <label><span>收件国家/地区</span><input v-model="draft.recipient_country"></label>
              <label><span>收件城市</span><input v-model="draft.recipient_city"></label>
              <label><span>收件人</span><input v-model="draft.recipient_name"></label>
              <label><span>收件电话</span><input v-model="draft.recipient_phone"></label>
              <label class="postage-order-editor-wide"><span>收件地址</span><textarea v-model="draft.recipient_address" rows="2"></textarea></label>
            </div>
          </section>

          <section class="postage-order-editor-section">
            <h3>称重、费用、付款、物流</h3>
            <div class="postage-order-editor-grid">
              <label><span>实际箱数</span><input v-model="draft.actual_box_count" type="number" min="0"></label>
              <label class="postage-order-editor-wide"><span>实际重量说明</span><textarea v-model="draft.actual_weight_note" rows="2"></textarea></label>
              <label><span>最终路线</span><input v-model="draft.final_route"></label>
              <label><span>最终邮费</span><input v-model.number="draft.final_postage" type="number" step="0.01"></label>
              <label><span>纸箱费用</span><input v-model.number="draft.final_box_fee" type="number" step="0.01"></label>
              <label><span>包装材料费用</span><input v-model.number="draft.final_packing_fee" type="number" step="0.01"></label>
              <label><span>送箱费用</span><input v-model.number="draft.box_delivery_fee" type="number" step="0.01"></label>
              <label><span>上楼送箱费</span><input v-model.number="draft.box_delivery_upstairs_fee" type="number" step="0.01"></label>
              <label><span>上楼取件费</span><input v-model.number="draft.pickup_upstairs_fee" type="number" step="0.01"></label>
              <label><span>其他费用</span><input v-model.number="draft.other_fee" type="number" step="0.01"></label>
              <label><span>折扣</span><input v-model.number="draft.discount" type="number" step="0.01"></label>
              <label><span>最终合计</span><input v-model.number="draft.final_total" type="number" step="0.01"></label>
              <label><span>付款时间</span><input v-model="draft.paid_at" type="datetime-local"></label>
              <label><span>付款方式</span><input v-model="draft.payment_method"></label>
              <label><span>承运商</span><input v-model="draft.carrier"></label>
              <label><span>物流单号</span><input v-model="draft.tracking_number"></label>
              <label><span>发货日期</span><input v-model="draft.shipped_at" type="date"></label>
              <label class="postage-order-editor-wide"><span>查询链接</span><input v-model="draft.tracking_url"></label>
              <label class="postage-order-editor-wide"><span>费用备注</span><textarea v-model="draft.fee_note" rows="2"></textarea></label>
              <label class="postage-order-editor-wide"><span>付款备注</span><textarea v-model="draft.payment_note" rows="2"></textarea></label>
              <label class="postage-order-editor-wide"><span>物流备注</span><textarea v-model="draft.logistics_note" rows="2"></textarea></label>
            </div>
          </section>

          <section class="postage-order-editor-section">
            <h3>内部备注和操作记录</h3>
            <label><span>内部备注</span><textarea v-model="draft.internal_note" rows="4"></textarea></label>
            <div class="postage-order-log-list">
              <p v-if="!selected.logs?.length">暂无操作记录</p>
              <article v-for="log in selected.logs || []" :key="log.id">
                <strong>{{ log.operator_name || "System" }}</strong>
                <span>{{ log.action }} · {{ formatDateTime(log.created_at) }}</span>
              </article>
            </div>
          </section>

          <footer class="postage-order-drawer__footer">
            <button type="submit" :disabled="saving">{{ saving ? "保存中..." : "保存工单" }}</button>
            <button type="button" @click="copySummary(selected)">复制摘要</button>
            <button type="button" @click="closeDrawer">关闭</button>
          </footer>
        </form>
      </aside>
    </div>
  </div>
</template>
