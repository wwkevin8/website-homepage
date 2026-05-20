<script setup>
defineProps({
  columns: {
    type: Array,
    required: true
  },
  rows: {
    type: Array,
    default: () => []
  },
  rowKey: {
    type: String,
    default: "id"
  },
  rowClass: {
    type: Function,
    default: null
  },
  rowClickable: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["row-click"]);

function handleRowClick(row, event) {
  if (!event || !event.target) {
    emit("row-click", row);
    return;
  }
  if (event.target.closest?.("button, a, input, select, textarea, label")) {
    return;
  }
  emit("row-click", row);
}
</script>

<template>
  <div class="admin-table-wrap">
    <table class="admin-table">
      <colgroup>
        <col
          v-for="column in columns"
          :key="column.key"
          :style="column.width ? { width: column.width } : null"
        />
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="[column.className, { 'is-sticky-end': column.sticky === 'end' }]"
          >
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, index) in rows"
          :key="row[rowKey] || index"
          :class="[rowClass ? rowClass(row, index) : null, { 'is-clickable-row': rowClickable }]"
          @click="rowClickable ? handleRowClick(row, $event) : null"
        >
          <td
            v-for="column in columns"
            :key="column.key"
            :class="[column.className, { 'is-sticky-end': column.sticky === 'end' }]"
          >
            <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
              {{ row[column.key] ?? "--" }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
