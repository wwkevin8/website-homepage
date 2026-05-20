<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import {
  createMembershipClaim,
  createMembershipCode,
  deleteMembership,
  deleteMembershipCode,
  fetchMembershipBirthdays,
  fetchMembershipCodes,
  fetchMemberships,
  fetchUsers,
  grantMembership,
  updateMembershipClaim
} from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const CURRENT_CYCLE = "2026-27";

const membershipColumns = [
  { key: "user", label: "用户", width: "13%" },
  { key: "contact", label: "联系方式", width: "15%" },
  { key: "membership_cycle", label: "会员周期", width: "8%" },
  { key: "status", label: "会员状态", width: "9%" },
  { key: "benefit_type", label: "权益类型", width: "9%" },
  { key: "advisor", label: "所属顾问", width: "9%" },
  { key: "last_operation", label: "最后操作", width: "15%" },
  { key: "created_at", label: "创建时间", width: "9%" },
  { key: "actions", label: "操作", width: "210px", className: "is-actions", sticky: "end" }
];

const codeColumns = [
  { key: "code_prefix", label: "激活码前缀", width: "15%" },
  { key: "membership_cycle", label: "会员周期", width: "12%" },
  { key: "status", label: "状态", width: "12%" },
  { key: "generated_by_admin", label: "创建管理员", width: "15%" },
  { key: "redeemed_by_user", label: "兑换用户", width: "18%" },
  { key: "redeemed_at", label: "兑换时间", width: "13%" },
  { key: "created_at", label: "创建时间", width: "13%" },
  { key: "actions", label: "操作", width: "110px", className: "is-actions", sticky: "end" }
];

const birthdayColumns = [
  { key: "birthday", label: "会员生日", width: "11%" },
  { key: "user", label: "会员", width: "13%" },
  { key: "contact", label: "联系方式", width: "20%" },
  { key: "membership_cycle", label: "会员周期", width: "10%" },
  { key: "benefit_type", label: "权益类型", width: "12%" },
  { key: "advisor", label: "提醒顾问", width: "12%" },
  { key: "reminder", label: "提醒记录", width: "16%" },
  { key: "actions", label: "操作", width: "110px", className: "is-actions", sticky: "end" }
];

const filters = reactive({
  search: "",
  cycle: CURRENT_CYCLE,
  status: "",
  benefitType: "",
  pageSize: 10
});

const codeFilters = reactive({
  search: "",
  cycle: CURRENT_CYCLE,
  status: "",
  pageSize: 10
});

const batchCodeForm = reactive({
  open: false,
  count: 10,
  membership_cycle: CURRENT_CYCLE,
  benefit_type: "",
  notes: ""
});

const memberships = ref([]);
const membershipPagination = ref({ page: 1, page_size: filters.pageSize, total: 0, total_pages: 0 });
const membershipLoading = ref(false);
const membershipError = ref("");
const codes = ref([]);
const codePagination = ref({ page: 1, page_size: codeFilters.pageSize, total: 0, total_pages: 0 });
const codeLoading = ref(false);
const codeError = ref("");
const birthdays = ref([]);
const birthdayRange = ref({ days: 30, cycle: CURRENT_CYCLE, today: "" });
const birthdayLoading = ref(false);
const birthdayError = ref("");
const notice = ref("");
const generatedCode = ref("");
const generatedBatchCodes = ref([]);
const actionLoading = ref("");
let noticeTimer = null;

const hasMemberships = computed(() => memberships.value.length > 0);
const hasCodes = computed(() => codes.value.length > 0);
const hasBirthdays = computed(() => birthdays.value.length > 0);

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "--" : String(value);
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date(value));
  } catch (err) {
    return displayValue(value);
  }
}

function formatBirthday(row) {
  const month = Number(row?.birthday_month);
  const day = Number(row?.birthday_day);
  if (Number.isFinite(month) && Number.isFinite(day)) {
    return `${month}月${day}日`;
  }
  return displayValue(row?.birthday_date);
}

function birthdayDistanceLabel(daysAgo) {
  const days = Number(daysAgo);
  if (!Number.isFinite(days)) {
    return "--";
  }
  return days === 0 ? "今天" : `${days}天前`;
}

function userLabel(user) {
  if (!user) {
    return "--";
  }
  return user.nickname || user.name || user.public_user_id || user.email || user.phone || "--";
}

function contactLabel(user) {
  if (!user) {
    return "--";
  }
  return [user.email, user.phone, user.wechat_id].filter(Boolean).join(" / ") || "--";
}

function adminLabel(admin) {
  if (!admin) {
    return "--";
  }
  return admin.name || admin.username || admin.email || "--";
}

function benefitLabel(type) {
  const labels = {
    storage: "寄存",
    pickup: "接机",
    moving: "搬家",
    welcome_pack: "新生礼包",
    cashback: "返现/人工备注",
    manual: "人工记录"
  };
  return labels[type] || displayValue(type);
}

function statusLabel(status) {
  const labels = {
    active: "有效",
    redeemed: "已兑换",
    revoked: "已作废",
    expired: "已过期",
    selected: "已选择权益",
    reserved: "已登记权益",
    used: "权益已使用",
    cancelled: "已作废",
    manual: "人工记录"
  };
  return labels[status] || displayValue(status);
}

function reminderStatusLabel(reminder) {
  if (!reminder) {
    return "未发送";
  }
  const labels = {
    sent: "已提醒",
    failed: "发送失败",
    pending: "待发送",
    skipped: "已跳过"
  };
  return labels[reminder.status] || displayValue(reminder.status);
}

function actionLabel(action) {
  const labels = {
    membership_entitlement_granted: "创建会员",
    membership_entitlement_deleted: "更新会员信息",
    membership_manual_claim_recorded: "登记权益",
    membership_claim_marked_used: "修改权益",
    membership_claim_cancelled: "修改权益",
    membership_claim_reset: "修改权益",
    membership_claim_order_bound: "更新会员信息",
    membership_claim_order_unbound: "更新会员信息",
    membership_activation_code_created: "生成激活码",
    membership_activation_codes_batch_created: "批量生成激活码",
    membership_activation_code_deleted: "更新会员信息",
    membership_activation_code_revoked: "更新会员信息",
    membership_activation_code_redeemed: "使用激活码兑换"
  };
  return labels[action] || displayValue(action);
}

function statusTone(status) {
  if (status === "active" || status === "used" || status === "redeemed") {
    return "success";
  }
  if (status === "selected" || status === "reserved" || status === "manual") {
    return "warning";
  }
  if (status === "cancelled" || status === "revoked" || status === "expired") {
    return "danger";
  }
  return "neutral";
}

function membershipStatus(item) {
  return item.status || "";
}

function lastOperationTitle(operation) {
  return operation ? `${adminLabel(operation.admin_user)}\n${formatDateTime(operation.created_at)}\n${actionLabel(operation.action)}` : "--";
}

function membershipDetailHref(item, section = "overview") {
  if (!item?.id) {
    return "";
  }
  return `/admin-vue/memberships/${encodeURIComponent(item.id)}?section=${encodeURIComponent(section)}&cycle=${encodeURIComponent(item.membership_cycle || filters.cycle || CURRENT_CYCLE)}&return_to=${encodeURIComponent("/admin-vue/memberships")}`;
}

function rememberMembershipDetail(item) {
  if (!item?.id || typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(`admin-vue:membership:${item.id}`, JSON.stringify(item));
  } catch (err) {
    // Detail page can still fall back to the existing list API.
  }
}

function openMembershipDetail(item, section = "overview") {
  const href = membershipDetailHref(item, section);
  if (!href) {
    notice.value = `暂未找到对应会员详情：${displayValue(actionSubject(item))}`;
    return;
  }
  rememberMembershipDetail(item);
  window.location.href = href;
}

function actionSubject(item) {
  if (item.code_prefix) {
    return item.code_prefix;
  }
  if (item.user || item.redeemed_by_user) {
    return userLabel(item.user || item.redeemed_by_user);
  }
  return item.id || "当前记录";
}

function buildMembershipQuery(page) {
  const selectedStatus = filters.status;
  const claimStatuses = ["selected", "reserved", "used", "manual", "cancelled"];
  return {
    page,
    page_size: filters.pageSize,
    search: filters.search.trim(),
    cycle: filters.cycle.trim() || CURRENT_CYCLE,
    status: selectedStatus === "expired" ? "expired" : selectedStatus === "unused" ? "active" : "",
    benefit_type: filters.benefitType,
    claim_status: claimStatuses.includes(selectedStatus) ? selectedStatus : "",
    display_status: selectedStatus
  };
}

function clearNoticeTimer() {
  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
    noticeTimer = null;
  }
}

function setActionNotice(message, isError = false, autoHideMs = 0) {
  clearNoticeTimer();
  notice.value = message;
  if (isError) {
    window.alert(message);
    return;
  }
  if (autoHideMs > 0) {
    noticeTimer = window.setTimeout(() => {
      notice.value = "";
      noticeTimer = null;
    }, autoHideMs);
  }
}

function ensureBrowserConfirm(message) {
  return typeof window !== "undefined" ? window.confirm(message) : false;
}

function promptText(message, defaultValue = "") {
  if (typeof window === "undefined") {
    return null;
  }
  return window.prompt(message, defaultValue);
}

function parseChoiceIndex(value, max) {
  const index = Number(String(value || "").trim());
  return Number.isInteger(index) && index >= 1 && index <= max ? index - 1 : -1;
}

async function chooseMembershipUser() {
  const search = promptText("请输入要开通会员的用户姓名、邮箱、手机号或微信：", "");
  if (search === null) {
    return null;
  }
  const keyword = search.trim();
  if (!keyword) {
    setActionNotice("请先输入用户搜索关键词。", true);
    return null;
  }
  const payload = await fetchUsers({ search: keyword, page: 1, page_size: 10 });
  const users = Array.isArray(payload?.items) ? payload.items : [];
  if (!users.length) {
    setActionNotice("没有找到匹配用户，请换一个关键词再试。", true);
    return null;
  }
  if (users.length === 1) {
    return users[0];
  }
  const choices = users
    .map((user, index) => `${index + 1}. ${userLabel(user)} / ${contactLabel(user)}`)
    .join("\n");
  const selected = promptText(`找到多个用户，请输入序号：\n${choices}`, "1");
  if (selected === null) {
    return null;
  }
  const index = parseChoiceIndex(selected, users.length);
  if (index < 0) {
    setActionNotice("选择的用户序号无效。", true);
    return null;
  }
  return users[index];
}

async function openGrantMembership() {
  if (actionLoading.value) {
    return;
  }
  actionLoading.value = "grant";
  generatedCode.value = "";
  generatedBatchCodes.value = [];
  try {
    const user = await chooseMembershipUser();
    if (!user?.id) {
      return;
    }
    const cycle = promptText("会员周期：", filters.cycle || CURRENT_CYCLE);
    if (cycle === null) {
      return;
    }
    await grantMembership({
      site_user_id: user.id,
      membership_cycle: cycle.trim() || CURRENT_CYCLE,
      notes: ""
    });
    setActionNotice(`已为 ${userLabel(user)} 开通会员。`);
    await loadMemberships(1);
  } catch (err) {
    setActionNotice(err.message || "开通会员失败", true);
  } finally {
    actionLoading.value = "";
  }
}

async function generateMembershipCode() {
  if (actionLoading.value) {
    return;
  }
  const cycle = promptText("会员周期：", codeFilters.cycle || filters.cycle || CURRENT_CYCLE);
  if (cycle === null) {
    return;
  }
  actionLoading.value = "code";
  notice.value = "";
  generatedCode.value = "";
  generatedBatchCodes.value = [];
  try {
    const payload = await createMembershipCode({
      membership_cycle: cycle.trim() || CURRENT_CYCLE
    });
    generatedCode.value = payload?.code || "";
    setActionNotice("会员激活码已生成，请立即保存，完整激活码只显示这一次。");
    await loadCodes(1);
  } catch (err) {
    setActionNotice(err.message || "会员激活码生成失败", true);
  } finally {
    actionLoading.value = "";
  }
}

function openBatchCodeDialog() {
  if (actionLoading.value) {
    return;
  }
  Object.assign(batchCodeForm, {
    open: true,
    count: 10,
    membership_cycle: codeFilters.cycle || filters.cycle || CURRENT_CYCLE,
    benefit_type: "",
    notes: ""
  });
  generatedCode.value = "";
  generatedBatchCodes.value = [];
}

function closeBatchCodeDialog() {
  if (actionLoading.value !== "batch-code") {
    batchCodeForm.open = false;
  }
}

async function submitBatchCodeForm() {
  if (actionLoading.value) {
    return;
  }
  const count = Number(batchCodeForm.count);
  if (!Number.isInteger(count) || count < 1 || count > 200) {
    setActionNotice("生成数量需为 1-200 之间的整数。", true);
    return;
  }
  actionLoading.value = "batch-code";
  notice.value = "";
  generatedCode.value = "";
  generatedBatchCodes.value = [];
  try {
    const payload = await createMembershipCode({
      count,
      membership_cycle: batchCodeForm.membership_cycle.trim() || CURRENT_CYCLE,
      benefit_type: batchCodeForm.benefit_type || "",
      notes: batchCodeForm.notes.trim()
    });
    generatedBatchCodes.value = Array.isArray(payload?.items)
      ? payload.items.map(item => item.code).filter(Boolean)
      : [payload?.code].filter(Boolean);
    batchCodeForm.open = false;
    setActionNotice(`已批量生成 ${generatedBatchCodes.value.length || count} 个会员激活码。`);
    await loadCodes(1);
  } catch (err) {
    setActionNotice(err.message || "批量生成会员激活码失败", true);
  } finally {
    actionLoading.value = "";
  }
}

function promptManualClaimInput(defaultStatus = "selected") {
  const benefitOptions = [
    { key: "pickup", label: "接机" },
    { key: "storage", label: "寄存" },
    { key: "moving", label: "搬家" },
    { key: "welcome_pack", label: "新生礼包" }
  ];
  const benefitText = benefitOptions.map((item, index) => `${index + 1}. ${item.label}`).join("\n");
  const benefitChoice = promptText(`请选择权益类型：\n${benefitText}`, "1");
  if (benefitChoice === null) {
    return null;
  }
  const benefitIndex = parseChoiceIndex(benefitChoice, benefitOptions.length);
  const benefitType = benefitIndex >= 0 ? benefitOptions[benefitIndex].key : String(benefitChoice || "").trim();
  if (!benefitOptions.some(item => item.key === benefitType)) {
    setActionNotice("权益类型无效，请输入 1-4。", true);
    return null;
  }

  const statusOptions = [
    { key: "selected", label: "已选择权益" },
    { key: "manual", label: "人工记录" },
    { key: "used", label: "权益已使用" },
    { key: "reserved", label: "已登记权益" }
  ];
  const statusText = statusOptions.map((item, index) => `${index + 1}. ${item.label}`).join("\n");
  const statusChoice = promptText(`请选择权益状态：\n${statusText}`, defaultStatus);
  if (statusChoice === null) {
    return null;
  }
  const statusIndex = parseChoiceIndex(statusChoice, statusOptions.length);
  const status = statusIndex >= 0 ? statusOptions[statusIndex].key : String(statusChoice || "").trim() || defaultStatus;
  if (!statusOptions.some(item => item.key === status)) {
    setActionNotice("权益状态无效，请输入 1-4。", true);
    return null;
  }

  const note = promptText("备注，可留空：", "");
  if (note === null) {
    return null;
  }
  return {
    benefit_type: benefitType,
    status,
    admin_note: note.trim()
  };
}

async function registerMembershipClaim(row) {
  if (!row?.id || actionLoading.value) {
    return;
  }
  const payload = promptManualClaimInput(row.claim?.status === "cancelled" ? "selected" : "manual");
  if (!payload) {
    return;
  }
  actionLoading.value = `claim:${row.id}`;
  try {
    await createMembershipClaim({
      entitlement_id: row.id,
      ...payload
    });
    setActionNotice(`已登记会员权益：${actionSubject(row)}`);
    await loadMemberships(membershipPagination.value.page || 1);
  } catch (err) {
    setActionNotice(err.message || "登记会员权益失败", true);
  } finally {
    actionLoading.value = "";
  }
}

function canUnbindMembershipOrder(row) {
  return row?.claim?.status === "reserved" && Boolean(row.claim?.linked_order_no || row.claim?.linked_order_id);
}

async function unbindMembershipOrder(row) {
  const claimId = row?.claim?.id;
  if (!claimId || actionLoading.value) {
    return;
  }
  if (!ensureBrowserConfirm(`确认更新 ${actionSubject(row)} 的会员权益记录吗？更新后该会员权益会回到“已选择权益”。`)) {
    return;
  }
  actionLoading.value = `unbind:${row.id}`;
  try {
    await updateMembershipClaim(claimId, "unbind-order", {
      reason: "admin_unbound_deleted_order"
    });
    setActionNotice(`已更新会员权益记录：${actionSubject(row)}`);
    await loadMemberships(membershipPagination.value.page || 1);
  } catch (err) {
    setActionNotice(err.message || "更新会员权益记录失败", true);
  } finally {
    actionLoading.value = "";
  }
}

async function removeMembership(row) {
  if (!row?.id || actionLoading.value) {
    return;
  }
  if (!ensureBrowserConfirm(`确认删除 ${actionSubject(row)} 的会员资格吗？已登记的权益记录也会一并移除。`)) {
    return;
  }
  if (!ensureBrowserConfirm("请再次确认：删除会员资格后不可在页面上直接恢复，确认继续删除吗？")) {
    return;
  }
  actionLoading.value = `membership:${row.id}`;
  try {
    await deleteMembership(row.id);
    setActionNotice(`已删除会员资格：${actionSubject(row)}`);
    await loadMemberships(membershipPagination.value.page || 1);
  } catch (err) {
    setActionNotice(err.message || "删除会员资格失败", true);
  } finally {
    actionLoading.value = "";
  }
}

async function removeMembershipCode(row) {
  if (!row?.id || actionLoading.value) {
    return;
  }
  if (!ensureBrowserConfirm(`确认删除激活码 ${displayValue(row.code_prefix)} 吗？删除后将不再显示，也不能被兑换。`)) {
    return;
  }
  if (!ensureBrowserConfirm("请再次确认：删除激活码后不可恢复，确认继续删除吗？")) {
    return;
  }
  actionLoading.value = `code:${row.id}`;
  try {
    await deleteMembershipCode(row.id);
    setActionNotice(`删除成功：${displayValue(row.code_prefix)}`, false, 3000);
    await loadCodes(codePagination.value.page || 1);
  } catch (err) {
    setActionNotice(err.message || "会员激活码删除失败", true);
  } finally {
    actionLoading.value = "";
  }
}

function buildCodeQuery(page) {
  return {
    page,
    page_size: codeFilters.pageSize,
    search: codeFilters.search.trim(),
    cycle: codeFilters.cycle.trim() || CURRENT_CYCLE,
    status: codeFilters.status
  };
}

async function loadMemberships(page = membershipPagination.value.page || 1) {
  membershipLoading.value = true;
  membershipError.value = "";
  clearNoticeTimer();
  notice.value = "";
  try {
    const payload = await fetchMemberships(buildMembershipQuery(page));
    memberships.value = Array.isArray(payload?.items) ? payload.items : [];
    membershipPagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: memberships.value.length,
      total_pages: memberships.value.length ? 1 : 0
    };
  } catch (err) {
    memberships.value = [];
    membershipError.value = err.message || "会员权益列表加载失败";
  } finally {
    membershipLoading.value = false;
  }
}

async function loadCodes(page = codePagination.value.page || 1) {
  codeLoading.value = true;
  codeError.value = "";
  try {
    const payload = await fetchMembershipCodes(buildCodeQuery(page));
    codes.value = Array.isArray(payload?.items) ? payload.items : [];
    codePagination.value = payload?.pagination || {
      page,
      page_size: codeFilters.pageSize,
      total: codes.value.length,
      total_pages: codes.value.length ? 1 : 0
    };
  } catch (err) {
    codes.value = [];
    codeError.value = err.message || "会员激活码列表加载失败";
  } finally {
    codeLoading.value = false;
  }
}

async function loadBirthdays() {
  birthdayLoading.value = true;
  birthdayError.value = "";
  try {
    const payload = await fetchMembershipBirthdays({
      cycle: codeFilters.cycle.trim() || filters.cycle.trim() || CURRENT_CYCLE,
      days: 30,
      limit: 12
    });
    birthdays.value = Array.isArray(payload?.items) ? payload.items : [];
    birthdayRange.value = payload?.range || { days: 30, cycle: CURRENT_CYCLE, today: "" };
  } catch (err) {
    birthdays.value = [];
    birthdayError.value = err.message || "最近会员生日加载失败";
  } finally {
    birthdayLoading.value = false;
  }
}

function submitMembershipFilters() {
  loadMemberships(1);
}

function resetMembershipFilters() {
  Object.assign(filters, {
    search: "",
    cycle: CURRENT_CYCLE,
    status: "",
    benefitType: "",
    pageSize: 10
  });
  loadMemberships(1);
}

function submitCodeFilters() {
  loadCodes(1);
}

function resetCodeFilters() {
  Object.assign(codeFilters, {
    search: "",
    cycle: CURRENT_CYCLE,
    status: "",
    pageSize: 10
  });
  loadCodes(1);
}

onMounted(() => {
  loadMemberships(1);
  loadCodes(1);
  loadBirthdays();
});

onUnmounted(() => {
  clearNoticeTimer();
});
</script>

<template>
  <section class="memberships-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Membership operations</p>
        <h2>会员权益</h2>
      </div>
      <div class="view-heading__actions">
        <button class="secondary-button" type="button" :disabled="Boolean(actionLoading)" @click="openGrantMembership">
          {{ actionLoading === "grant" ? "开通中..." : "开通会员" }}
        </button>
        <button class="secondary-button" type="button" :disabled="Boolean(actionLoading)" @click="generateMembershipCode">
          {{ actionLoading === "code" ? "生成中..." : "生成激活码" }}
        </button>
        <button class="primary-button" type="button" :disabled="Boolean(actionLoading)" @click="openBatchCodeDialog">
          批量生成激活码
        </button>
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <p v-if="generatedCode" class="inline-notice inline-notice--success">
      完整激活码：<strong>{{ generatedCode }}</strong>
    </p>
    <div v-if="generatedBatchCodes.length" class="inline-notice inline-notice--success membership-generated-codes">
      <strong>本次生成的激活码</strong>
      <textarea readonly :value="generatedBatchCodes.join('\n')" rows="6"></textarea>
    </div>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>会员列表</h3>
          <p>查看会员状态、所属顾问和最近一次客服操作。</p>
        </div>
      </div>

      <form class="admin-filter-panel membership-filter-panel" @submit.prevent="submitMembershipFilters" @reset.prevent="resetMembershipFilters">
        <label class="field membership-filter-panel__search">
          <span>会员搜索</span>
          <input v-model="filters.search" type="search" placeholder="姓名 / 邮箱 / 手机号 / 微信" />
        </label>
        <label class="field">
          <span>会员周期</span>
          <input v-model="filters.cycle" type="text" />
        </label>
        <label class="field">
          <span>会员状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="unused">有效</option>
            <option value="selected">已选择权益</option>
            <option value="reserved">已登记权益</option>
            <option value="used">权益已使用</option>
            <option value="manual">人工记录</option>
            <option value="cancelled">已作废</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <label class="field">
          <span>权益类型</span>
          <select v-model="filters.benefitType">
            <option value="">全部</option>
            <option value="storage">寄存</option>
            <option value="pickup">接机</option>
            <option value="moving">搬家</option>
            <option value="welcome_pack">新生礼包</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>每页</span>
          <select v-model.number="filters.pageSize" @change="loadMemberships(1)">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
        <div class="filter-actions membership-filter-panel__actions">
          <button class="primary-button" type="submit">刷新列表</button>
          <button class="secondary-button" type="reset">重置</button>
        </div>
      </form>

      <LoadingState v-if="membershipLoading">正在加载会员权益数据...</LoadingState>
      <ErrorState v-else-if="membershipError" :message="membershipError" />
      <EmptyState v-else-if="!hasMemberships" title="暂无会员数据" description="可以调整搜索、周期、状态或权益类型后重试。" />
      <template v-else>
        <AdminTable :columns="membershipColumns" :rows="memberships" row-clickable @row-click="openMembershipDetail($event, 'overview')">
          <template #cell-user="{ row }">
            <strong class="cell-truncate" :title="userLabel(row.user)">{{ userLabel(row.user) }}</strong>
          </template>
          <template #cell-contact="{ row }">
            <span class="cell-truncate" :title="contactLabel(row.user)">{{ contactLabel(row.user) }}</span>
          </template>
          <template #cell-membership_cycle="{ row }">
            <span class="cell-truncate">{{ displayValue(row.membership_cycle) }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(membershipStatus(row))">{{ statusLabel(membershipStatus(row)) }}</StatusBadge>
          </template>
          <template #cell-benefit_type="{ row }">
            <span class="cell-truncate" :title="benefitLabel(row.claim?.benefit_type)">{{ benefitLabel(row.claim?.benefit_type) }}</span>
          </template>
          <template #cell-advisor="{ row }">
            <span class="cell-truncate" :title="adminLabel(row.advisor)">{{ adminLabel(row.advisor) }}</span>
          </template>
          <template #cell-last_operation="{ row }">
            <span class="membership-last-operation" :title="lastOperationTitle(row.last_operation)">
              <strong>{{ adminLabel(row.last_operation?.admin_user) }}</strong>
              <span>{{ formatDateTime(row.last_operation?.created_at) }}</span>
              <span>{{ actionLabel(row.last_operation?.action) }}</span>
            </span>
          </template>
          <template #cell-created_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <div class="table-action-group table-action-group--compact">
              <button class="table-action-button" type="button" :disabled="Boolean(actionLoading)" @click="registerMembershipClaim(row)">
                {{ actionLoading === `claim:${row.id}` ? "保存中..." : (row.claim?.status === "cancelled" ? "重新登记权益" : "登记权益") }}
              </button>
              <button
                v-if="canUnbindMembershipOrder(row)"
                class="table-action-button"
                type="button"
                :disabled="Boolean(actionLoading)"
                @click="unbindMembershipOrder(row)"
              >
                {{ actionLoading === `unbind:${row.id}` ? "更新中..." : "更新权益" }}
              </button>
              <button class="table-action-button" type="button" @click="openMembershipDetail(row, 'overview')">权益详情</button>
              <button class="table-action-button" type="button" @click="openMembershipDetail(row, 'logs')">操作记录</button>
              <button class="table-action-button table-action-button--danger" type="button" :disabled="Boolean(actionLoading)" @click="removeMembership(row)">
                {{ actionLoading === `membership:${row.id}` ? "删除中..." : "删除" }}
              </button>
            </div>
          </template>
        </AdminTable>
        <Pagination :pagination="membershipPagination" @change="loadMemberships" />
      </template>
    </section>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>一次性会员激活码</h3>
          <p>查看激活码前缀、状态、创建人和兑换记录。</p>
        </div>
        <div class="table-action-group">
          <button class="secondary-button" type="button" :disabled="Boolean(actionLoading)" @click="generateMembershipCode">
            {{ actionLoading === "code" ? "生成中..." : "生成激活码" }}
          </button>
          <button class="primary-button" type="button" :disabled="Boolean(actionLoading)" @click="openBatchCodeDialog">
            批量生成激活码
          </button>
        </div>
      </div>

      <form class="admin-filter-panel membership-code-filter-panel" @submit.prevent="submitCodeFilters" @reset.prevent="resetCodeFilters">
        <label class="field membership-code-filter-panel__search">
          <span>搜索激活码</span>
          <input v-model="codeFilters.search" type="search" placeholder="激活码前缀 / 邮箱 / 手机号 / 订单参考" />
        </label>
        <label class="field">
          <span>会员周期</span>
          <input v-model="codeFilters.cycle" type="text" />
        </label>
        <label class="field">
          <span>状态</span>
          <select v-model="codeFilters.status">
            <option value="">全部</option>
            <option value="active">有效</option>
            <option value="redeemed">已兑换</option>
            <option value="revoked">已作废</option>
            <option value="expired">已过期</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>每页</span>
          <select v-model.number="codeFilters.pageSize" @change="loadCodes(1)">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
        <div class="filter-actions membership-code-filter-panel__actions">
          <button class="primary-button" type="submit">搜索</button>
          <button class="secondary-button" type="reset">重置</button>
        </div>
      </form>

      <LoadingState v-if="codeLoading">正在加载会员激活码...</LoadingState>
      <ErrorState v-else-if="codeError" :message="codeError" />
      <EmptyState v-else-if="!hasCodes" title="暂无会员激活码" description="可以调整周期、状态或激活码前缀后重试。" />
      <template v-else>
        <AdminTable :columns="codeColumns" :rows="codes">
          <template #cell-code_prefix="{ row }">
            <strong class="cell-truncate" :title="displayValue(row.code_prefix)">{{ displayValue(row.code_prefix) }}</strong>
          </template>
          <template #cell-membership_cycle="{ row }">
            <span class="cell-truncate">{{ displayValue(row.membership_cycle) }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
          </template>
          <template #cell-generated_by_admin="{ row }">
            <span class="cell-truncate" :title="adminLabel(row.generated_by_admin)">{{ adminLabel(row.generated_by_admin) }}</span>
          </template>
          <template #cell-redeemed_by_user="{ row }">
            <span class="cell-truncate" :title="userLabel(row.redeemed_by_user)">{{ userLabel(row.redeemed_by_user) }}</span>
          </template>
          <template #cell-redeemed_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.redeemed_at)">{{ formatDateTime(row.redeemed_at) }}</span>
          </template>
          <template #cell-created_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <button
              class="table-action-button table-action-button--danger"
              type="button"
              :disabled="Boolean(actionLoading) || row.status === 'redeemed'"
              @click="removeMembershipCode(row)"
            >
              {{ row.status === "redeemed" ? "已兑换" : (actionLoading === `code:${row.id}` ? "删除中..." : "删除") }}
            </button>
          </template>
        </AdminTable>
        <Pagination :pagination="codePagination" @change="loadCodes" />
      </template>
    </section>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>最近生日会员</h3>
          <p>查看最近 30 天内过生日的有效会员，方便客服补充祝福和跟进。</p>
        </div>
        <button class="secondary-button" type="button" :disabled="birthdayLoading" @click="loadBirthdays">
          {{ birthdayLoading ? "刷新中..." : "刷新生日记录" }}
        </button>
      </div>

      <LoadingState v-if="birthdayLoading">正在加载最近生日会员...</LoadingState>
      <ErrorState v-else-if="birthdayError" :message="birthdayError" />
      <EmptyState
        v-else-if="!hasBirthdays"
        title="最近暂无会员生日"
        :description="`当前会员周期 ${birthdayRange.cycle || CURRENT_CYCLE} 最近 ${birthdayRange.days || 30} 天内没有生日记录。`"
      />
      <AdminTable v-else :columns="birthdayColumns" :rows="birthdays">
        <template #cell-birthday="{ row }">
          <span class="membership-last-operation">
            <strong>{{ formatBirthday(row) }}</strong>
            <span>{{ birthdayDistanceLabel(row.days_ago) }}</span>
          </span>
        </template>
        <template #cell-user="{ row }">
          <strong class="cell-truncate" :title="userLabel(row.user)">{{ userLabel(row.user) }}</strong>
        </template>
        <template #cell-contact="{ row }">
          <span class="cell-truncate" :title="contactLabel(row.user)">{{ contactLabel(row.user) }}</span>
        </template>
        <template #cell-membership_cycle="{ row }">
          <span class="cell-truncate">{{ displayValue(row.membership_cycle) }}</span>
        </template>
        <template #cell-benefit_type="{ row }">
          <span class="cell-truncate" :title="benefitLabel(row.claim?.benefit_type)">{{ benefitLabel(row.claim?.benefit_type) }}</span>
        </template>
        <template #cell-advisor="{ row }">
          <span class="cell-truncate" :title="adminLabel(row.advisor)">{{ adminLabel(row.advisor) }}</span>
        </template>
        <template #cell-reminder="{ row }">
          <span class="membership-last-operation">
            <strong>{{ reminderStatusLabel(row.last_birthday_reminder) }}</strong>
            <span>{{ formatDateTime(row.last_birthday_reminder?.created_at) }}</span>
          </span>
        </template>
        <template #cell-actions="{ row }">
          <button class="table-action-button" type="button" @click="openMembershipDetail(row, 'overview')">查看详情</button>
        </template>
      </AdminTable>
    </section>

    <div v-if="batchCodeForm.open" class="membership-modal" role="dialog" aria-modal="true" aria-label="批量生成激活码">
      <div class="membership-modal__backdrop" @click="closeBatchCodeDialog"></div>
      <section class="membership-modal__panel">
        <header class="membership-modal__header">
          <div>
            <h3>批量生成激活码</h3>
            <p>生成后会刷新激活码列表，完整码只在本次结果中显示。</p>
          </div>
          <button class="table-action-button" type="button" :disabled="actionLoading === 'batch-code'" @click="closeBatchCodeDialog">关闭</button>
        </header>
        <form class="admin-filter-panel membership-batch-code-form" @submit.prevent="submitBatchCodeForm">
          <label class="field">
            <span>生成数量</span>
            <input v-model.number="batchCodeForm.count" type="number" min="1" max="200" required />
          </label>
          <label class="field">
            <span>会员周期</span>
            <input v-model="batchCodeForm.membership_cycle" type="text" required />
          </label>
          <label class="field">
            <span>权益类型</span>
            <select v-model="batchCodeForm.benefit_type">
              <option value="">不指定</option>
              <option value="pickup">接机</option>
              <option value="storage">寄存</option>
              <option value="moving">搬家</option>
              <option value="welcome_pack">新生礼包</option>
            </select>
          </label>
          <label class="field">
            <span>所属顾问</span>
            <input type="text" value="当前管理员" disabled />
          </label>
          <label class="field membership-batch-code-form__notes">
            <span>备注</span>
            <textarea v-model="batchCodeForm.notes" rows="3" placeholder="可选"></textarea>
          </label>
          <div class="filter-actions membership-batch-code-form__actions">
            <button class="primary-button" type="submit" :disabled="actionLoading === 'batch-code'">
              {{ actionLoading === "batch-code" ? "生成中..." : "确认生成" }}
            </button>
            <button class="secondary-button" type="button" :disabled="actionLoading === 'batch-code'" @click="closeBatchCodeDialog">取消</button>
          </div>
        </form>
      </section>
    </div>
  </section>
</template>
