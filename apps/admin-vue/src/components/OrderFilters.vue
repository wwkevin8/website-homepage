<script setup>
const model = defineModel({
  type: Object,
  required: true
});

defineEmits(["submit", "reset"]);
</script>

<template>
  <form class="admin-filter-panel order-filter-panel" @submit.prevent="$emit('submit')" @reset.prevent="$emit('reset')">
    <label class="field">
      <span>订单编号</span>
      <input v-model="model.orderNo" type="search" placeholder="例如 PU260411-0001" />
    </label>
    <label class="field">
      <span>姓名</span>
      <input v-model="model.customerName" type="search" placeholder="按客户姓名搜索" />
    </label>
    <label class="field">
      <span>手机号</span>
      <input v-model="model.phone" type="search" placeholder="按手机号搜索" />
    </label>
    <label class="field">
      <span>服务类型</span>
      <select v-model="model.serviceType">
        <option value="">全部</option>
        <option value="pickup">接机</option>
        <option value="dropoff">送机</option>
        <option value="storage">寄存</option>
      </select>
    </label>
    <label class="field">
      <span>订单状态</span>
      <select v-model="model.registrationStatus">
        <option value="">全部</option>
        <option value="false">未登记</option>
        <option value="true">已登记</option>
      </select>
    </label>
    <label class="field">
      <span>风险筛选</span>
      <select v-model="model.risk">
        <option value="">全部</option>
        <option value="overdue_unprocessed">超过 24 小时未登记</option>
        <option value="no_operator">无最近操作人</option>
        <option value="offline_unrecorded">未登记</option>
        <option value="missing_fields">关键字段缺失</option>
      </select>
    </label>
    <label class="field">
      <span>开始时间</span>
      <input v-model="model.createdFrom" type="date" />
    </label>
    <label class="field">
      <span>结束时间</span>
      <input v-model="model.createdTo" type="date" />
    </label>
    <label class="field">
      <span>排序</span>
      <select v-model="model.sort">
        <option value="latest">最新</option>
        <option value="oldest">最早</option>
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
    <div class="filter-actions">
      <button class="primary-button" type="submit">查询</button>
      <button class="secondary-button" type="reset">重置</button>
    </div>
  </form>
</template>
