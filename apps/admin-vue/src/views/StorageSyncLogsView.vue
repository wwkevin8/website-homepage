<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchStorageSyncLogs, runStorageSyncAudit } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const columns = [
  { key: "checked_at", label: "巡检时间", width: "14%" },
  { key: "sampled_order_count", label: "抽查订单", width: "9%", className: "is-number" },
  { key: "checked_order_center_count", label: "订单中心", width: "10%", className: "is-number" },
  { key: "checked_user_order_count", label: "个人中心", width: "10%", className: "is-number" },
  { key: "mismatch_count", label: "异常数", width: "8%", className: "is-number" },
  { key: "skipped_check_count", label: "跳过数", width: "8%", className: "is-number" },
  { key: "result", label: "结果", width: "10%" },
  { key: "details", label: "详情", width: "31%" }
];

const defaultFilters = {
  mismatchOnly: "",
  pageSize: 20
};

const filters = reactive({ ...defaultFilters });
const logs = ref([]);
const pagination = ref({ page: 1, page_size: defaultFilters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const running = ref(false);
const error = ref("");
const notice = ref("");
const storageReady = ref(true);

const hasLogs = computed(() => logs.value.length > 0);

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatDateTime(value) {
  if (!value) return "--";
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
  if (!items.length) return emptyText;
  if (items.length <= 3) return items.join(" / ");
  return `${items.slice(0, 3).join(" / ")} 等 ${items.length} 项`;
}

function mismatchLine(item) {
  if (!item || typeof item !== "object") return displayValue(item);
  const parts = [
    item.order_no ? `订单 ${item.order_no}` : "",
    [item.surface, item.field].filter(Boolean).join(" / "),
    `期望 ${displayValue(item.expected)}`,
    `实际 ${displayValue(item.actual)}`
  ].filter(Boolean);
  return parts.join("，");
}

function skippedReason(item) {
  const reason = String(item?.reason || "").trim();
  if (reason === "no_site_user_id") return "该订单没有绑定注册用户，跳过个人中心校验";
  return reason || "--";
}

function skippedLine(item) {
  if (!item || typeof item !== "object") return displayValue(item);
  const parts = [
    item.order_no ? `订单 ${item.order_no}` : "",
    item.surface,
    skippedReason(item)
  ].filter(Boolean);
  return parts.join("，");
}

function detailCount(log) {
  return asArray(log.sampled_order_nos).length
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
    const payload = await fetchStorageSyncLogs(buildQuery(page));
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
    error.value = err.message || "寄存同步巡检日志加载失败";
  } finally {
    loading.value = false;
  }
}

async function runAudit() {
  if (running.value) return;
  running.value = true;
  notice.value = "";
  error.value = "";
  try {
    const report = await runStorageSyncAudit();
    if (report?.storage?.stored === false) {
      storageReady.value = false;
      notice.value = "巡检已完成，但日志表尚未启用，结果没有写入数据库。";
      return;
    }
    notice.value = `巡检完成：抽查 ${numberValue(report?.sampled_order_count)} 单，异常 ${numberValue(report?.mismatch_count)} 个，跳过 ${numberValue(report?.skipped_check_count)} 项。`;
    await loadLogs(1);
  } catch (err) {
    notice.value = err.message || "手动巡检失败。";
  } finally {
    running.value = false;
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
  <section class="storage-sync-logs-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Storage sync audit</p>
        <h2>寄存同步巡检日志</h2>
      </div>
      <div class="view-heading__actions">
        <button class="primary-button" type="button" :disabled="running" @click="runAudit">
          {{ running ? "巡检中..." : "手动巡检一次" }}
        </button>
      </div>
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

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <LoadingState v-if="loading">正在加载寄存同步巡检日志...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState
      v-else-if="!storageReady"
      title="日志表尚未启用"
      description="请先执行寄存同步巡检日志表的 Supabase SQL，再回来查看记录。"
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
        <template #cell-sampled_order_count="{ row }">{{ numberValue(row.sampled_order_count) }}</template>
        <template #cell-checked_order_center_count="{ row }">{{ numberValue(row.checked_order_center_count) }}</template>
        <template #cell-checked_user_order_count="{ row }">{{ numberValue(row.checked_user_order_count) }}</template>
        <template #cell-mismatch_count="{ row }">{{ numberValue(row.mismatch_count) }}</template>
        <template #cell-skipped_check_count="{ row }">{{ numberValue(row.skipped_check_count) }}</template>
        <template #cell-result="{ row }">
          <StatusBadge :tone="numberValue(row.mismatch_count) > 0 ? 'warning' : 'success'">
            {{ numberValue(row.mismatch_count) > 0 ? "发现异常" : "正常" }}
          </StatusBadge>
        </template>
        <template #cell-details="{ row }">
          <details class="sync-log-details">
            <summary>{{ detailCount(row) > 0 ? `查看摘要（${detailCount(row)} 项）` : "无详情" }}</summary>
            <div class="sync-log-details__grid">
              <section>
                <strong>抽查订单号</strong>
                <p :title="listSummary(row.sampled_order_nos)">{{ listSummary(row.sampled_order_nos) }}</p>
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
                <strong>跳过项</strong>
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
