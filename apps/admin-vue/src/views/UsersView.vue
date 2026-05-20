<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchUsers } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const columns = [
  { key: "public_user_id", label: "User ID", width: "11%" },
  { key: "email", label: "邮箱", width: "21%" },
  { key: "nickname", label: "昵称", width: "10%" },
  { key: "phone", label: "手机号", width: "11%" },
  { key: "first_login_at", label: "首次登录", width: "12%" },
  { key: "last_login_at", label: "最近登录", width: "12%" },
  { key: "last_login_provider", label: "登录方式", width: "9%" },
  { key: "login_count", label: "登录次数", width: "6%", className: "is-number" },
  { key: "actions", label: "操作", width: "96px", className: "is-actions", sticky: "end" }
];

const filters = reactive({
  search: "",
  provider: "",
  pageSize: 20
});

const users = ref([]);
const pagination = ref({ page: 1, page_size: 20, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const detailNotice = ref("");

const hasUsers = computed(() => users.value.length > 0);

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
    return value;
  }
}

function providerLabel(provider) {
  const normalized = String(provider || "").trim().toLowerCase();
  if (!normalized) {
    return "未记录";
  }
  if (normalized === "google") {
    return "Google";
  }
  if (normalized === "password") {
    return "密码登录";
  }
  return normalized;
}

function providerTone(provider) {
  return provider ? "success" : "neutral";
}

async function loadUsers(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  detailNotice.value = "";
  try {
    const payload = await fetchUsers({
      search: filters.search.trim(),
      provider: filters.provider,
      page,
      page_size: filters.pageSize
    });
    users.value = Array.isArray(payload?.items) ? payload.items : [];
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: users.value.length,
      total_pages: users.value.length ? 1 : 0
    };
  } catch (err) {
    users.value = [];
    error.value = err.message || "用户列表加载失败";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadUsers(1);
}

function resetFilters() {
  filters.search = "";
  filters.provider = "";
  filters.pageSize = 20;
  loadUsers(1);
}

function handlePageChange(page) {
  loadUsers(page);
}

function viewUser(row) {
  detailNotice.value = `详情功能将在后续阶段实现：${displayValue(row.public_user_id || row.email || row.id)}`;
}

onMounted(() => {
  loadUsers(1);
});
</script>

<template>
  <section class="users-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 2 foundation</p>
        <h2>用户管理</h2>
      </div>

    </div>

    <form class="admin-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field">
        <span>关键词</span>
        <input v-model="filters.search" type="search" placeholder="User ID / 邮箱 / 昵称 / 手机号" />
      </label>
      <label class="field">
        <span>登录方式</span>
        <select v-model="filters.provider">
          <option value="">全部</option>
          <option value="google">Google</option>
          <option value="password">密码登录</option>
        </select>
      </label>
      <label class="field field--compact">
        <span>每页</span>
        <select v-model.number="filters.pageSize" @change="loadUsers(1)">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
      <div class="filter-actions">
        <button class="primary-button" type="submit">查询</button>
        <button class="secondary-button" type="reset">重置</button>
      </div>
    </form>

    <p v-if="detailNotice" class="inline-notice">{{ detailNotice }}</p>

    <LoadingState v-if="loading">正在加载用户列表...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasUsers" title="暂无符合条件的用户" description="请调整关键词或登录方式后重试。" />
    <template v-else>
      <AdminTable :columns="columns" :rows="users">
        <template #cell-public_user_id="{ row }">
          <strong class="cell-truncate" :title="displayValue(row.public_user_id)">
            {{ displayValue(row.public_user_id) }}
          </strong>
        </template>
        <template #cell-email="{ row }">
          <span class="cell-truncate" :title="displayValue(row.email)">{{ displayValue(row.email) }}</span>
        </template>
        <template #cell-nickname="{ row }">
          <span class="cell-truncate" :title="displayValue(row.nickname)">{{ displayValue(row.nickname) }}</span>
        </template>
        <template #cell-phone="{ row }">
          <span class="cell-truncate" :title="displayValue(row.phone)">{{ displayValue(row.phone) }}</span>
        </template>
        <template #cell-first_login_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.first_login_at)">
            {{ formatDateTime(row.first_login_at) }}
          </span>
        </template>
        <template #cell-last_login_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.last_login_at)">
            {{ formatDateTime(row.last_login_at) }}
          </span>
        </template>
        <template #cell-last_login_provider="{ row }">
          <StatusBadge :tone="providerTone(row.last_login_provider)">
            {{ providerLabel(row.last_login_provider) }}
          </StatusBadge>
        </template>
        <template #cell-login_count="{ row }">
          {{ Number(row.login_count || 0) }}
        </template>
        <template #cell-actions="{ row }">
          <button class="table-action-button" type="button" @click="viewUser(row)">查看详情</button>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
