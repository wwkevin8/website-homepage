<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useSessionStore } from "@/stores/session";

const route = useRoute();
const sessionStore = useSessionStore();

const adminLabel = computed(() => {
  const admin = sessionStore.admin;
  return admin?.name || admin?.username || admin?.email || "Admin";
});

const pageTitle = computed(() => route.meta.title || "Dashboard");
</script>

<template>
  <header class="admin-header">
    <div>
      <p class="admin-header__eyebrow">Independent Vue 3 admin</p>
      <h1>{{ pageTitle }}</h1>
    </div>
    <div class="admin-header__account">
      <span>{{ adminLabel }}</span>
      <button type="button" @click="sessionStore.logout()">退出登录</button>
    </div>
  </header>
</template>
