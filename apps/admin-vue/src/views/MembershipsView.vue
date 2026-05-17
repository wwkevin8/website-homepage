<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchMembershipCodes, fetchMemberships } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const CURRENT_CYCLE = "2026-27";

const membershipColumns = [
  { key: "user", label: "用户", width: "15%" },
  { key: "contact", label: "联系方式", width: "17%" },
  { key: "membership_cycle", label: "会员周期", width: "9%" },
  { key: "status", label: "会员状态", width: "10%" },
  { key: "benefit_type", label: "权益类型", width: "10%" },
  { key: "linked_order_no", label: "关联订单号", width: "12%" },
  { key: "advisor", label: "所属顾问", width: "10%" },
  { key: "created_at", label: "创建时间", width: "10%" },
  { key: "actions", label: "操作", width: "210px", className: "is-actions", sticky: "end" }
];

const codeColumns = [
  { key: "code_prefix", label: "激活码前缀", width: "15%" },
  { key: "membership_cycle", label: "会员周期", width: "12%" },
  { key: "status", label: "状态", width: "12%" },
  { key: "generated_by_admin", label: "创建管理员", width: "15%" },
  { key: "redeemed_by_user", label: "兑换用户", width: "18%" },
  { key: "redeemed_at", label: "兑换时间", width: "13%" },
  { key: "created_at", label: "创建时间", width: "13%" },
  { key: "actions", label: "操作", width: "110px", className: "is-actions", sticky: "end" }
];

const filters = reactive({
  search: "",
  cycle: CURRENT_CYCLE,
  status: "",
  benefitType: "",
  pageSize: 10
});

const codeFilters = reactive({
  search: "",
  cycle: CURRENT_CYCLE,
  status: "",
  pageSize: 10
});

const memberships = ref([]);
const membershipPagination = ref({ page: 1, page_size: filters.pageSize, total: 0, total_pages: 0 });
const membershipLoading = ref(false);
const membershipError = ref("");
const codes = ref([]);
const codePagination = ref({ page: 1, page_size: codeFilters.pageSize, total: 0, total_pages: 0 });
const codeLoading = ref(false);
const codeError = ref("");
const notice = ref("");

const hasMemberships = computed(() => memberships.value.length > 0);
const hasCodes = computed(() => codes.value.length > 0);

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

function userLabel(user) {
  if (!user) {
    return "--";
  }
  return user.nickname || user.name || user.public_user_id || user.email || user.phone || "--";
}

function contactLabel(user) {
  if (!user) {
    return "--";
  }
  return [user.email, user.phone, user.wechat_id].filter(Boolean).join(" / ") || "--";
}

function adminLabel(admin) {
  if (!admin) {
    return "--";
  }
  return admin.name || admin.username || admin.email || "--";
}

function benefitLabel(type) {
  const labels = {
    storage: "寄存",
    pickup: "接机",
    moving: "搬家",
    welcome_pack: "新生大礼包",
    cashback: "返现/人工备注",
    manual: "人工记录"
  };
  return labels[type] || displayValue(type);
}

function statusLabel(status) {
  const labels = {
    active: "有效 / 未使用",
    redeemed: "已兑换",
    revoked: "已作废",
    expired: "已过期",
    selected: "已选择",
    reserved: "已绑定订单",
    used: "已使用",
    cancelled: "已作废",
    manual: "人工记录"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "active" || status === "used" || status === "redeemed") {
    return "success";
  }
  if (status === "selected" || status === "reserved" || status === "manual") {
    return "warning";
  }
  if (status === "cancelled" || status === "revoked" || status === "expired") {
    return "danger";
  }
  return "neutral";
}

function membershipStatus(item) {
  return item.claim?.status || item.status || "";
}

function actionSubject(item) {
  if (item.code_prefix) {
    return item.code_prefix;
  }
  if (item.user || item.redeemed_by_user) {
    return userLabel(item.user || item.redeemed_by_user);
  }
  if (item.id) {
    return item.id;
  }
  return userLabel(item.user || item.redeemed_by_user) || item.code_prefix || item.id || "当前记录";
}

function showPlaceholder(action, item = {}) {
  notice.value = `${action}将在后续阶段实现：${displayValue(actionSubject(item))}`;
}

function buildMembershipQuery(page) {
  const selectedStatus = filters.status;
  const claimStatuses = ["selected", "reserved", "used", "manual", "cancelled"];
  return {
    page,
    page_size: filters.pageSize,
    search: filters.search.trim(),
    cycle: filters.cycle.trim() || CURRENT_CYCLE,
    status: selectedStatus === "expired" ? "expired" : selectedStatus === "unused" ? "active" : "",
    benefit_type: filters.benefitType,
    claim_status: claimStatuses.includes(selectedStatus) ? selectedStatus : "",
    display_status: selectedStatus
  };
}

function buildCodeQuery(page) {
  return {
    page,
    page_size: codeFilters.pageSize,
    search: codeFilters.search.trim(),
    cycle: codeFilters.cycle.trim() || CURRENT_CYCLE,
    status: codeFilters.status
  };
}

async function loadMemberships(page = membershipPagination.value.page || 1) {
  membershipLoading.value = true;
  membershipError.value = "";
  notice.value = "";
  try {
    const payload = await fetchMemberships(buildMembershipQuery(page));
    memberships.value = Array.isArray(payload?.items) ? payload.items : [];
    membershipPagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: memberships.value.length,
      total_pages: memberships.value.length ? 1 : 0
    };
  } catch (err) {
    memberships.value = [];
    membershipError.value = err.message || "会员权益列表加载失败";
  } finally {
    membershipLoading.value = false;
  }
}

async function loadCodes(page = codePagination.value.page || 1) {
  codeLoading.value = true;
  codeError.value = "";
  try {
    const payload = await fetchMembershipCodes(buildCodeQuery(page));
    codes.value = Array.isArray(payload?.items) ? payload.items : [];
    codePagination.value = payload?.pagination || {
      page,
      page_size: codeFilters.pageSize,
      total: codes.value.length,
      total_pages: codes.value.length ? 1 : 0
    };
  } catch (err) {
    codes.value = [];
    codeError.value = err.message || "会员激活码列表加载失败";
  } finally {
    codeLoading.value = false;
  }
}

function submitMembershipFilters() {
  loadMemberships(1);
}

function resetMembershipFilters() {
  Object.assign(filters, {
    search: "",
    cycle: CURRENT_CYCLE,
    status: "",
    benefitType: "",
    pageSize: 10
  });
  loadMemberships(1);
}

function submitCodeFilters() {
  loadCodes(1);
}

function resetCodeFilters() {
  Object.assign(codeFilters, {
    search: "",
    cycle: CURRENT_CYCLE,
    status: "",
    pageSize: 10
  });
  loadCodes(1);
}

onMounted(() => {
  loadMemberships(1);
  loadCodes(1);
});
</script>

<template>
  <section class="memberships-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Readonly membership migration</p>
        <h2>会员权益</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" @click="showPlaceholder('开通会员', { id: '会员用户' })">开通会员</button>
        <button class="secondary-button" type="button" @click="showPlaceholder('生成激活码', { id: CURRENT_CYCLE })">生成激活码</button>
        <a class="secondary-button" href="/admin-memberships.html">打开旧会员后台</a>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>会员列表</h3>
          <p>只读查看会员资格、权益选择、关联订单和顾问信息。</p>
        </div>
      </div>

      <form class="admin-filter-panel membership-filter-panel" @submit.prevent="submitMembershipFilters" @reset.prevent="resetMembershipFilters">
        <label class="field membership-filter-panel__search">
          <span>会员搜索</span>
          <input v-model="filters.search" type="search" placeholder="姓名 / 邮箱 / 手机号 / 微信" />
        </label>
        <label class="field">
          <span>会员周期</span>
          <input v-model="filters.cycle" type="text" />
        </label>
        <label class="field">
          <span>会员状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="unused">有效 / 未使用</option>
            <option value="selected">已选择</option>
            <option value="reserved">已绑定订单</option>
            <option value="used">已使用</option>
            <option value="manual">人工记录</option>
            <option value="cancelled">已作废</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <label class="field">
          <span>权益类型</span>
          <select v-model="filters.benefitType">
            <option value="">全部</option>
            <option value="storage">寄存</option>
            <option value="pickup">接机</option>
            <option value="moving">搬家</option>
            <option value="welcome_pack">新生大礼包</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>每页</span>
          <select v-model.number="filters.pageSize" @change="loadMemberships(1)">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
        <div class="filter-actions membership-filter-panel__actions">
          <button class="primary-button" type="submit">刷新列表</button>
          <button class="secondary-button" type="reset">重置</button>
        </div>
      </form>

      <LoadingState v-if="membershipLoading">正在加载会员权益数据...</LoadingState>
      <ErrorState v-else-if="membershipError" :message="membershipError" />
      <EmptyState v-else-if="!hasMemberships" title="暂无会员数据" description="可以调整搜索、周期、状态或权益类型后重试。" />
      <template v-else>
        <AdminTable :columns="membershipColumns" :rows="memberships">
          <template #cell-user="{ row }">
            <strong class="cell-truncate" :title="userLabel(row.user)">{{ userLabel(row.user) }}</strong>
          </template>
          <template #cell-contact="{ row }">
            <span class="cell-truncate" :title="contactLabel(row.user)">{{ contactLabel(row.user) }}</span>
          </template>
          <template #cell-membership_cycle="{ row }">
            <span class="cell-truncate">{{ displayValue(row.membership_cycle) }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(membershipStatus(row))">{{ statusLabel(membershipStatus(row)) }}</StatusBadge>
          </template>
          <template #cell-benefit_type="{ row }">
            <span class="cell-truncate" :title="benefitLabel(row.claim?.benefit_type)">{{ benefitLabel(row.claim?.benefit_type) }}</span>
          </template>
          <template #cell-linked_order_no="{ row }">
            <span class="cell-truncate" :title="displayValue(row.claim?.linked_order_no)">{{ displayValue(row.claim?.linked_order_no) }}</span>
          </template>
          <template #cell-advisor="{ row }">
            <span class="cell-truncate" :title="adminLabel(row.advisor)">{{ adminLabel(row.advisor) }}</span>
          </template>
          <template #cell-created_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <div class="table-action-group table-action-group--compact">
              <button class="table-action-button" type="button" @click="showPlaceholder('登记权益', row)">登记权益</button>
              <button class="table-action-button" type="button" @click="showPlaceholder('权益详情', row)">权益详情</button>
              <button class="table-action-button" type="button" @click="showPlaceholder('操作记录', row)">操作记录</button>
              <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除会员资格', row)">删除</button>
            </div>
          </template>
        </AdminTable>
        <Pagination :pagination="membershipPagination" @change="loadMemberships" />
      </template>
    </section>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>一次性会员激活码</h3>
          <p>只读查看激活码前缀、状态、创建人和兑换记录。</p>
        </div>
        <button class="secondary-button" type="button" @click="showPlaceholder('生成激活码', { id: codeFilters.cycle })">生成激活码</button>
      </div>

      <form class="admin-filter-panel membership-code-filter-panel" @submit.prevent="submitCodeFilters" @reset.prevent="resetCodeFilters">
        <label class="field membership-code-filter-panel__search">
          <span>搜索激活码</span>
          <input v-model="codeFilters.search" type="search" placeholder="激活码前缀 / 邮箱 / 手机号 / 订单参考" />
        </label>
        <label class="field">
          <span>会员周期</span>
          <input v-model="codeFilters.cycle" type="text" />
        </label>
        <label class="field">
          <span>状态</span>
          <select v-model="codeFilters.status">
            <option value="">全部</option>
            <option value="active">有效</option>
            <option value="redeemed">已兑换</option>
            <option value="revoked">已作废</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>每页</span>
          <select v-model.number="codeFilters.pageSize" @change="loadCodes(1)">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
        <div class="filter-actions membership-code-filter-panel__actions">
          <button class="primary-button" type="submit">搜索</button>
          <button class="secondary-button" type="reset">重置</button>
        </div>
      </form>

      <LoadingState v-if="codeLoading">正在加载会员激活码...</LoadingState>
      <ErrorState v-else-if="codeError" :message="codeError" />
      <EmptyState v-else-if="!hasCodes" title="暂无会员激活码" description="可以调整周期、状态或激活码前缀后重试。" />
      <template v-else>
        <AdminTable :columns="codeColumns" :rows="codes">
          <template #cell-code_prefix="{ row }">
            <strong class="cell-truncate" :title="displayValue(row.code_prefix)">{{ displayValue(row.code_prefix) }}</strong>
          </template>
          <template #cell-membership_cycle="{ row }">
            <span class="cell-truncate">{{ displayValue(row.membership_cycle) }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
          </template>
          <template #cell-generated_by_admin="{ row }">
            <span class="cell-truncate" :title="adminLabel(row.generated_by_admin)">{{ adminLabel(row.generated_by_admin) }}</span>
          </template>
          <template #cell-redeemed_by_user="{ row }">
            <span class="cell-truncate" :title="userLabel(row.redeemed_by_user)">{{ userLabel(row.redeemed_by_user) }}</span>
          </template>
          <template #cell-redeemed_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.redeemed_at)">{{ formatDateTime(row.redeemed_at) }}</span>
          </template>
          <template #cell-created_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除激活码', row)">
              删除
            </button>
          </template>
        </AdminTable>
        <Pagination :pagination="codePagination" @change="loadCodes" />
      </template>
    </section>
  </section>
</template>
