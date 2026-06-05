<script setup>
import { onMounted, onUnmounted } from "vue";
import AppSidebar from "@/components/AppSidebar.vue";
import { useUiStore } from "@/stores/ui";

const uiStore = useUiStore();

onMounted(() => {
  document.body.classList.add("admin-mobile-density-active");
});

onUnmounted(() => {
  document.body.classList.remove("admin-mobile-density-active");
});
</script>

<template>
  <div
    class="admin-shell"
    :class="{
      'is-sidebar-collapsed': uiStore.sidebarCollapsed,
      'is-mobile-sidebar-open': uiStore.mobileSidebarOpen,
    }"
  >
    <button
      class="admin-mobile-menu-button"
      type="button"
      aria-label="打开管理后台菜单"
      @click="uiStore.openMobileSidebar()"
    >
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
    </button>
    <button
      class="admin-sidebar-overlay"
      type="button"
      aria-label="关闭管理后台菜单"
      @click="uiStore.closeMobileSidebar()"
    ></button>
    <AppSidebar />
    <div class="admin-shell__body">
      <main class="admin-shell__main admin-mobile-density">
        <RouterView />
      </main>
    </div>
  </div>
</template>
