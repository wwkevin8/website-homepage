<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchCommunityPostDetail } from "@/api/admin-api";
import BackButton from "@/components/BackButton.vue";
import DetailSection from "@/components/DetailSection.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import JsonPreview from "@/components/JsonPreview.vue";
import LoadingState from "@/components/LoadingState.vue";
import ReadonlyField from "@/components/ReadonlyField.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const route = useRoute();
const detail = ref(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const postId = computed(() => String(route.params.id || "").trim());
const post = computed(() => detail.value?.post || null);
const userRisk = computed(() => detail.value?.user_risk || null);
const images = computed(() => Array.isArray(detail.value?.images) ? detail.value.images : []);
const comments = computed(() => Array.isArray(detail.value?.comments) ? detail.value.comments : []);
const postReports = computed(() => Array.isArray(detail.value?.post_reports) ? detail.value.post_reports : []);

function firstValue(...values) {
  return values.find(value => value !== null && value !== undefined && String(value).trim() !== "");
}

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

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? `GBP ${amount.toFixed(2)}` : displayValue(value);
}

function categoryLabel(category) {
  const labels = {
    buddy: "找搭子",
    second_hand: "二手交易",
    sublet: "转租 / 短租",
    help: "求助 / 问答",
    official: "官方公告"
  };
  return labels[category] || displayValue(category);
}

function statusLabel(status) {
  const labels = {
    active: "正常显示",
    closed: "已关闭",
    published: "已发布",
    hidden: "已隐藏",
    expired: "已过期",
    deleted: "已删除"
  };
  return labels[status] || displayValue(status);
}

function statusTone(status) {
  if (status === "active" || status === "published") {
    return "success";
  }
  if (status === "hidden" || status === "expired") {
    return "warning";
  }
  if (status === "deleted") {
    return "danger";
  }
  return "neutral";
}

function userLabel(user, fallback = "") {
  if (!user) {
    return fallback || "--";
  }
  return user.email || user.nickname || user.public_user_id || user.id || fallback || "--";
}

function postTitle(record = post.value) {
  return record?.title || record?.id || "当前帖子";
}

function commentSubject(comment) {
  return comment?.id || userLabel(comment?.user, "当前评论");
}

function listHref() {
  const returnTo = String(route.query.return_to || "");
  return returnTo.startsWith("/admin-vue/community") ? returnTo : "/admin-vue/community";
}



function field(label, value, multiline = false) {
  return { label, value: displayValue(value), multiline };
}

const baseFields = computed(() => [
  field("帖子 ID", post.value?.id),
  field("标题", post.value?.title),
  field("内容摘要", post.value?.content, true),
  field("分类", categoryLabel(post.value?.category)),
  field("状态", statusLabel(post.value?.display_status || post.value?.status)),
  field("城市 / 校区 / 区域", [post.value?.city, post.value?.university, post.value?.area].filter(Boolean).join(" / ")),
  field("价格", formatMoney(post.value?.price)),
  field("创建时间", formatDateTime(post.value?.created_at)),
  field("更新时间", formatDateTime(post.value?.updated_at))
]);

const publisherFields = computed(() => [
  field("用户名", userLabel(userRisk.value, post.value?.user_id)),
  field("邮箱", firstValue(userRisk.value?.email, post.value?.contact_email)),
  field("电话", post.value?.contact_phone),
  field("微信", post.value?.contact_wechat),
  field("用户风险状态", userRisk.value?.posting_permission_status),
  field("封禁至", formatDateTime(userRisk.value?.banned_until)),
  field("信任分", userRisk.value?.trust_score),
  field("举报次数", userRisk.value?.report_count)
]);

const reportFields = computed(() => [
  field("举报数量", post.value?.report_count),
  field("浏览数", post.value?.view_count),
  field("评论数", post.value?.comment_count)
]);

function showPlaceholder(action, subject = postTitle()) {
  notice.value = `${action}会在后续迁移阶段实现；当前 Vue 社区详情页不会发起修改请求：${displayValue(subject)}`;
}

async function loadDetail() {
  if (!postId.value) {
    detail.value = null;
    error.value = "缺少帖子 ID。";
    return;
  }
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    detail.value = await fetchCommunityPostDetail(postId.value);
  } catch (err) {
    detail.value = null;
    error.value = err.message || "社区帖子详情加载失败";
  } finally {
    loading.value = false;
  }
}

onMounted(loadDetail);
</script>

<template>
  <section class="community-post-detail-view storage-detail-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Community readonly detail</p>
        <h2>社区帖子详情</h2>
      </div>
      <div class="view-heading__actions">
        <BackButton :href="listHref()" label="返回社区管理" />
      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>
    <LoadingState v-if="loading">正在加载社区帖子详情...</LoadingState>
    <ErrorState v-else-if="error" :message="error" />
    <EmptyState v-else-if="!post" title="未找到社区帖子" description="请从社区管理列表重新进入详情页。" />

    <template v-else>
      <div class="detail-summary-bar">
        <div>
          <span>帖子标题</span>
          <strong>{{ postTitle() }}</strong>
        </div>
        <StatusBadge :tone="statusTone(post.display_status || post.status)">
          {{ statusLabel(post.display_status || post.status) }}
        </StatusBadge>
      </div>

      <DetailSection title="帖子基础信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in baseFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="发布用户信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in publisherFields" :key="item.label" v-bind="item" />
        </div>
      </DetailSection>

      <DetailSection title="图片信息" description="只读展示图片状态和 signed_url 链接，不实现删图。">
        <div v-if="images.length" class="community-image-list">
          <article v-for="image in images" :key="image.id">
            <span>{{ displayValue(image.status) }} / {{ displayValue(image.file_type) }} / {{ Number(image.file_size || 0) }} bytes</span>
            <span class="cell-truncate" :title="displayValue(image.storage_path)">{{ displayValue(image.storage_path) }}</span>
            <a v-if="image.signed_url" :href="image.signed_url" target="_blank" rel="noopener">查看图片</a>
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除图片', image.id)">删除图片</button>
          </article>
        </div>
        <p v-else class="detail-muted">暂无图片。</p>
      </DetailSection>

      <DetailSection title="举报信息">
        <div class="readonly-field-grid">
          <ReadonlyField v-for="item in reportFields" :key="item.label" v-bind="item" />
        </div>
        <ul v-if="postReports.length" class="community-detail-list">
          <li v-for="report in postReports" :key="report.id">
            <strong>{{ formatDateTime(report.created_at) }} / {{ userLabel(report.reporter, report.reporter_user_id) }}</strong>
            <span>{{ displayValue(report.reason) }} / {{ displayValue(report.details) }}</span>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无举报记录。</p>
      </DetailSection>

      <DetailSection title="评论信息">
        <ul v-if="comments.length" class="community-detail-list">
          <li v-for="comment in comments" :key="comment.id">
            <strong>{{ formatDateTime(comment.created_at) }} / {{ userLabel(comment.user, comment.user_id) }}</strong>
            <span>{{ statusLabel(comment.status) }} / 举报 {{ Number(comment.report_count || 0) }}</span>
            <span>{{ displayValue(comment.content) }}</span>
            <div class="table-action-group table-action-group--compact">
              <button class="table-action-button" type="button" @click="showPlaceholder('隐藏评论', commentSubject(comment))">隐藏</button>
              <button class="table-action-button" type="button" @click="showPlaceholder('恢复评论', commentSubject(comment))">恢复</button>
              <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除评论', commentSubject(comment))">删除</button>
            </div>
          </li>
        </ul>
        <p v-else class="detail-muted">暂无评论。</p>
      </DetailSection>

      <DetailSection title="原始 / 补充字段" description="复杂字段默认折叠展示，避免撑开页面。">
        <div class="json-preview-grid">
          <JsonPreview title="post" :value="post" />
          <JsonPreview title="user_risk" :value="userRisk" />
          <JsonPreview title="detail payload" :value="detail" />
        </div>
      </DetailSection>

      <DetailSection title="操作区" description="第一轮只读详情不执行隐藏、恢复、删除、置顶、删图、评论处理或封禁。">
        <div class="detail-action-row">
          <button class="table-action-button" type="button" @click="showPlaceholder('隐藏帖子')">隐藏</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('恢复帖子')">恢复</button>
          <button class="table-action-button" type="button" @click="showPlaceholder(post.is_pinned ? '取消置顶' : '置顶帖子')">{{ post.is_pinned ? "取消置顶" : "置顶" }}</button>
          <button class="table-action-button" type="button" @click="showPlaceholder('封禁用户', post.user_id)">封禁用户</button>
          <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除帖子')">删除</button>
        </div>
      </DetailSection>
    </template>
  </section>
</template>
