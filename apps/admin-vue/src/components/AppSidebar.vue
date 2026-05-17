<script setup>
const sections = [
  {
    title: "后台",
    links: [
      { label: "控制台", route: { name: "dashboard" } },
      { label: "订单中心", route: { name: "orders" } },
      { label: "用户管理", route: { name: "users" } },
      { label: "会员权益", route: { name: "memberships" } },
      { label: "社区管理", route: { name: "community" } },
      { label: "管理员管理", route: { name: "managers" } },
    ],
  },
  {
    title: "接送机拼车管理",
    links: [
      { label: "登记接送机订单", route: { name: "transport-requests" } },
      { label: "拼车组管理", route: { name: "transport-groups" } },
      { label: "同步巡检日志", route: { name: "transport-sync-logs" } },
    ],
  },
  {
    title: "寄存管理",
    links: [
      { label: "买箱订单", route: { name: "storage-box-orders" } },
      { label: "取寄存订单", route: { name: "storage-collections" } },
      { label: "送寄存订单", route: { name: "storage-returns" } },
    ],
  },
];
</script>

<template>
  <aside class="admin-sidebar" aria-label="Vue admin navigation">
    <div class="admin-sidebar__brand">
      <span class="admin-sidebar__mark">NGN</span>
      <span>Vue Admin</span>
    </div>
    <nav class="admin-sidebar__nav">
      <section v-for="section in sections" :key="section.title" class="admin-sidebar__section">
        <h2 class="admin-sidebar__section-title">{{ section.title }}</h2>
        <div class="admin-sidebar__section-links">
          <template v-for="link in section.links" :key="link.label">
            <RouterLink v-if="link.route" class="admin-sidebar__link" :to="link.route">
              <span class="admin-sidebar__label">{{ link.label }}</span>
            </RouterLink>
            <a v-else class="admin-sidebar__link admin-sidebar__link--legacy" :href="link.href">
              <span class="admin-sidebar__label">{{ link.label }}</span>
              <span v-if="link.legacy" class="admin-sidebar__badge">旧版</span>
            </a>
          </template>
        </div>
      </section>
      <a class="admin-sidebar__link admin-sidebar__legacy-home" href="/admin-dashboard.html">
        <span class="admin-sidebar__label">返回旧后台</span>
        <span class="admin-sidebar__badge">旧版</span>
      </a>
    </nav>
  </aside>
</template>
