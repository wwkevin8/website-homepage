<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number, Boolean],
    default: ""
  },
  multiline: {
    type: Boolean,
    default: false
  }
});
</script>

<template>
  <article class="readonly-field" :class="{ 'readonly-field--multiline': multiline }">
    <span>{{ label }}</span>
    <strong :title="String(value || '--')">{{ value || "--" }}</strong>
  </article>
</template>
