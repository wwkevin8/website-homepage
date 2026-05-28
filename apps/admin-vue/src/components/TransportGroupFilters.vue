<script setup>
import { ref } from "vue";

const model = defineModel({
  type: Object,
  required: true
});

defineEmits(["submit", "reset"]);

const showAdvanced = ref(false);

const airportOptions = [
  { code: "LHR", name: "Heathrow" },
  { code: "LGW", name: "Gatwick" },
  { code: "MAN", name: "Manchester" },
  { code: "LTN", name: "Luton" },
  { code: "LCY", name: "London City" },
  { code: "BHX", name: "Birmingham" },
  { code: "STN", name: "Stansted" },
  { code: "OTHER", name: "其它机场" }
];
</script>

<template>
  <form class="admin-filter-panel transport-group-filter-panel" @submit.prevent="$emit('submit')" @reset.prevent="$emit('reset')">
    <div class="transport-group-filter-row transport-group-filter-row--primary">
      <label class="field transport-group-filter-panel__search">
        <span>关键词</span>
        <input
          v-model="model.keyword"
          type="search"
          placeholder="Group ID / 姓名 / 电话 / 微信 / 航班 / 地址"
        />
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
            {{ airport.code }} / {{ airport.name }}
          </option>
        </select>
      </label>
      <label class="field">
        <span>组状态</span>
        <select v-model="model.status">
          <option value="">全部</option>
          <option value="active">进行中</option>
          <option value="single_member">待拼车</option>
          <option value="full">已满员</option>
          <option value="closed">已关闭/取消</option>
        </select>
      </label>
      <label class="field">
        <span>有效性</span>
        <select v-model="model.validity">
          <option value="active">有效单 / 有效组</option>
          <option value="invalid">无效或过期单</option>
          <option value="all">全部</option>
        </select>
      </label>
      <label class="field">
        <span>排序方式</span>
        <select v-model="model.sort">
          <option value="service_time_asc">服务时间：最久到最近</option>
          <option value="service_time_desc">服务时间：最近到最久</option>
        </select>
      </label>
      <div class="filter-actions transport-group-filter-panel__actions">
        <button class="primary-button" type="submit">筛选</button>
        <button class="secondary-button" type="button" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? "收起高级" : "高级筛选" }}
        </button>
        <button class="secondary-button" type="reset">重置</button>
      </div>
    </div>

    <div v-if="showAdvanced" class="transport-group-filter-row transport-group-filter-row--advanced">
      <label class="field">
        <span>航站楼</span>
        <input v-model="model.terminal" type="search" placeholder="例如 T2 / North" />
      </label>
      <label class="field">
        <span>前台显示</span>
        <select v-model="model.visibleOnFrontend">
          <option value="">全部</option>
          <option value="true">前台显示</option>
          <option value="false">前台隐藏</option>
        </select>
      </label>
      <label class="field">
        <span>风险</span>
        <select v-model="model.risk">
          <option value="">全部</option>
          <option value="has_risk">有风险</option>
          <option value="no_risk">无风险</option>
          <option value="cross_terminal">不同航站楼</option>
          <option value="missing_flight_no">缺航班号</option>
          <option value="missing_contact">缺联系方式</option>
          <option value="full_visible">满员仍前台显示</option>
          <option value="empty_group">空组风险</option>
        </select>
      </label>
      <label class="field">
        <span>付款状态</span>
        <select v-model="model.paymentStatus">
          <option value="">全部</option>
          <option value="all_paid">全部已付款</option>
          <option value="partial_paid">部分已付款</option>
          <option value="all_unpaid">全部未付款</option>
        </select>
      </label>
      <label class="field">
        <span>线下记录</span>
        <select v-model="model.offlineStatus">
          <option value="">全部</option>
          <option value="all_recorded">全部已记录</option>
          <option value="partial_recorded">部分已记录</option>
          <option value="all_unrecorded">全部未记录</option>
        </select>
      </label>
      <label class="field">
        <span>派单准备度</span>
        <select v-model="model.dispatchReadiness">
          <option value="">全部</option>
          <option value="contact_pending">待联系</option>
          <option value="payment_incomplete">付款未齐</option>
          <option value="offline_pending">未线下记录</option>
          <option value="has_risk">有风险</option>
          <option value="dispatch_ready">可派单</option>
          <option value="completed_recorded">已完成记录</option>
        </select>
      </label>
      <label class="field">
        <span>调度状态</span>
        <select v-model="model.dispatchStatus">
          <option value="">全部</option>
          <option value="pending_dispatch">待调度</option>
          <option value="driver_assigned">已派车</option>
          <option value="driver_notified">已通知司机</option>
          <option value="in_progress">服务中</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
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
    </div>
  </form>
</template>
