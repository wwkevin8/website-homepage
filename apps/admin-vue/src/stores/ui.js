import { ref } from "vue";
import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", () => {
  const sidebarOpen = ref(true);
  const pageTitle = ref("Dashboard");
  const toastMessage = ref("");

  function setPageTitle(title) {
    pageTitle.value = title || "Dashboard";
  }

  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
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
    sidebarOpen,
    pageTitle,
    toastMessage,
    setPageTitle,
    toggleSidebar,
    showToast
  };
});
