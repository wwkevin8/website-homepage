<script setup>
const model = defineModel({
  type: Object,
  required: true
});

defineEmits(["submit", "reset"]);

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
</script>

<template>
  <form class="admin-filter-panel transport-group-filter-panel" @submit.prevent="$emit('submit')" @reset.prevent="$emit('reset')">
    <label class="field transport-group-filter-panel__search">
      <span>订单编号或 Group ID</span>
      <input v-model="model.keyword" type="search" placeholder="例如 PU260411-0001 或 GRP-260416-QM2A" />
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
      <span>组状态</span>
      <select v-model="model.status">
        <option value="">全部</option>
        <option value="active">拼车中</option>
        <option value="single_member">待拼车</option>
        <option value="full">已拼满</option>
        <option value="closed">已过期</option>
      </select>
    </label>
    <label class="field">
      <span>开始日期</span>
      <input v-model="model.dateFrom" type="date" />
    </label>
    <label class="field">
      <span>结束日期</span>
      <input v-model="model.dateTo" type="date" />
    </label>
    <label class="field field--compact">
      <span>每页</span>
      <select v-model.number="model.pageSize">
        <option :value="10">10</option>
        <option :value="20">20</option>
        <option :value="50">50</option>
      </select>
    </label>
    <div class="filter-actions transport-group-filter-panel__actions">
      <button class="primary-button" type="submit">筛选</button>
      <button class="secondary-button" type="reset">重置</button>
    </div>
  </form>
</template>
