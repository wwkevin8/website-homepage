<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

function normalizeAdminPath(path = "/") {
  const rawPath = typeof path === "string" && path ? path : "/";
  if (rawPath === "/admin-vue" || rawPath.startsWith("/admin-vue/")) {
    return rawPath.replace(/^\/admin-vue(?=\/|$)/, "/admin");
  }
  if (rawPath === "/admin" || rawPath.startsWith("/admin/")) {
    return rawPath;
  }
  return `/admin${rawPath.startsWith("/") ? rawPath : `/${rawPath}`}`;
}

const returnTo = computed(() => {
  const rawReturnTo = Array.isArray(route.query.return_to)
    ? route.query.return_to[0]
    : route.query.return_to;
  return normalizeAdminPath(rawReturnTo);
});

const loginHref = computed(() => `/admin-login.html?return_to=${encodeURIComponent(returnTo.value)}`);

if (typeof window !== "undefined") {
  window.location.replace(loginHref.value);
}
</script>

<template>
  <main class="standalone-view">
    <h1>正在前往登录页</h1>
    <p>2.0 NGN管理后台需要先完成管理员登录。</p>
    <a :href="loginHref">立即登录</a>
  </main>
</template>
