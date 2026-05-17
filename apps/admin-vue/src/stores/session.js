import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { fetchAdminSession, logoutAdmin } from "@/api/admin-api";

export const useSessionStore = defineStore("session", () => {
  const session = ref(null);
  const admin = ref(null);
  const permissions = ref({});
  const loading = ref(false);
  const error = ref("");
  let sessionPromise = null;

  const isAuthenticated = computed(() => Boolean(session.value?.authenticated && session.value?.is_admin));

  function applySession(nextSession) {
    session.value = nextSession || null;
    admin.value = nextSession?.admin || null;
    permissions.value = nextSession?.permissions || {};
  }

  async function ensureSession(options = {}) {
    if (!options.refresh && session.value) {
      return session.value;
    }
    if (sessionPromise) {
      return sessionPromise;
    }

    loading.value = true;
    error.value = "";
    sessionPromise = fetchAdminSession()
      .then(nextSession => {
        applySession(nextSession);
        return nextSession;
      })
      .catch(err => {
        applySession(null);
        error.value = err.message || "Session check failed";
        throw err;
      })
      .finally(() => {
        loading.value = false;
        sessionPromise = null;
      });

    return sessionPromise;
  }

  async function logout() {
    await logoutAdmin().catch(() => {});
    applySession(null);
    window.location.href = "/admin-login.html";
  }

  return {
    session,
    admin,
    permissions,
    loading,
    error,
    isAuthenticated,
    ensureSession,
    logout
  };
});
