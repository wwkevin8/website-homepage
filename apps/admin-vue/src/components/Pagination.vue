<script setup>
const props = defineProps({
  pagination: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(["change"]);

function changePage(page) {
  emit("change", page);
}
</script>

<template>
  <nav class="pagination" aria-label="分页">
    <button
      type="button"
      class="secondary-button"
      :disabled="Number(props.pagination.page || 1) <= 1"
      @click="changePage(Number(props.pagination.page || 1) - 1)"
    >
      上一页
    </button>
    <span>
      第 {{ Number(props.pagination.page || 1) }} / {{ Math.max(Number(props.pagination.total_pages || 1), 1) }} 页，共
      {{ Number(props.pagination.total || 0) }} 条
    </span>
    <button
      type="button"
      class="secondary-button"
      :disabled="Number(props.pagination.page || 1) >= Math.max(Number(props.pagination.total_pages || 1), 1)"
      @click="changePage(Number(props.pagination.page || 1) + 1)"
    >
      下一页
    </button>
  </nav>
</template>
