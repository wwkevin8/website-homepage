<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchTransportSyncLogs } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const columns = [
  { key: "checked_at", label: "巡检时间", width: "14%" },
  { key: "sampled_group_count", label: "抽查组数", width: "9%", className: "is-number" },
  { key: "checked_request_count", label: "个人中心订单数", width: "12%", className: "is-number" },
  { key: "mismatch_count", label: "异常数", width: "8%", className: "is-number" },
  { key: "skipped_check_count", label: "跳过数", width: "8%", className: "is-number" },
  { key: "result", label: "结果", width: "10%" },
  { key: "details", label: "详情", width: "39%" }
];

const defaultFilters = {
  mismatchOnly: "",
  pageSize: 20
};

const filters = reactive({ ...defaultFilters });
const logs = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");
const storageReady = ref(true);

const hasLogs = computed(() => logs.value.length > 0);

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
      second: "2-digit",
      hour12: false
    }).format(new Date(value));
  } catch (err) {
    return displayValue(value);
  }
}

function numberValue(value) {
  const nextValue = Number(value ?? 0);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function listSummary(value, emptyText = "无") {
  const items = asArray(value).map(item => displayValue(item)).filter(item => item !== "--");
  if (!items.length) {
    return emptyText;
  }
  if (items.length <= 3) {
    return items.join(" / ");
  }
  return `${items.slice(0, 3).join(" / ")} 等 ${items.length} 项`;
}

function mismatchLine(item) {
  if (!item || typeof item !== "object") {
    return displayValue(item);
  }
  const parts = [
    item.group_id,
    [item.surface, item.field].filter(Boolean).join(" / "),
    item.order_no ? `订单 ${item.order_no}` : "",
    `期望 ${displayValue(item.expected)}`,
    `实际 ${displayValue(item.actual)}`
  ].filter(Boolean);
  return parts.join("，");
}

function skippedReason(item) {
  const reason = String(item?.reason || "").trim();
  if (reason === "no_site_user_linked_member") {
    return "该组没有可用于个人中心校验的注册用户成员";
  }
  if (reason === "order_not_in_recent_personal_center_list") {
    return "该组样本订单未出现在对应用户的个人中心最近记录里";
  }
  return reason || "--";
}

function skippedLine(item) {
  if (!item || typeof item !== "object") {
    return displayValue(item);
  }
  const parts = [
    item.group_id,
    item.surface,
    skippedReason(item),
    item.order_no ? `订单 ${item.order_no}` : ""
  ].filter(Boolean);
  return parts.join("，");
}

function detailCount(log) {
  return asArray(log.sampled_group_ids).length
    + asArray(log.checked_order_nos).length
    + asArray(log.mismatches).length
    + asArray(log.skipped_checks).length;
}

function buildQuery(page) {
  return {
    page,
    page_size: filters.pageSize,
    mismatch_only: filters.mismatchOnly
  };
}

async function loadLogs(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  try {
    const payload = await fetchTransportSyncLogs(buildQuery(page));
    logs.value = Array.isArray(payload?.items) ? payload.items : [];
    storageReady.value = payload?.storage?.ready !== false;
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: logs.value.length,
      total_pages: logs.value.length ? 1 : 0
    };
  } catch (err) {
    logs.value = [];
    storageReady.value = true;
    error.value = err.message || "同步巡检日志加载失败";
  } finally {
    loading.value = false;
  }
}

function submitFilters() {
  loadLogs(1);
}

function resetFilters() {
  Object.assign(filters, defaultFilters);
  loadLogs(1);
}

function handlePageChange(page) {
  loadLogs(page);
}

onMounted(() => {
  loadLogs(1);
});
</script>

<template>
  <section class="transport-sync-logs-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Transport sync audit</p>
        <h2>同步巡检日志</h2>
      </div>
      <a class="secondary-button" href="/transport-admin-sync-logs.html">打开旧同步日志后台</a>
    </div>

    <form class="admin-filter-panel sync-log-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
      <label class="field">
        <span>日志范围</span>
        <select v-model="filters.mismatchOnly">
          <option value="">全部日志</option>
          <option value="true">仅看异常</option>
        </select>
      </label>
      <label class="field field--compact">
        <span>每页</span>
        <select v-model.number="filters.pageSize">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
      </label>
      <div class="filter-actions">
        <button class="primary-button" type="submit">筛选</button>
        <button class="secondary-button" type="reset">重置</button>
      </div>
    </form>

    <LoadingState v-if="loading">正在加载同步巡检日志...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState
      v-else-if="!storageReady"
      title="日志表尚未启用"
      description="请先执行同步巡检日志表的 Supabase SQL，再回来查看记录。"
    />
    <EmptyState
      v-else-if="!hasLogs"
      title="暂无巡检日志"
      description="当前筛选条件下没有可显示的记录。"
    />
    <template v-else>
      <AdminTable :columns="columns" :rows="logs" row-key="checked_at">
        <template #cell-checked_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.checked_at)">{{ formatDateTime(row.checked_at) }}</span>
        </template>
        <template #cell-sampled_group_count="{ row }">
          {{ numberValue(row.sampled_group_count) }}
        </template>
        <template #cell-checked_request_count="{ row }">
          {{ numberValue(row.checked_request_count) }}
        </template>
        <template #cell-mismatch_count="{ row }">
          {{ numberValue(row.mismatch_count) }}
        </template>
        <template #cell-skipped_check_count="{ row }">
          {{ numberValue(row.skipped_check_count) }}
        </template>
        <template #cell-result="{ row }">
          <StatusBadge :tone="numberValue(row.mismatch_count) > 0 ? 'warning' : 'success'">
            {{ numberValue(row.mismatch_count) > 0 ? "发现异常" : "正常" }}
          </StatusBadge>
        </template>
        <template #cell-details="{ row }">
          <details class="sync-log-details">
            <summary>
              {{ detailCount(row) > 0 ? `查看摘要（${detailCount(row)} 项）` : "无详情" }}
            </summary>
            <div class="sync-log-details__grid">
              <section>
                <strong>抽查 Group ID</strong>
                <p :title="listSummary(row.sampled_group_ids)">{{ listSummary(row.sampled_group_ids) }}</p>
              </section>
              <section>
                <strong>校验订单号</strong>
                <p :title="listSummary(row.checked_order_nos)">{{ listSummary(row.checked_order_nos) }}</p>
              </section>
              <section>
                <strong>异常明细</strong>
                <p v-if="!asArray(row.mismatches).length">无</p>
                <ul v-else>
                  <li v-for="(item, index) in asArray(row.mismatches).slice(0, 5)" :key="`mismatch-${row.checked_at}-${index}`">
                    {{ mismatchLine(item) }}
                  </li>
                </ul>
              </section>
              <section>
                <strong>跳过明细</strong>
                <p v-if="!asArray(row.skipped_checks).length">无</p>
                <ul v-else>
                  <li v-for="(item, index) in asArray(row.skipped_checks).slice(0, 5)" :key="`skipped-${row.checked_at}-${index}`">
                    {{ skippedLine(item) }}
                  </li>
                </ul>
              </section>
            </div>
          </details>
        </template>
      </AdminTable>
      <Pagination :pagination="pagination" @change="handlePageChange" />
    </template>
  </section>
</template>
