<script setup>
import AppHeader from "@/components/AppHeader.vue";
import AppSidebar from "@/components/AppSidebar.vue";
</script>

<template>
  <div class="admin-shell">
    <AppSidebar />
    <div class="admin-shell__body">
      <AppHeader />
      <main class="admin-shell__main">
        <RouterView />
      </main>
    </div>
  </div>
</template>
