<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    required: true
  },
  confirmLabel: {
    type: String,
    default: "确认"
  },
  cancelLabel: {
    type: String,
    default: "取消"
  },
  loading: {
    type: Boolean,
    default: false
  },
  tone: {
    type: String,
    default: "danger"
  }
});

defineEmits(["confirm", "cancel"]);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-dialog">
      <div class="confirm-dialog__backdrop" aria-hidden="true"></div>
      <section class="confirm-dialog__panel" role="dialog" aria-modal="true" :aria-label="title">
        <header class="confirm-dialog__header">
          <h3>{{ title }}</h3>
        </header>
        <div class="confirm-dialog__body">
          <slot />
        </div>
        <footer class="confirm-dialog__actions">
          <button class="secondary-button" type="button" :disabled="loading" @click="$emit('cancel')">
            {{ cancelLabel }}
          </button>
          <button
            class="table-action-button"
            :class="{ 'table-action-button--danger': tone === 'danger' }"
            type="button"
            :disabled="loading"
            @click="$emit('confirm')"
          >
            {{ loading ? "处理中..." : confirmLabel }}
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
