<script setup>
import { computed } from "vue";
import { useSessionStore } from "@/stores/session";

const sessionStore = useSessionStore();

const adminLabel = computed(() => {
  const admin = sessionStore.admin;
  return admin?.name || admin?.username || admin?.email || "Admin";
});
</script>

<template>
  <header class="admin-header">
    <div class="admin-header__account">
      <span>{{ adminLabel }}</span>
      <button type="button" @click="sessionStore.logout()">退出登录</button>
    </div>
  </header>
</template>
