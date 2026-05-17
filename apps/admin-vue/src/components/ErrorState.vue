<script setup>
defineProps({
  message: {
    type: String,
    default: "加载失败"
  }
});
</script>

<template>
  <section class="admin-alert admin-alert--error">
    {{ message }}
  </section>
</template>
