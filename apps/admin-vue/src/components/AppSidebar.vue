<script setup>
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "@/stores/session";

const sections = [
  {
    id: "main",
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
    id: "transport",
    title: "接送机拼车管理",
    links: [
      { label: "登记接送机订单", route: { name: "transport-requests" } },
      { label: "拼车组管理", route: { name: "transport-groups" } },
      { label: "同步巡检日志", route: { name: "transport-sync-logs" } },
    ],
  },
  {
    id: "storage",
    title: "寄存管理",
    links: [
      { label: "全部订单", route: { name: "storage-all-orders" } },
      { label: "买箱订单", route: { name: "storage-box-orders" } },
      { label: "取寄存订单", route: { name: "storage-collections" } },
      { label: "送寄存订单", route: { name: "storage-returns" } },
      { label: "寄存同步巡检日志", route: { name: "storage-sync-logs" } },
    ],
  },
];

const route = useRoute();
const sessionStore = useSessionStore();
const collapsedSections = ref({});

const adminLabel = computed(() => {
  const admin = sessionStore.admin;
  return admin?.name || admin?.username || admin?.email || "Admin";
});

const activeRouteNames = computed(() => {
  const names = route.matched.map((item) => item.name).filter(Boolean);
  if (route.name) {
    names.push(route.name);
  }
  return new Set(names);
});

function isSectionActive(section) {
  return section.links.some((link) => link.route?.name && activeRouteNames.value.has(link.route.name));
}

function isSectionOpen(section) {
  return collapsedSections.value[section.id] !== true;
}

function toggleSection(section) {
  collapsedSections.value = {
    ...collapsedSections.value,
    [section.id]: isSectionOpen(section),
  };
}
</script>

<template>
  <aside class="admin-sidebar" aria-label="Vue admin navigation">
    <div class="admin-sidebar__brand">
      <span class="admin-sidebar__mark">NGN</span>
      <span>2.0 NGN 管理后台</span>
    </div>
    <nav class="admin-sidebar__nav">
      <section
        v-for="section in sections"
        :key="section.title"
        class="admin-sidebar__section"
        :class="{ 'is-active': isSectionActive(section), 'is-collapsed': !isSectionOpen(section) }"
      >
        <button
          class="admin-sidebar__section-toggle"
          type="button"
          :aria-expanded="isSectionOpen(section) ? 'true' : 'false'"
          :aria-controls="`admin-sidebar-section-${section.id}`"
          @click="toggleSection(section)"
        >
          <span>{{ section.title }}</span>
          <span class="admin-sidebar__chevron" aria-hidden="true"></span>
        </button>
        <div
          v-show="isSectionOpen(section)"
          :id="`admin-sidebar-section-${section.id}`"
          class="admin-sidebar__section-links"
        >
          <template v-for="link in section.links" :key="link.label">
            <RouterLink v-if="link.route" class="admin-sidebar__link" :to="link.route">
              <span class="admin-sidebar__label">{{ link.label }}</span>
            </RouterLink>
          </template>
        </div>
      </section>
    </nav>
    <div class="admin-sidebar__account">
      <span>{{ adminLabel }}</span>
      <button type="button" @click="sessionStore.logout()">退出登录</button>
    </div>
  </aside>
</template>
