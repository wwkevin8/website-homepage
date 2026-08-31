<script setup>
import { computed, reactive, ref, watch } from "vue";
import {
  fetchTransportMembershipContext,
  manageTransportMembership,
  searchTransportMembershipMembers
} from "@/api/admin-api";

const props = defineProps({
  open: Boolean,
  request: { type: Object, default: null },
  adminRole: { type: String, default: "" }
});
const emit = defineEmits(["close", "saved"]);

const context = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const mode = ref("view");
const search = ref("");
const searching = ref(false);
const candidates = ref([]);
const searchPagination = ref({ page: 1, total: 0, total_pages: 0, capped: false });
const selectedMember = ref(null);
const selectedEntitlement = ref(null);
const submitting = ref(false);
const operationKey = ref("");
const uncertain = ref(false);
const form = reactive({ reason: "", paymentConfirmed: false, mismatchConfirmed: false, finalConfirmed: false, force: false });

const order = computed(() => context.value?.order || props.request || {});
const relation = computed(() => context.value?.relation || {});
const current = computed(() => context.value?.current || null);
const isSuperAdmin = computed(() => props.adminRole === "super_admin");
const isLinked = computed(() => relation.value.membership_relation === "linked");
const isUsed = computed(() => ["used", "manual"].includes(current.value?.claim?.status));
const hasConflict = computed(() => Boolean(relation.value.has_conflict));
const isPaid = computed(() => ["deposit_paid", "fully_paid"].includes(order.value.payment_collection_status));
const contactMismatch = computed(() => selectedMember.value && !selectedMember.value.contact_match?.any);
const canSearch = computed(() => mode.value === "link" || mode.value === "replace");
const canMutateUsed = computed(() => isSuperAdmin.value);
const advisorChanged = computed(() => Boolean(relation.value.advisor_changed));
const operationLabel = computed(() => ({ link: "关联会员权益", replace: "更换会员权益", unlink: isUsed.value ? "历史纠错解除" : "解除会员权益" }[mode.value] || "会员权益关联"));
const paymentLabel = computed(() => ({ unpaid: "未收款", deposit_paid: "已付定金", fully_paid: "已付全款" }[order.value.payment_collection_status] || order.value.payment_collection_status || "--"));
const selectedAvailable = computed(() => Boolean(selectedEntitlement.value?.available));
const submitDisabledReason = computed(() => {
  if (!form.reason.trim()) return "请填写操作原因";
  if ((mode.value === "link" || mode.value === "replace") && !selectedEntitlement.value) return "请选择一条会员权益";
  if ((mode.value === "link" || mode.value === "replace") && !selectedAvailable.value) return selectedEntitlement.value?.reason || "所选权益不可用";
  if (isPaid.value && !form.paymentConfirmed) return "请确认已知晓付款不会自动变化";
  if (contactMismatch.value && !form.mismatchConfirmed) return "联系方式不一致，请确认后继续";
  if (["replace", "unlink"].includes(mode.value) && !form.finalConfirmed) return "请完成二次确认";
  if (isUsed.value && !isSuperAdmin.value) return "已使用权益只能由超级管理员纠错";
  if (hasConflict.value && !isSuperAdmin.value) return "关联冲突只能由超级管理员处理";
  if (hasConflict.value && !form.force) return "请明确勾选强制纠错";
  return "";
});

function resetOperation() {
  selectedMember.value = null;
  selectedEntitlement.value = null;
  candidates.value = [];
  search.value = "";
  operationKey.value = "";
  uncertain.value = false;
  error.value = "";
  notice.value = "";
  Object.assign(form, { reason: "", paymentConfirmed: false, mismatchConfirmed: false, finalConfirmed: false, force: false });
}

async function loadContext() {
  if (!props.request?.id) return;
  loading.value = true;
  error.value = "";
  try {
    context.value = await fetchTransportMembershipContext(props.request.id);
    mode.value = context.value?.relation?.membership_relation === "linked" ? "view" : "link";
  } catch (err) {
    error.value = err.message || "会员关联信息加载失败";
  } finally {
    loading.value = false;
  }
}

function startMode(nextMode) {
  resetOperation();
  mode.value = nextMode;
}

async function runSearch(page = 1) {
  if (search.value.trim().length < 2) {
    error.value = "请输入至少 2 个字符";
    return;
  }
  searching.value = true;
  error.value = "";
  try {
    const payload = await searchTransportMembershipMembers(order.value.id, search.value.trim(), page, 10);
    candidates.value = payload?.items || [];
    searchPagination.value = payload?.pagination || { page, total: candidates.value.length, total_pages: 1 };
  } catch (err) {
    candidates.value = [];
    error.value = err.message || "会员搜索失败";
  } finally {
    searching.value = false;
  }
}

function chooseMember(member) {
  selectedMember.value = member;
  selectedEntitlement.value = null;
  error.value = "";
}

function chooseEntitlement(entitlement) {
  selectedEntitlement.value = entitlement;
}

function generateKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const value = Math.random() * 16 | 0;
    return (char === "x" ? value : (value & 3 | 8)).toString(16);
  });
}

async function submit() {
  if (submitDisabledReason.value || submitting.value) return;
  const warning = isUsed.value
    ? "该权益已经使用。历史纠错不会将权益恢复为可用，并会永久记录本次操作。确认继续？"
    : hasConflict.value
      ? "当前关联数据存在冲突。确认以超级管理员强制纠错方式继续？"
      : `${operationLabel.value}将写入真实订单—权益关系，确认继续？`;
  if (!window.confirm(warning)) return;
  if (!operationKey.value) operationKey.value = generateKey();
  submitting.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = {
      action: mode.value,
      idempotency_key: operationKey.value,
      expected_current_claim_id: relation.value.expected_current_claim_id || null,
      reason: form.reason.trim()
    };
    if (mode.value !== "unlink") {
      payload.entitlement_id = selectedEntitlement.value.id;
      payload.claim_id = selectedEntitlement.value.claim?.id || null;
    }
    if (isUsed.value) payload.confirm_used = true;
    if (hasConflict.value && form.force) payload.force = true;
    await manageTransportMembership(order.value.id, payload);
    uncertain.value = false;
    const successMessage = `${operationLabel.value}已完成，订单数据已重新加载。`;
    emit("saved", { id: order.value.id, action: mode.value });
    resetOperation();
    await loadContext();
    notice.value = successMessage;
  } catch (err) {
    if (!err.status || err.status >= 500) {
      uncertain.value = true;
      error.value = "请求结果暂不确定。请先核查当前关联；如需重试，本弹窗会沿用同一个幂等键。";
    } else {
      operationKey.value = "";
      error.value = err.message || "会员关联操作失败";
      if (/changed|refresh|变化|刷新|冲突/i.test(error.value)) {
        error.value += " 请点击“重新加载当前关联”后再处理。";
      }
    }
  } finally {
    submitting.value = false;
  }
}

watch(() => props.open, open => {
  if (open) {
    resetOperation();
    loadContext();
  }
});
</script>

<template>
  <div v-if="open" class="membership-modal transport-membership-dialog" role="dialog" aria-modal="true" aria-label="订单会员权益关联">
    <button class="membership-modal__backdrop" type="button" aria-label="关闭" @click="emit('close')"></button>
    <section class="membership-modal__panel transport-membership-dialog__panel">
      <header class="membership-modal__header">
        <div><h3>订单会员权益关联</h3><p>{{ order.order_no || order.id }}</p></div>
        <button class="table-action-button" type="button" :disabled="submitting" @click="emit('close')">关闭</button>
      </header>

      <div class="transport-membership-dialog__body">
        <p v-if="error" class="inline-notice inline-notice--danger">{{ error }}</p>
        <p v-if="notice" class="inline-notice">{{ notice }}</p>
        <p v-if="loading">正在加载真实关联状态...</p>
        <template v-else>
          <section class="membership-dialog-section">
            <h4>订单原始信息</h4>
            <dl class="membership-info-grid">
              <div><dt>订单号</dt><dd>{{ order.order_no || "--" }}</dd></div>
              <div><dt>学生姓名</dt><dd>{{ order.student_name || "--" }}</dd></div>
              <div><dt>手机号</dt><dd>{{ order.phone || "--" }}</dd></div>
              <div><dt>微信号</dt><dd>{{ order.wechat || "--" }}</dd></div>
              <div><dt>邮箱</dt><dd>{{ order.email || "--" }}</dd></div>
              <div><dt>航班</dt><dd>{{ order.flight_no || "--" }} / {{ order.flight_datetime || "--" }}</dd></div>
              <div><dt>收款状态</dt><dd>{{ paymentLabel }}</dd></div>
              <div><dt>订单用户</dt><dd>{{ order.site_user_id || "尚未绑定 site_user_id" }}</dd></div>
            </dl>
          </section>

          <section v-if="isLinked" class="membership-dialog-section">
            <h4>当前真实关联</h4>
            <p v-if="hasConflict" class="membership-warning membership-warning--danger">当前存在 {{ relation.claim_resolution }} / {{ relation.advisor_resolution }} 异常。普通管理员不能覆盖。</p>
            <dl class="membership-info-grid">
              <div><dt>会员</dt><dd>{{ current?.member?.nickname || "--" }} / {{ current?.member?.public_user_id || current?.member?.id || "--" }}</dd></div>
              <div><dt>周期</dt><dd>{{ current?.entitlement?.membership_cycle || current?.claim?.membership_cycle || "--" }}</dd></div>
              <div><dt>Claim 状态</dt><dd>{{ current?.claim?.status || "异常/未知" }}</dd></div>
              <div><dt>订单顾问快照</dt><dd>{{ relation.advisor_snapshot?.name || "未分配" }}</dd></div>
              <div><dt>当前会员顾问</dt><dd>{{ relation.current_advisor?.name || "未分配" }}</dd></div>
              <div><dt>关联时间</dt><dd>{{ relation.linked_at || "历史关联/未知" }}</dd></div>
              <div><dt>关联管理员</dt><dd>{{ relation.linked_by?.name || "历史关联/未知" }}</dd></div>
              <div><dt>顾问变化</dt><dd>{{ advisorChanged ? "是，请核对" : "否" }}</dd></div>
            </dl>
            <p v-if="isUsed" class="membership-warning membership-warning--danger">这是已使用权益。不会恢复为可用；仅超级管理员可进行历史纠错。</p>
            <div v-if="mode === 'view'" class="membership-dialog-actions">
              <button v-if="!isUsed && !hasConflict" class="secondary-button" type="button" @click="startMode('replace')">更换权益</button>
              <button v-if="!isUsed && !hasConflict" class="table-action-button table-action-button--danger" type="button" @click="startMode('unlink')">解除关联</button>
              <button v-if="isUsed && canMutateUsed" class="table-action-button table-action-button--danger" type="button" @click="startMode('unlink')">进入历史纠错</button>
              <button v-if="hasConflict && isSuperAdmin" class="table-action-button table-action-button--danger" type="button" @click="startMode('unlink')">进入强制纠错</button>
              <span v-if="(isUsed || hasConflict) && !isSuperAdmin" class="detail-muted">仅可查看，请联系超级管理员处理。</span>
            </div>
          </section>

          <template v-if="canSearch">
            <section class="membership-dialog-section">
              <h4>搜索并明确选择会员</h4>
              <div class="membership-search-row">
                <input v-model="search" placeholder="User ID、手机号、微信号、邮箱或姓名" @keyup.enter="runSearch(1)" />
                <button class="primary-button" type="button" :disabled="searching" @click="runSearch(1)">{{ searching ? "搜索中..." : "搜索" }}</button>
              </div>
              <p class="detail-muted">姓名只用于查找候选；系统不会根据姓名或唯一结果自动选择。</p>
              <article v-for="member in candidates" :key="member.id" :class="['membership-candidate', { 'membership-candidate--selected': selectedMember?.id === member.id }]">
                <div><strong>{{ member.nickname || "未填写姓名" }}</strong><span>{{ member.public_user_id || member.id }}</span></div>
                <div><span>手机 {{ member.phone_masked || "--" }}</span><span>邮箱 {{ member.email_masked || "--" }}</span><span>微信 {{ member.wechat_id || "--" }}</span></div>
                <div><span>{{ member.entitlements.length }} 条会员资格</span><span :class="member.contact_match?.any ? 'text-success' : 'text-danger'">{{ member.contact_match?.any ? "与订单至少一项联系方式一致" : "与订单联系方式不一致" }}</span></div>
                <button class="table-action-button" type="button" @click="chooseMember(member)">明确选择此会员</button>
              </article>
              <div v-if="searchPagination.total_pages > 1" class="membership-search-pages">
                <button type="button" :disabled="searchPagination.page <= 1" @click="runSearch(searchPagination.page - 1)">上一页</button>
                <span>{{ searchPagination.page }} / {{ searchPagination.total_pages }}（最多展示 60 条匹配）</span>
                <button type="button" :disabled="searchPagination.page >= searchPagination.total_pages" @click="runSearch(searchPagination.page + 1)">下一页</button>
              </div>
            </section>

            <section v-if="selectedMember" class="membership-dialog-section">
              <h4>选择接机权益</h4>
              <p v-if="contactMismatch" class="membership-warning">所选会员与订单联系方式不一致。允许继续，但必须填写原因并明确确认。</p>
              <p v-if="!selectedMember.entitlements.length" class="membership-warning membership-warning--danger">该用户没有会员资格，不能在本弹窗中创建。</p>
              <label v-for="entitlement in selectedMember.entitlements" :key="entitlement.id" :class="['membership-entitlement-option', { 'is-unavailable': !entitlement.available }]">
                <input type="radio" name="transport-membership-entitlement" :disabled="!entitlement.available" :checked="selectedEntitlement?.id === entitlement.id" @change="chooseEntitlement(entitlement)" />
                <span><strong>{{ entitlement.membership_cycle }} / {{ entitlement.status }}</strong><small>有效期 {{ entitlement.valid_from || "--" }} 至 {{ entitlement.valid_until || "--" }}</small><small>顾问：{{ entitlement.advisor?.name || "未分配" }}；Claim：{{ entitlement.claim?.benefit_type || "未选择" }} / {{ entitlement.claim?.status || "无" }}</small><em>{{ entitlement.reason }}</em></span>
              </label>
              <p v-if="selectedEntitlement?.creates_claim" class="membership-warning">该会员尚未选择本周期权益。确认关联后，将把本周期权益选择为“接机”。</p>
            </section>
          </template>

          <section v-if="mode !== 'view'" class="membership-dialog-section membership-operation-form">
            <h4>{{ operationLabel }}</h4>
            <p v-if="isPaid" class="membership-warning">本操作只建立会员、权益和顾问归属，不会自动退款、抵扣、修改金额或改变收款状态。</p>
            <label>操作原因<textarea v-model="form.reason" rows="3" placeholder="请写明实际原因；可参考：学生提交时忘记使用会员权益、原会员关联错误等"></textarea></label>
            <label v-if="isPaid"><input v-model="form.paymentConfirmed" type="checkbox" /> 我已知晓付款、金额及收款状态不会自动变化</label>
            <label v-if="contactMismatch"><input v-model="form.mismatchConfirmed" type="checkbox" /> 我已核对身份，并确认在联系方式不一致的情况下继续</label>
            <label v-if="mode === 'replace' || mode === 'unlink'"><input v-model="form.finalConfirmed" type="checkbox" /> 我已核对当前关联并确认执行{{ operationLabel }}</label>
            <label v-if="hasConflict && isSuperAdmin" class="text-danger"><input v-model="form.force" type="checkbox" /> 明确使用超级管理员强制纠错（默认不勾选）</label>
            <p v-if="submitDisabledReason" class="detail-muted">{{ submitDisabledReason }}</p>
            <p v-if="uncertain" class="membership-warning">再次提交将沿用原幂等键，不会创建第二次操作。</p>
          </section>
        </template>
      </div>

      <footer class="transport-membership-dialog__footer">
        <button v-if="mode !== 'view' && isLinked" class="secondary-button" type="button" :disabled="submitting" @click="startMode('view')">返回查看</button>
        <button class="secondary-button" type="button" :disabled="loading || submitting" @click="loadContext">重新加载当前关联</button>
        <button v-if="mode !== 'view'" class="primary-button" type="button" :disabled="Boolean(submitDisabledReason) || submitting" @click="submit">{{ submitting ? "处理中..." : uncertain ? "使用相同幂等键重试" : operationLabel }}</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.transport-membership-dialog__panel{width:min(920px,calc(100vw - 24px));max-height:calc(100vh - 24px);display:flex;flex-direction:column;overflow:hidden}.transport-membership-dialog__body{padding:16px;overflow:auto;display:grid;gap:14px}.membership-dialog-section{border:1px solid #e3e8ef;border-radius:10px;padding:14px;background:#fff}.membership-dialog-section h4{margin:0 0 12px}.membership-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0}.membership-info-grid div{min-width:0}.membership-info-grid dt{font-size:12px;color:#667085}.membership-info-grid dd{margin:3px 0 0;overflow-wrap:anywhere}.membership-search-row{display:grid;grid-template-columns:1fr auto;gap:8px}.membership-search-row input,.membership-operation-form textarea{width:100%;box-sizing:border-box}.membership-candidate{display:grid;grid-template-columns:1.1fr 1.5fr 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid #edf0f4}.membership-candidate>div{display:flex;flex-direction:column;min-width:0;overflow-wrap:anywhere}.membership-candidate--selected{background:#f2f8ff}.membership-entitlement-option{display:flex;gap:10px;padding:10px;border:1px solid #d8e0ea;border-radius:8px;margin-top:8px}.membership-entitlement-option input[type=radio],.membership-operation-form input[type=checkbox]{flex:0 0 auto;width:16px!important;height:16px!important;min-width:16px!important;min-height:16px!important;margin:2px 0}.membership-entitlement-option>span{display:flex;flex-direction:column;gap:3px}.membership-entitlement-option em{font-style:normal;color:#18603a}.membership-entitlement-option.is-unavailable{background:#f8f8f8;color:#7a7a7a}.membership-entitlement-option.is-unavailable em{color:#a62929}.membership-warning{padding:10px;border-radius:8px;background:#fff5d6;color:#714b00}.membership-warning--danger{background:#fff0f0;color:#9b1c1c}.membership-dialog-actions,.transport-membership-dialog__footer,.membership-search-pages{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.transport-membership-dialog__footer{padding:12px 16px;border-top:1px solid #e3e8ef;justify-content:flex-end;background:#fff}.membership-operation-form{display:grid;gap:10px}.membership-operation-form label{display:grid;gap:6px}.membership-operation-form label:has(input[type=checkbox]){display:flex}.text-danger{color:#a62929}.text-success{color:#176b3a}.detail-muted{color:#667085;font-size:12px}@media(max-width:720px){.membership-info-grid{grid-template-columns:1fr}.membership-candidate{grid-template-columns:1fr}.transport-membership-dialog__body{padding:10px}.transport-membership-dialog__footer{position:sticky;bottom:0}.membership-search-row{grid-template-columns:1fr}.membership-search-row button{width:100%}}
</style>
