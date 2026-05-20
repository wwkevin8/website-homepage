<script setup>
import AppSidebar from "@/components/AppSidebar.vue";
</script>

<template>
  <div class="admin-shell">
    <AppSidebar />
    <div class="admin-shell__body">
      <main class="admin-shell__main">
        <RouterView />
      </main>
    </div>
  </div>
</template>
