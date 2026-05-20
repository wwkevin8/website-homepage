<script setup>
import { computed, onMounted, ref } from "vue";
import LoadingState from "@/components/LoadingState.vue";
import { fetchDashboard } from "@/api/admin-api";

const loading = ref(false);
const error = ref("");
const dashboard = ref(null);

const kpiDefinitions = [
  {
    key: "transport_requests_pending",
    label: "待登记接送机",
    subtitle: "点击查看未登记接送机",
    icon: "记",
    tone: "blue",
    href: "/admin-vue/orders?risk=offline_unrecorded&source_table=transport_requests"
  },
  {
    key: "storage_orders_pending",
    label: "待登记寄存",
    subtitle: "点击查看未登记寄存",
    icon: "箱",
    tone: "amber",
    href: "/admin-vue/orders?risk=offline_unrecorded&source_table=storage_orders"
  },
  {
    key: "unregistered_orders_total",
    label: "未登记总订单",
    subtitle: "接送机与寄存未登记汇总",
    icon: "!",
    tone: "rose",
    href: "/admin-vue/orders?offline_recorded=false"
  },
  {
    key: "total_users",
    label: "用户总数",
    subtitle: "站点注册用户",
    icon: "人",
    tone: "violet",
    href: "/admin-vue/users"
  },
  {
    key: "daily_inspection_runs_total",
    label: "今日巡检总次数",
    subtitle: "接送机与寄存巡检运行",
    icon: "巡",
    tone: "cyan"
  },
  {
    key: "daily_inspection_anomalies_total",
    label: "今日巡检异常数",
    subtitle: "同步巡检发现的异常",
    icon: "!",
    tone: "rose"
  }
];

const quickLinks = [
  { label: "查看全部接送机订单", href: "/admin-vue/transport/requests" },
  { label: "查看全部寄存订单", href: "/admin-vue/storage/orders" },
  { label: "查看买箱订单", href: "/admin-vue/storage/box-orders" },
  { label: "查看异常订单", href: "/admin-vue/orders?risk=overdue_unprocessed" },
  { label: "查看同步/巡检日志", href: "/admin-vue/storage/sync-logs" },
  { label: "会员权益管理", href: "/admin-vue/memberships" }
];

const cards = computed(() => dashboard.value?.cards || {});
const trends = computed(() => dashboard.value?.trends || []);
const statusDistribution = computed(() => dashboard.value?.status_distribution || []);
const todayTodos = computed(() => dashboard.value?.today_todos || []);
const riskAlerts = computed(() => dashboard.value?.risk_alerts || []);
const recentOperations = computed(() => dashboard.value?.recent_operations || []);
const cache = computed(() => dashboard.value?.cache || null);

const trendMax = computed(() => {
  const max = Math.max(...trends.value.map(item => Number(item.total || 0)), 0);
  return max > 0 ? max : 1;
});

const statusTotal = computed(() => statusDistribution.value.reduce((sum, item) => sum + Number(item.value || 0), 0));

const donutStyle = computed(() => {
  if (!statusTotal.value) {
    return { background: "#e5e7eb" };
  }
  const colors = {
    warning: "#f59e0b",
    info: "#3b82f6",
    success: "#10b981"
  };
  let cursor = 0;
  const stops = statusDistribution.value.map(item => {
    const value = Number(item.value || 0);
    const start = cursor;
    cursor += (value / statusTotal.value) * 100;
    const color = colors[item.tone] || "#94a3b8";
    return `${color} ${start}% ${cursor}%`;
  });
  return { background: `conic-gradient(${stops.join(", ")})` };
});

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("zh-CN") : "0";
}

function formatDateTime(value) {
  if (!value) return "暂无时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/London",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatDate(value) {
  if (!value) return "暂无日期";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/London",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function trendHeight(value) {
  return `${Math.max(8, Math.round((Number(value || 0) / trendMax.value) * 100))}%`;
}

async function loadDashboard() {
  loading.value = true;
  error.value = "";
  try {
    dashboard.value = await fetchDashboard();
  } catch (err) {
    error.value = err.status === 401
      ? "登录已过期，请返回登录页重新登录。"
      : (err.message || "Dashboard 加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <section class="dashboard-view dashboard-workbench">
    <div class="dashboard-hero">
      <div>
        <p class="view-heading__eyebrow">2.0 NGN 管理后台</p>
        <h2>业务驾驶舱</h2>
        <p>聚合接送机、寄存、订单风险和客服操作状态。</p>
      </div>
      <button type="button" class="secondary-button" :disabled="loading" @click="loadDashboard">
        {{ loading ? "刷新中" : "刷新" }}
      </button>
    </div>

    <LoadingState v-if="loading && !dashboard">正在加载控制台数据...</LoadingState>

    <div v-else-if="error" class="admin-alert admin-alert--error">
      {{ error }}
    </div>

    <template v-else>
      <div class="dashboard-kpis">
        <component
          v-for="item in kpiDefinitions"
          :key="item.key"
          :is="item.href ? 'a' : 'div'"
          class="dashboard-kpi-card"
          :class="`dashboard-kpi-card--${item.tone}`"
          :href="item.href"
        >
          <span class="dashboard-kpi-card__icon">{{ item.icon }}</span>
          <div>
            <p>{{ item.label }}</p>
            <strong>{{ formatNumber(cards[item.key]) }}</strong>
            <small>{{ item.subtitle }}</small>
          </div>
        </component>
      </div>

      <div class="dashboard-panel-grid dashboard-panel-grid--charts">
        <article class="dashboard-panel dashboard-panel--wide">
          <div class="dashboard-panel__heading">
            <div>
              <h3>最近 7 天订单趋势</h3>
              <p>按提交时间统计接送机、寄存和买箱订单。</p>
            </div>
          </div>
          <div v-if="trends.length" class="dashboard-trend-chart">
            <div v-for="item in trends" :key="item.date" class="dashboard-trend-day">
              <div class="dashboard-trend-bars">
                <span class="dashboard-trend-bar dashboard-trend-bar--transport" :style="{ height: trendHeight(item.transport) }" title="接送机"></span>
                <span class="dashboard-trend-bar dashboard-trend-bar--storage" :style="{ height: trendHeight(item.storage) }" title="寄存"></span>
                <span class="dashboard-trend-bar dashboard-trend-bar--box" :style="{ height: trendHeight(item.box) }" title="买箱"></span>
              </div>
              <strong>{{ item.total }}</strong>
              <small>{{ item.label }}</small>
            </div>
          </div>
          <div v-else class="dashboard-empty">暂无趋势数据</div>
          <div class="dashboard-chart-legend">
            <span><i class="legend-dot legend-dot--transport"></i>接送机</span>
            <span><i class="legend-dot legend-dot--storage"></i>寄存</span>
            <span><i class="legend-dot legend-dot--box"></i>买箱</span>
          </div>
        </article>

        <article class="dashboard-panel">
          <div class="dashboard-panel__heading">
            <div>
              <h3>订单状态分布</h3>
              <p>按客服登记状态统计，仅区分已登记和未登记。</p>
            </div>
          </div>
          <div class="dashboard-donut-wrap">
            <div class="dashboard-donut" :style="donutStyle">
              <span>{{ formatNumber(statusTotal) }}</span>
              <small>订单</small>
            </div>
            <ul class="dashboard-status-list">
              <li v-for="item in statusDistribution" :key="item.key">
                <span><i :class="`legend-dot legend-dot--${item.tone}`"></i>{{ item.label }}</span>
                <strong>{{ formatNumber(item.value) }}</strong>
              </li>
            </ul>
          </div>
        </article>
      </div>

      <div class="dashboard-panel-grid">
        <article class="dashboard-panel">
          <div class="dashboard-panel__heading">
            <div>
              <h3>今日待处理事项</h3>
              <p>包含今日服务和超过 24 小时未登记事项。</p>
            </div>
          </div>
          <div v-if="todayTodos.length" class="dashboard-task-list">
            <a v-for="item in todayTodos" :key="`${item.type}-${item.id}`" :href="item.href" class="dashboard-task-row">
              <span :class="`dashboard-task-row__type dashboard-task-row__type--${item.type}`">{{ item.title }}</span>
              <div>
                <strong>{{ item.order_no || "未生成编号" }}</strong>
                <small>{{ item.customer || "暂无客户名" }} · {{ formatDateTime(item.due_at) }}</small>
              </div>
            </a>
          </div>
          <div v-else class="dashboard-empty">暂无今日待办</div>
        </article>

        <article class="dashboard-panel">
          <div class="dashboard-panel__heading">
            <div>
              <h3>风险 / 异常提醒</h3>
              <p>点击后进入订单中心，并自动筛选对应订单。</p>
            </div>
          </div>
          <div class="dashboard-risk-list">
            <a v-for="item in riskAlerts" :key="item.key" :href="item.href" class="dashboard-risk-card">
              <div>
                <span>{{ item.label }}</span>
                <small>{{ item.helper }}</small>
              </div>
              <strong>{{ formatNumber(item.value) }}</strong>
            </a>
          </div>
        </article>
      </div>

      <article class="dashboard-panel">
        <div class="dashboard-panel__heading">
          <div>
            <h3>最近操作日志</h3>
            <p>帮助客服判断上次是谁处理、处理了什么。</p>
          </div>
        </div>
        <div v-if="recentOperations.length" class="dashboard-log-table-wrap">
          <table class="dashboard-log-table">
            <thead>
              <tr>
                <th>操作时间</th>
                <th>操作人</th>
                <th>操作对象</th>
                <th>操作类型</th>
                <th>订单编号</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in recentOperations" :key="item.id">
                <td>{{ formatDateTime(item.time) }}</td>
                <td>{{ item.operator }}</td>
                <td>{{ item.target }}</td>
                <td>{{ item.action }}</td>
                <td>{{ item.order_no || "暂无" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="dashboard-empty">暂无最近操作日志</div>
      </article>

      <article class="dashboard-panel dashboard-quick-panel">
        <div class="dashboard-panel__heading">
          <div>
            <h3>快捷入口</h3>
            <p>常用客服和巡检入口。</p>
          </div>
        </div>
        <div class="dashboard-quick-links">
          <a v-for="item in quickLinks" :key="item.href" :href="item.href">{{ item.label }}</a>
        </div>
        <p v-if="cache" class="dashboard-cache-note">
          Cache: {{ cache.hit ? "hit" : "miss" }} · TTL {{ cache.ttl_ms || 0 }}ms · 数据时间 {{ formatDate(dashboard?.generated_at) }}
        </p>
      </article>
    </template>
  </section>
</template>
