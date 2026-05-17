<script setup>
import { onMounted, ref } from "vue";
import LoadingState from "@/components/LoadingState.vue";
import { fetchDashboard } from "@/api/admin-api";

const loading = ref(false);
const error = ref("");
const cards = ref(null);
const cache = ref(null);

const cardDefinitions = [
  ["transport_requests_pending", "待处理接送机"],
  ["storage_orders_pending", "待确认寄存"],
  ["transport_requests_total", "接送机总数"],
  ["active_orders_total", "活跃订单"],
  ["total_users", "用户总数"],
  ["active_admins", "管理员"],
  ["logins_last_7_days", "7日登录"],
  ["archived_orders_total", "归档订单"]
];

async function loadDashboard() {
  loading.value = true;
  error.value = "";
  try {
    const result = await fetchDashboard();
    cards.value = result?.cards || {};
    cache.value = result?.cache || null;
  } catch (err) {
    error.value = err.status === 401
      ? "登录已过期，请返回旧登录页重新登录。"
      : (err.message || "Dashboard 加载失败");
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <section class="dashboard-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Phase 1 skeleton</p>
        <h2>后台概览</h2>
      </div>
      <button type="button" class="secondary-button" @click="loadDashboard">刷新</button>
    </div>

    <LoadingState v-if="loading">Loading dashboard...</LoadingState>

    <div v-else-if="error" class="admin-alert admin-alert--error">
      {{ error }}
    </div>

    <template v-else>
      <div class="dashboard-grid">
        <article v-for="[key, label] in cardDefinitions" :key="key" class="metric-card">
          <span>{{ label }}</span>
          <strong>{{ cards?.[key] ?? 0 }}</strong>
        </article>
      </div>
      <p class="dashboard-cache-note" v-if="cache">
        Cache: {{ cache.hit ? "hit" : "miss" }} · TTL {{ cache.ttl_ms || 0 }}ms
      </p>
    </template>
  </section>
</template>
