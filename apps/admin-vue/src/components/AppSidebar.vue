<script setup>
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

const sections = [
  {
    id: "main",
    title: "后台",
    icon: "B",
    links: [
      { label: "控制台", icon: "D", route: { name: "dashboard" } },
      { label: "订单中心", icon: "O", route: { name: "orders" } },
      { label: "用户管理", icon: "U", route: { name: "users" } },
      { label: "会员权益", icon: "M", route: { name: "memberships" } },
      { label: "社区管理", icon: "C", route: { name: "community" } },
      { label: "管理员管理", icon: "A", route: { name: "managers" } },
    ],
  },
  {
    id: "transport",
    title: "接送机拼车管理",
    icon: "T",
    links: [
      { label: "登记接送机订单", icon: "R", route: { name: "transport-requests" } },
      { label: "拼车组管理", icon: "G", route: { name: "transport-groups" } },
      { label: "同步巡检日志", icon: "L", route: { name: "transport-sync-logs" } },
    ],
  },
  {
    id: "storage",
    title: "寄存管理",
    icon: "S",
    links: [
      { label: "全部订单", icon: "A", route: { name: "storage-all-orders" } },
      { label: "当天工单", icon: "D", route: { name: "storage-today-work-orders" } },
      { label: "买箱订单", icon: "B", route: { name: "storage-box-orders" } },
      { label: "取寄存订单", icon: "P", route: { name: "storage-collections" } },
      { label: "送寄存订单", icon: "S", route: { name: "storage-returns" } },
      { label: "寄存同步巡检日志", icon: "L", route: { name: "storage-sync-logs" } },
    ],
  },
];

const route = useRoute();
const sessionStore = useSessionStore();
const uiStore = useUiStore();
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
  <aside
    class="admin-sidebar"
    :class="{ 'is-compact': uiStore.sidebarCollapsed }"
    aria-label="Vue admin navigation"
  >
    <div class="admin-sidebar__brand">
      <span class="admin-sidebar__mark">NGN</span>
      <span class="admin-sidebar__brand-text">2.0 NGN 管理后台</span>
      <button
        class="admin-sidebar__collapse-button"
        type="button"
        :aria-label="uiStore.sidebarCollapsed ? '展开左侧菜单' : '折叠左侧菜单'"
        :title="uiStore.sidebarCollapsed ? '展开左侧菜单' : '折叠左侧菜单'"
        @click="uiStore.toggleSidebarCollapsed()"
      >
        <span aria-hidden="true"></span>
      </button>
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
          :title="uiStore.sidebarCollapsed ? section.title : null"
          @click="toggleSection(section)"
        >
          <span class="admin-sidebar__icon" aria-hidden="true">{{ section.icon }}</span>
          <span class="admin-sidebar__section-title-text">{{ section.title }}</span>
          <span class="admin-sidebar__chevron" aria-hidden="true"></span>
        </button>
        <div
          v-show="isSectionOpen(section)"
          :id="`admin-sidebar-section-${section.id}`"
          class="admin-sidebar__section-links"
        >
          <template v-for="link in section.links" :key="link.label">
            <RouterLink
              v-if="link.route"
              class="admin-sidebar__link"
              :to="link.route"
              :title="uiStore.sidebarCollapsed ? link.label : null"
              @click="uiStore.closeMobileSidebar()"
            >
              <span class="admin-sidebar__icon admin-sidebar__link-icon" aria-hidden="true">{{ link.icon }}</span>
              <span class="admin-sidebar__label">{{ link.label }}</span>
            </RouterLink>
          </template>
        </div>
      </section>
    </nav>
    <div class="admin-sidebar__account">
      <span class="admin-sidebar__account-icon" :title="adminLabel" aria-hidden="true">U</span>
      <span class="admin-sidebar__account-name">{{ adminLabel }}</span>
      <button
        type="button"
        :title="uiStore.sidebarCollapsed ? '退出登录' : null"
        :aria-label="uiStore.sidebarCollapsed ? '退出登录' : null"
        @click="sessionStore.logout()"
      >
        <span class="admin-sidebar__logout-icon" aria-hidden="true">Q</span>
        <span class="admin-sidebar__logout-text">退出登录</span>
      </button>
    </div>
  </aside>
</template>
