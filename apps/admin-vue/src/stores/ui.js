import { ref } from "vue";
import { defineStore } from "pinia";

const SIDEBAR_COLLAPSED_KEY = "ngn-admin-sidebar-collapsed";

function readStoredSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export const useUiStore = defineStore("ui", () => {
  const sidebarCollapsed = ref(readStoredSidebarCollapsed());
  const mobileSidebarOpen = ref(false);
  const pageTitle = ref("Dashboard");
  const toastMessage = ref("");

  function setPageTitle(title) {
    pageTitle.value = title || "Dashboard";
  }

  function setSidebarCollapsed(value) {
    sidebarCollapsed.value = Boolean(value);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed.value ? "true" : "false");
      } catch {
        // Keep the UI responsive even if browser storage is unavailable.
      }
    }
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed(!sidebarCollapsed.value);
  }

  function openMobileSidebar() {
    mobileSidebarOpen.value = true;
  }

  function closeMobileSidebar() {
    mobileSidebarOpen.value = false;
  }

  function showToast(message) {
    toastMessage.value = String(message || "");
    if (toastMessage.value) {
      window.setTimeout(() => {
        toastMessage.value = "";
      }, 3000);
    }
  }

  return {
    sidebarCollapsed,
    mobileSidebarOpen,
    pageTitle,
    toastMessage,
    setPageTitle,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    openMobileSidebar,
    closeMobileSidebar,
    showToast
  };
});
