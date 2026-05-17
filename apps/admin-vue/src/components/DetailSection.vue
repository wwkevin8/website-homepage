<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ""
  }
});
</script>

<template>
  <section class="detail-section">
    <div class="detail-section__heading">
      <h3>{{ title }}</h3>
      <p v-if="description">{{ description }}</p>
    </div>
    <slot />
  </section>
</template>
