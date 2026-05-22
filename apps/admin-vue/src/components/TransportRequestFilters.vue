<script setup>
import { computed } from "vue";

const model = defineModel({
  type: Object,
  required: true
});

const props = defineProps({
  operatorOptions: {
    type: Array,
    default: () => []
  },
  exporting: {
    type: Boolean,
    default: false
  }
});

defineEmits(["submit", "reset", "export"]);

const airportOptions = [
  { code: "LHR", name: "希思罗机场" },
  { code: "LGW", name: "盖特威克机场" },
  { code: "MAN", name: "曼彻斯特机场" },
  { code: "LTN", name: "卢顿机场" },
  { code: "LCY", name: "伦敦城市机场" },
  { code: "BHX", name: "伯明翰机场" },
  { code: "STN", name: "斯坦斯特德机场" },
  { code: "OTHER", name: "其他机场" }
];

const operatorSelectOptions = computed(() => {
  const values = [model.value?.lastOperatedBy, ...props.operatorOptions]
    .map(value => String(value || "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
});
</script>

<template>
  <form class="admin-filter-panel transport-request-filter-panel" @submit.prevent="$emit('submit')" @reset.prevent="$emit('reset')">
    <label class="field">
      <span>订单编号</span>
      <input v-model="model.orderNo" type="search" placeholder="例如 PU260411-0001" />
    </label>
    <label class="field">
      <span>服务类型</span>
      <select v-model="model.serviceType">
        <option value="">全部</option>
        <option value="pickup">接机</option>
        <option value="dropoff">送机</option>
      </select>
    </label>
    <label class="field">
      <span>机场</span>
      <select v-model="model.airportCode">
        <option value="">全部机场</option>
        <option v-for="airport in airportOptions" :key="airport.code" :value="airport.code">
          {{ airport.code }} · {{ airport.name }}
        </option>
      </select>
    </label>
    <label class="field">
      <span>订单状态</span>
      <select v-model="model.status">
        <option value="">全部</option>
        <option value="active">有效单</option>
        <option value="closed">已关闭/过期单</option>
      </select>
    </label>
    <label class="field">
      <span>线下记录状态</span>
      <select v-model="model.offlineRecorded">
        <option value="">全部</option>
        <option value="false">未记录</option>
        <option value="true">已记录</option>
      </select>
    </label>
    <label class="field">
      <span>上次操作人</span>
      <select v-model="model.lastOperatedBy">
        <option value="">全部</option>
        <option v-for="operator in operatorSelectOptions" :key="operator" :value="operator">{{ operator }}</option>
      </select>
    </label>
    <label class="field">
      <span>开始日期</span>
      <input v-model="model.dateFrom" type="date" />
    </label>
    <label class="field">
      <span>导入批次</span>
      <input v-model="model.importBatchId" type="search" placeholder="TMI-..." />
    </label>
    <label class="field">
      <span>订单来源</span>
      <select v-model="model.source">
        <option value="">全部</option>
        <option value="public_form">前台提交</option>
        <option value="admin_manual">后台补录</option>
        <option value="sheet_import">批量导入</option>
      </select>
    </label>
    <label class="field">
      <span>结束日期</span>
      <input v-model="model.dateTo" type="date" />
    </label>
    <label class="field">
      <span>排序</span>
      <select v-model="model.sort">
        <option value="submitted_latest">按提交时间：最近到最远</option>
        <option value="submitted_oldest">按提交时间：最远到最近</option>
        <option value="flight_nearest">按到达/出发：最近到最久</option>
        <option value="flight_latest">按到达/出发：最久到最近</option>
      </select>
    </label>
    <label class="field field--compact">
      <span>每页</span>
      <select v-model.number="model.pageSize">
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
      </select>
    </label>
    <div class="filter-actions transport-request-filter-panel__actions">
      <button class="primary-button" type="submit">查询</button>
      <button class="secondary-button" type="reset">重置</button>
      <button class="secondary-button" type="button" :disabled="exporting" @click="$emit('export')">
        导出当前筛选结果
      </button>
    </div>
  </form>
</template>
