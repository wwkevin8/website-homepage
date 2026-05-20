<script setup>
defineProps({
  selectedCount: {
    type: Number,
    default: 0
  },
  totalCount: {
    type: Number,
    default: 0
  },
  allCurrentPageSelected: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  saving: {
    type: Boolean,
    default: false
  },
  exporting: {
    type: Boolean,
    default: false
  }
});

defineEmits(["toggle-current-page", "mark-selected", "unmark-selected", "export-selected"]);
</script>

<template>
  <div class="transport-list-toolbar">
    <div class="transport-list-toolbar__summary">
      已选 {{ selectedCount }} 条，当前筛选共 {{ totalCount }} 条
    </div>
    <div class="transport-list-toolbar__actions">
      <button class="secondary-button" type="button" :disabled="disabled" @click="$emit('toggle-current-page')">
        {{ allCurrentPageSelected ? "取消选择当前页" : "选择当前页" }}
      </button>
      <button class="secondary-button" type="button" :disabled="disabled || !selectedCount || saving" @click="$emit('mark-selected')">
        批量标记已记录
      </button>
      <button class="secondary-button" type="button" :disabled="disabled || !selectedCount || saving" @click="$emit('unmark-selected')">
        批量取消已记录
      </button>
      <button class="secondary-button" type="button" :disabled="disabled || !selectedCount || exporting" @click="$emit('export-selected')">
        导出选中订单
      </button>
    </div>
  </div>
</template>
