<script setup>
defineProps({
  title: {
    type: String,
    default: "暂无数据"
  },
  description: {
    type: String,
    default: "请调整筛选条件后重试。"
  }
});
</script>

<template>
  <section class="state-panel">
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
  </section>
</template>
