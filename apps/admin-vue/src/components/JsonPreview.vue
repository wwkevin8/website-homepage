<script setup>
import { computed } from "vue";

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  value: {
    type: [Object, Array, String, Number, Boolean],
    default: null
  }
});

const hasValue = computed(() => {
  if (props.value === null || props.value === undefined || props.value === "") {
    return false;
  }
  if (Array.isArray(props.value)) {
    return props.value.length > 0;
  }
  if (typeof props.value === "object") {
    return Object.keys(props.value).length > 0;
  }
  return true;
});

const preview = computed(() => {
  if (!hasValue.value) {
    return "--";
  }
  if (typeof props.value === "string") {
    return props.value;
  }
  return JSON.stringify(props.value, null, 2);
});
</script>

<template>
  <details class="json-preview">
    <summary>{{ title }}</summary>
    <pre>{{ preview }}</pre>
  </details>
</template>
