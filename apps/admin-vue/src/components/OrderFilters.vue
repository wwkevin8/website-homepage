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
      <select v-model="model.status">
        <option value="">全部</option>
        <option value="pending_confirmation">待确认</option>
        <option value="confirmed">已确认</option>
        <option value="draft">草稿</option>
        <option value="open">进行中</option>
        <option value="grouped">已拼单</option>
        <option value="closed">已完成</option>
        <option value="cancelled">已取消</option>
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
