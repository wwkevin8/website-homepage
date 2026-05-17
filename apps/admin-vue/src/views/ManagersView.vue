<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchManagers } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const columns = [
  { key: "name", label: "姓名", width: "13%" },
  { key: "username", label: "账号", width: "13%" },
  { key: "email", label: "邮箱", width: "19%" },
  { key: "phone", label: "手机号", width: "12%" },
  { key: "role", label: "角色", width: "12%" },
  { key: "created_at", label: "创建时间", width: "13%" },
  { key: "last_login_at", label: "最近登录时间", width: "13%" },
  { key: "actions", label: "操作", width: "190px", className: "is-actions", sticky: "end" }
];

const filters = reactive({
  keyword: "",
  role: "",
  pageSize: 20
});

const managers = ref([]);
const pagination = ref({ page: 1, page_size: 20, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const actionNotice = ref("");

const hasManagers = computed(() => managers.value.length > 0);

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

function roleLabel(role) {
  if (role === "super_admin") {
    return "超级管理员";
  }
  if (role === "operations_admin") {
    return "运营管理员";
  }
  return displayValue(role);
}

function roleTone(role) {
  return role === "super_admin" ? "success" : "neutral";
}

async function loadManagers(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  actionNotice.value = "";
  try {
    const payload = await fetchManagers({
      keyword: filters.keyword.trim(),
      role: filters.role,
      page,
      page_size: filters.pageSize
    });
    managers.value = Array.isArray(payload?.items) ? payload.items : [];
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: managers.value.length,
      total_pages: managers.value.length ? 1 : 0
    };
  } catch (err) {
    managers.value = [];
    error.value = err.message || "管理员列表加载失败";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadManagers(1);
}

function resetFilters() {
  filters.keyword = "";
  filters.role = "";
  filters.pageSize = 20;
  loadManagers(1);
}

function handlePageChange(page) {
  loadManagers(page);
}

function showActionNotice(action, manager) {
  actionNotice.value = `${action}功能将在后续阶段实现：${displayValue(manager.name || manager.username || manager.email || manager.id)}`;
}

onMounted(() => {
  loadManagers(1);
});
</script>

<template>
  <section class="managers-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 4 list migration</p>
        <h2>管理员管理</h2>
      </div>
      <a class="secondary-button" href="/admin-managers.html">打开旧管理员后台</a>
    </div>

    <form class="admin-filter-panel manager-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field">
        <span>关键词</span>
        <input v-model="filters.keyword" type="search" placeholder="姓名 / 账号 / 邮箱 / 手机号" />
      </label>
      <label class="field">
        <span>角色</span>
        <select v-model="filters.role">
          <option value="">全部</option>
          <option value="super_admin">超级管理员</option>
          <option value="operations_admin">运营管理员</option>
        </select>
      </label>
      <label class="field field--compact">
        <span>每页</span>
        <select v-model.number="filters.pageSize" @change="loadManagers(1)">
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

    <p v-if="actionNotice" class="inline-notice">{{ actionNotice }}</p>

    <LoadingState v-if="loading">正在加载管理员列表...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!hasManagers" title="暂无符合条件的管理员" description="请调整关键词或角色筛选后重试。" />
    <template v-else>
      <AdminTable :columns="columns" :rows="managers">
        <template #cell-name="{ row }">
          <strong class="cell-truncate" :title="displayValue(row.name)">{{ displayValue(row.name) }}</strong>
        </template>
        <template #cell-username="{ row }">
          <span class="cell-truncate" :title="displayValue(row.username)">{{ displayValue(row.username) }}</span>
        </template>
        <template #cell-email="{ row }">
          <span class="cell-truncate" :title="displayValue(row.email)">{{ displayValue(row.email) }}</span>
        </template>
        <template #cell-phone="{ row }">
          <span class="cell-truncate" :title="displayValue(row.phone)">{{ displayValue(row.phone) }}</span>
        </template>
        <template #cell-role="{ row }">
          <StatusBadge :tone="roleTone(row.role)">
            {{ roleLabel(row.role) }}
          </StatusBadge>
        </template>
        <template #cell-created_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
        </template>
        <template #cell-last_login_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.last_login_at)">{{ formatDateTime(row.last_login_at) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group">
            <button class="table-action-button" type="button" @click="showActionNotice('编辑', row)">编辑</button>
            <button class="table-action-button" type="button" @click="showActionNotice('重置密码', row)">重置密码</button>
            <button class="table-action-button table-action-button--danger" type="button" @click="showActionNotice('删除账号', row)">删除账号</button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
