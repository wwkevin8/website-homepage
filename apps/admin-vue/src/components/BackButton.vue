<script setup>
defineProps({
  href: {
    type: String,
    default: "/admin/"
  },
  label: {
    type: String,
    default: "返回"
  }
});
</script>

<template>
  <a class="secondary-button" :href="href">{{ label }}</a>
</template>
