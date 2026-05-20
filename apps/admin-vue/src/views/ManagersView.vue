<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { createManager, deleteManager, fetchManagers, resetManagerPassword, updateManager } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { useSessionStore } from "@/stores/session";

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
const actionError = ref("");
const actionLoading = ref(false);
const editOpen = ref(false);
const editMode = ref("edit");
const selectedManager = ref(null);
const pendingAction = ref(null);
const generatedPassword = ref("");
const sessionStore = useSessionStore();

const editForm = reactive({
  name: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  role: "operations_admin",
  status: "active"
});

const hasManagers = computed(() => managers.value.length > 0);
const currentAdmin = computed(() => sessionStore.admin || {});
const isRootManager = computed(() => normalizeEmail(currentAdmin.value.email) === "haoranw44@gmail.com");
const canEditUsername = computed(() => isRootManager.value);
const isCreateMode = computed(() => editMode.value === "create");
const confirmDialog = computed(() => {
  if (!pendingAction.value || !selectedManager.value) {
    return null;
  }
  const name = displayValue(selectedManager.value.username || selectedManager.value.name || selectedManager.value.email);
  if (pendingAction.value === "delete") {
    return {
      title: "确认删除管理员账号",
      confirmLabel: "确认删除",
      tone: "danger",
      body: `删除后，${name} 将无法继续登录后台，且该账号会从管理员列表中移除。`
    };
  }
  return {
    title: "确认重置密码",
    confirmLabel: "确认重置",
    tone: "danger",
    body: `系统将为 ${name} 生成新的临时密码。请在操作后立即转交给对应管理员。`
  };
});

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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

function managerName(manager) {
  return displayValue(manager?.name || manager?.username || manager?.email || manager?.id);
}

function isCurrentAdmin(manager) {
  return Boolean(manager?.id && currentAdmin.value?.id && manager.id === currentAdmin.value.id);
}

function deleteDisabledReason(manager) {
  if (isCurrentAdmin(manager)) {
    return "当前账号不能删除自己";
  }
  if (manager?.role === "super_admin" && !isRootManager.value) {
    return "只有 Wkevin 可以删除其他超级管理员";
  }
  return "";
}

function resetDisabledReason(manager) {
  return isCurrentAdmin(manager) ? "不能重置当前登录账号的密码" : "";
}

async function loadManagers(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  actionNotice.value = "";
  actionError.value = "";
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

function resetEditForm(manager = null) {
  editForm.name = manager?.name || "";
  editForm.username = manager?.username || "";
  editForm.email = manager?.email || "";
  editForm.phone = manager?.phone || "";
  editForm.password = "";
  editForm.role = manager?.role || "operations_admin";
  editForm.status = manager?.status || "active";
}

function openCreate() {
  selectedManager.value = null;
  editMode.value = "create";
  resetEditForm();
  actionNotice.value = "";
  actionError.value = "";
  editOpen.value = true;
}

function openEdit(manager) {
  selectedManager.value = manager;
  editMode.value = "edit";
  resetEditForm(manager);
  actionNotice.value = "";
  actionError.value = "";
  editOpen.value = true;
}

function closeEdit() {
  if (actionLoading.value) {
    return;
  }
  editOpen.value = false;
}

async function submitEdit() {
  if (!isCreateMode.value && !selectedManager.value?.id) {
    return;
  }
  if (isCreateMode.value && !editForm.password.trim()) {
    actionError.value = "新增管理员必须设置初始密码";
    return;
  }
  actionLoading.value = true;
  actionNotice.value = "";
  actionError.value = "";
  try {
    const payload = {
      name: editForm.name,
      username: editForm.username,
      email: editForm.email,
      phone: editForm.phone,
      password: editForm.password,
      role: editForm.role,
      status: editForm.status
    };
    if (isCreateMode.value) {
      const result = await createManager(payload);
      const created = result?.manager || payload;
      editOpen.value = false;
      await loadManagers(1);
      actionNotice.value = `${managerName(created)} 已创建`;
      return;
    }
    await updateManager(selectedManager.value.id, payload);
    const savedName = managerName(selectedManager.value);
    editOpen.value = false;
    await loadManagers(pagination.value.page || 1);
    actionNotice.value = `${savedName} 已保存`;
  } catch (err) {
    actionError.value = err.message || (isCreateMode.value ? "管理员创建失败" : "管理员信息保存失败");
  } finally {
    actionLoading.value = false;
  }
}

function openConfirm(action, manager) {
  const disabledReason = action === "delete" ? deleteDisabledReason(manager) : resetDisabledReason(manager);
  if (disabledReason) {
    actionError.value = disabledReason;
    actionNotice.value = "";
    return;
  }
  selectedManager.value = manager;
  pendingAction.value = action;
  generatedPassword.value = "";
  actionNotice.value = "";
  actionError.value = "";
}

function closeConfirm() {
  if (actionLoading.value) {
    return;
  }
  pendingAction.value = null;
}

async function confirmAction() {
  if (!selectedManager.value?.id || !pendingAction.value) {
    return;
  }
  actionLoading.value = true;
  actionNotice.value = "";
  actionError.value = "";
  try {
    const targetName = managerName(selectedManager.value);
    if (pendingAction.value === "delete") {
      await deleteManager(selectedManager.value.id);
      pendingAction.value = null;
      await loadManagers(pagination.value.page || 1);
      actionNotice.value = `${targetName} 已删除`;
      return;
    }
    const result = await resetManagerPassword(selectedManager.value.id);
    generatedPassword.value = result?.temporary_password || "";
    actionNotice.value = generatedPassword.value
      ? `${targetName} 的临时密码：${generatedPassword.value}`
      : `${targetName} 的密码已重置`;
    pendingAction.value = null;
  } catch (err) {
    actionError.value = err.message || "操作失败";
  } finally {
    actionLoading.value = false;
  }
}

onMounted(() => {
  sessionStore.ensureSession().catch(() => {});
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
      <div class="view-heading__actions">
        <button class="primary-button" type="button" @click="openCreate">新增管理员</button>
      </div>
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
    <p v-if="actionError" class="inline-notice inline-notice--error">{{ actionError }}</p>

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
            <button class="table-action-button" type="button" @click="openEdit(row)">编辑</button>
            <button
              class="table-action-button"
              type="button"
              :disabled="Boolean(resetDisabledReason(row))"
              :title="resetDisabledReason(row)"
              @click="openConfirm('reset', row)"
            >
              重置密码
            </button>
            <button
              class="table-action-button table-action-button--danger"
              type="button"
              :disabled="Boolean(deleteDisabledReason(row))"
              :title="deleteDisabledReason(row)"
              @click="openConfirm('delete', row)"
            >
              删除账号
            </button>
          </div>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>

    <Teleport to="body">
      <div v-if="editOpen" class="membership-modal">
        <div class="membership-modal__backdrop" aria-hidden="true" @click="closeEdit"></div>
        <section class="membership-modal__panel" role="dialog" aria-modal="true" :aria-label="isCreateMode ? '新增管理员' : '编辑管理员'">
          <header class="membership-modal__header">
            <div>
              <h3>{{ isCreateMode ? "新增管理员" : "编辑管理员" }}</h3>
              <p v-if="isCreateMode">创建后台管理员账号，初始密码必填，保存后不会再显示明文。</p>
              <p v-else>{{ canEditUsername ? "可修改姓名、账号、邮箱、手机号、角色和状态；当前密码不可查看，只能留空不改或设置新密码。" : "可修改姓名、邮箱、手机号、角色和状态；当前密码不可查看，只能留空不改或设置新密码。" }}</p>
            </div>
            <button class="secondary-button" type="button" :disabled="actionLoading" @click="closeEdit">关闭</button>
          </header>

          <form class="admin-filter-panel manager-edit-form" @submit.prevent="submitEdit">
            <label class="field">
              <span>姓名</span>
              <input v-model.trim="editForm.name" type="text" required />
            </label>
            <label class="field">
              <span>账号</span>
              <input v-model.trim="editForm.username" type="text" required :disabled="!isCreateMode && !canEditUsername" />
            </label>
            <label class="field">
              <span>邮箱</span>
              <input v-model.trim="editForm.email" type="email" />
            </label>
            <label class="field">
              <span>手机号</span>
              <input v-model.trim="editForm.phone" type="tel" />
            </label>
            <label class="field manager-edit-form__wide">
              <span>{{ isCreateMode ? "初始密码" : "设置新密码" }}</span>
              <input
                v-model.trim="editForm.password"
                type="password"
                autocomplete="new-password"
                minlength="8"
                :required="isCreateMode"
                :placeholder="isCreateMode ? '至少 8 位初始密码' : '当前密码不可查看；留空不修改，填写则设置新密码'"
              />
            </label>
            <label class="field">
              <span>角色</span>
              <select v-model="editForm.role">
                <option value="operations_admin">运营管理员</option>
                <option value="super_admin">超级管理员</option>
              </select>
            </label>
            <label class="field">
              <span>状态</span>
              <select v-model="editForm.status">
                <option value="active">启用</option>
                <option value="disabled">停用</option>
              </select>
            </label>
            <p v-if="actionError" class="inline-notice inline-notice--error manager-edit-form__message">{{ actionError }}</p>
            <div class="filter-actions manager-edit-form__actions">
              <button class="secondary-button" type="button" :disabled="actionLoading" @click="closeEdit">取消</button>
              <button class="primary-button" type="submit" :disabled="actionLoading">
                {{ actionLoading ? "保存中..." : "保存" }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Teleport>

    <ConfirmDialog
      v-if="confirmDialog"
      :open="Boolean(confirmDialog)"
      :title="confirmDialog.title"
      :confirm-label="confirmDialog.confirmLabel"
      :tone="confirmDialog.tone"
      :loading="actionLoading"
      cancel-label="取消"
      @cancel="closeConfirm"
      @confirm="confirmAction"
    >
      <p class="confirm-dialog__warning">{{ confirmDialog.body }}</p>
    </ConfirmDialog>
  </section>
</template>
