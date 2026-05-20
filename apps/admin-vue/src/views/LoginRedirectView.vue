<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const returnTo = computed(() => {
  const rawReturnTo = Array.isArray(route.query.return_to)
    ? route.query.return_to[0]
    : route.query.return_to;
  const path = typeof rawReturnTo === "string" && rawReturnTo ? rawReturnTo : "/";
  return path.startsWith("/admin-vue") ? path : `/admin-vue${path.startsWith("/") ? path : `/${path}`}`;
});

const loginHref = computed(() => `/admin-login.html?return_to=${encodeURIComponent(returnTo.value)}`);

if (typeof window !== "undefined") {
  window.location.replace(loginHref.value);
}
</script>

<template>
  <main class="standalone-view">
    <h1>正在前往登录页</h1>
    <p>新版后台沿用旧后台登录状态，未登录时会跳转到旧登录页。</p>
    <a :href="loginHref">立即登录</a>
  </main>
</template>
