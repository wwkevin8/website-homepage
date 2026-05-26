<script setup>
const props = defineProps({
  pagination: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(["change"]);

function currentPage() {
  return Number(props.pagination.page || 1);
}

function totalPages() {
  return Math.max(Number(props.pagination.total_pages || 0), 0);
}

function canGoPrev() {
  return Boolean(props.pagination.has_prev) || currentPage() > 1;
}

function canGoNext() {
  const pages = totalPages();
  if (!pages) return false;
  return Boolean(props.pagination.has_next) || currentPage() < pages;
}

function changePage(page) {
  emit("change", page);
}
</script>

<template>
  <nav class="pagination" aria-label="分页">
    <button
      type="button"
      class="secondary-button"
      :disabled="!canGoPrev()"
      @click="changePage(currentPage() - 1)"
    >
      上一页
    </button>
    <span>
      第 {{ currentPage() }} / {{ Math.max(totalPages(), 1) }} 页，共
      {{ Number(props.pagination.total || 0) }} 条
    </span>
    <button
      type="button"
      class="secondary-button"
      :disabled="!canGoNext()"
      @click="changePage(currentPage() + 1)"
    >
      下一页
    </button>
  </nav>
</template>
