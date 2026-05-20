<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { fetchCommunityComments, fetchCommunityPosts } from "@/api/admin-api";
import AdminTable from "@/components/AdminTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import ErrorState from "@/components/ErrorState.vue";
import LoadingState from "@/components/LoadingState.vue";
import Pagination from "@/components/Pagination.vue";
import StatusBadge from "@/components/StatusBadge.vue";

const postColumns = [
  { key: "title", label: "帖子", width: "28%" },
  { key: "category", label: "分类", width: "10%" },
  { key: "status", label: "状态", width: "10%" },
  { key: "user", label: "发布者", width: "15%" },
  { key: "published_at", label: "发布时间", width: "11%" },
  { key: "metrics", label: "浏览/评论/举报", width: "10%" },
  { key: "actions", label: "操作", width: "210px", className: "is-actions", sticky: "end" }
];

const commentColumns = [
  { key: "created_at", label: "时间", width: "13%" },
  { key: "user", label: "用户", width: "18%" },
  { key: "status", label: "状态", width: "10%" },
  { key: "report_count", label: "举报", width: "8%", className: "is-number" },
  { key: "content", label: "内容", width: "33%" },
  { key: "actions", label: "操作", width: "170px", className: "is-actions", sticky: "end" }
];

const filters = reactive({
  search: "",
  status: "",
  category: "",
  pageSize: 20
});

const posts = ref([]);
const pagination = ref({ page: 1, page_size: filters.pageSize, total: 0, total_pages: 0 });
const loading = ref(false);
const error = ref("");

const reportedComments = ref([]);
const commentsLoading = ref(false);
const commentsError = ref("");

const selectedDetail = ref(null);
const detailLoading = ref(false);
const detailError = ref("");
const notice = ref("");

const hasPosts = computed(() => posts.value.length > 0);
const hasReportedComments = computed(() => reportedComments.value.length > 0);

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
    sublet: "转租/短租",
    help: "求助/问答",
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

function postTitle(post) {
  return post?.title || post?.id || "当前帖子";
}

function commentSubject(comment) {
  return comment?.id || userLabel(comment?.user, "当前评论");
}

function showPlaceholder(action, subject) {
  notice.value = `${action}将在后续阶段实现：${displayValue(subject)}`;
}

function buildPostQuery(page) {
  return {
    page,
    page_size: filters.pageSize,
    search: filters.search.trim(),
    status: filters.status,
    category: filters.category
  };
}

async function loadPosts(page = pagination.value.page || 1) {
  loading.value = true;
  error.value = "";
  notice.value = "";
  try {
    const payload = await fetchCommunityPosts(buildPostQuery(page));
    posts.value = Array.isArray(payload?.items) ? payload.items : [];
    pagination.value = payload?.pagination || {
      page,
      page_size: filters.pageSize,
      total: posts.value.length,
      total_pages: posts.value.length ? 1 : 0
    };
  } catch (err) {
    posts.value = [];
    error.value = err.message || "社区帖子加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadReportedComments() {
  commentsLoading.value = true;
  commentsError.value = "";
  try {
    const payload = await fetchCommunityComments({ reported: "1", page_size: 20 });
    reportedComments.value = Array.isArray(payload?.items) ? payload.items : [];
  } catch (err) {
    reportedComments.value = [];
    commentsError.value = err.message || "被举报评论加载失败";
  } finally {
    commentsLoading.value = false;
  }
}

async function openDetail(post) {
  if (!post?.id) {
    notice.value = `暂未找到对应帖子详情：${displayValue(postTitle(post))}`;
    return;
  }
  window.location.href = `/admin-vue/community/posts/${encodeURIComponent(post.id)}?return_to=${encodeURIComponent("/admin-vue/community")}`;
}

function submitFilters() {
  loadPosts(1);
}

function resetFilters() {
  Object.assign(filters, {
    search: "",
    status: "",
    category: "",
    pageSize: 20
  });
  loadPosts(1);
}

onMounted(() => {
  loadPosts(1);
  loadReportedComments();
});
</script>

<template>
  <section class="community-view">
    <div class="view-heading">
      <div>
        <p class="view-heading__eyebrow">Readonly community migration</p>
        <h2>社区管理</h2>
      </div>
      <div class="view-heading__actions">

      </div>
    </div>

    <p v-if="notice" class="inline-notice">{{ notice }}</p>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>帖子列表</h3>
          <p>只读查看社区帖子、发布者、状态、互动统计和举报数量。</p>
        </div>
      </div>

      <form class="admin-filter-panel community-filter-panel" @submit.prevent="submitFilters" @reset.prevent="resetFilters">
        <label class="field community-filter-panel__search">
          <span>关键词</span>
          <input v-model="filters.search" type="search" placeholder="标题 / 内容 / 城市 / 学校 / 区域" />
        </label>
        <label class="field">
          <span>状态</span>
          <select v-model="filters.status">
            <option value="">全部</option>
            <option value="active">正常显示</option>
            <option value="closed">已关闭</option>
            <option value="hidden">已隐藏</option>
            <option value="deleted">已删除</option>
          </select>
        </label>
        <label class="field">
          <span>分类</span>
          <select v-model="filters.category">
            <option value="">全部</option>
            <option value="buddy">找搭子</option>
            <option value="second_hand">二手交易</option>
            <option value="sublet">转租/短租</option>
            <option value="help">求助/问答</option>
            <option value="official">官方公告</option>
          </select>
        </label>
        <label class="field field--compact">
          <span>每页</span>
          <select v-model.number="filters.pageSize" @change="loadPosts(1)">
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
        <div class="filter-actions community-filter-panel__actions">
          <button class="primary-button" type="submit">查询</button>
          <button class="secondary-button" type="reset">重置</button>
        </div>
      </form>

      <LoadingState v-if="loading">正在加载社区帖子...</LoadingState>
      <ErrorState v-else-if="error" :message="error" />
      <EmptyState v-else-if="!hasPosts" title="暂无社区帖子" description="可以调整关键词、状态或分类后重试。" />
      <template v-else>
        <AdminTable :columns="postColumns" :rows="posts">
          <template #cell-title="{ row }">
            <div class="cell-stack">
              <strong class="cell-truncate" :title="postTitle(row)">{{ row.is_pinned ? "【置顶】" : "" }}{{ postTitle(row) }}</strong>
              <small :title="[row.city, row.area, formatMoney(row.price)].filter(Boolean).join(' / ')">
                {{ [row.city, row.area, formatMoney(row.price)].filter(Boolean).join(" / ") }}
              </small>
            </div>
          </template>
          <template #cell-category="{ row }">
            <span class="cell-truncate" :title="categoryLabel(row.category)">{{ categoryLabel(row.category) }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(row.display_status || row.status)">{{ statusLabel(row.display_status || row.status) }}</StatusBadge>
          </template>
          <template #cell-user="{ row }">
            <span class="cell-truncate" :title="userLabel(row.user, row.user_id)">{{ userLabel(row.user, row.user_id) }}</span>
          </template>
          <template #cell-published_at="{ row }">
            <span class="cell-truncate" :title="formatDateTime(row.published_at || row.created_at)">{{ formatDateTime(row.published_at || row.created_at) }}</span>
          </template>
          <template #cell-metrics="{ row }">
            <span class="cell-truncate">{{ Number(row.view_count || 0) }} / {{ Number(row.comment_count || 0) }} / {{ Number(row.report_count || 0) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <div class="table-action-group table-action-group--compact">
              <button class="table-action-button" type="button" @click="openDetail(row)">详情</button>
              <button class="table-action-button" type="button" @click="showPlaceholder('隐藏帖子', postTitle(row))">隐藏</button>
              <button class="table-action-button" type="button" @click="showPlaceholder('恢复帖子', postTitle(row))">恢复</button>
              <button class="table-action-button" type="button" @click="showPlaceholder(row.is_pinned ? '取消置顶' : '置顶帖子', postTitle(row))">{{ row.is_pinned ? "取消置顶" : "置顶" }}</button>
              <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除帖子', postTitle(row))">删除</button>
            </div>
          </template>
        </AdminTable>
        <Pagination :pagination="pagination" @change="loadPosts" />
      </template>
    </section>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>被举报评论</h3>
          <p>只读展示近期被举报评论，处理按钮仅为占位提示。</p>
        </div>
        <button class="secondary-button" type="button" @click="loadReportedComments">刷新</button>
      </div>
      <LoadingState v-if="commentsLoading">正在加载被举报评论...</LoadingState>
      <ErrorState v-else-if="commentsError" :message="commentsError" />
      <EmptyState v-else-if="!hasReportedComments" title="暂无被举报评论" description="当前没有需要优先查看的举报评论。" />
      <AdminTable v-else :columns="commentColumns" :rows="reportedComments">
        <template #cell-created_at="{ row }">
          <span class="cell-truncate" :title="formatDateTime(row.created_at)">{{ formatDateTime(row.created_at) }}</span>
        </template>
        <template #cell-user="{ row }">
          <span class="cell-truncate" :title="userLabel(row.user, row.user_id)">{{ userLabel(row.user, row.user_id) }}</span>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge :tone="statusTone(row.status)">{{ statusLabel(row.status) }}</StatusBadge>
        </template>
        <template #cell-content="{ row }">
          <span class="cell-truncate" :title="displayValue(row.content)">{{ displayValue(row.content) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div class="table-action-group table-action-group--compact">
            <button class="table-action-button" type="button" @click="showPlaceholder('隐藏评论', commentSubject(row))">隐藏</button>
            <button class="table-action-button" type="button" @click="showPlaceholder('恢复评论', commentSubject(row))">恢复</button>
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除评论', commentSubject(row))">删除</button>
          </div>
        </template>
      </AdminTable>
    </section>

    <section class="admin-section-panel">
      <div class="section-heading">
        <div>
          <h3>帖子详情</h3>
          <p>点击帖子“详情”后只读展示联系方式、图片、举报记录、评论和用户风险摘要。</p>
        </div>
      </div>
      <LoadingState v-if="detailLoading">正在加载帖子详情...</LoadingState>
      <ErrorState v-else-if="detailError" :message="detailError" />
      <EmptyState v-else-if="!selectedDetail" title="请选择帖子" description="详情区域不会执行任何修改、删除、封禁或置顶操作。" />
      <div v-else class="community-detail-panel">
        <section>
          <div class="community-detail-panel__header">
            <div>
              <h4>{{ postTitle(selectedDetail.post) }}</h4>
              <p>{{ displayValue(selectedDetail.post?.content) }}</p>
            </div>
            <StatusBadge :tone="statusTone(selectedDetail.post?.display_status || selectedDetail.post?.status)">
              {{ statusLabel(selectedDetail.post?.display_status || selectedDetail.post?.status) }}
            </StatusBadge>
          </div>
          <div class="community-detail-grid">
            <div><span>分类</span><strong>{{ categoryLabel(selectedDetail.post?.category) }}</strong></div>
            <div><span>城市/区域</span><strong>{{ displayValue([selectedDetail.post?.city, selectedDetail.post?.area].filter(Boolean).join(" / ")) }}</strong></div>
            <div><span>价格</span><strong>{{ formatMoney(selectedDetail.post?.price) }}</strong></div>
            <div><span>微信</span><strong>{{ displayValue(selectedDetail.post?.contact_wechat) }}</strong></div>
            <div><span>电话</span><strong>{{ displayValue(selectedDetail.post?.contact_phone) }}</strong></div>
            <div><span>Email</span><strong>{{ displayValue(selectedDetail.post?.contact_email) }}</strong></div>
          </div>
          <div class="table-action-group community-detail-actions">
            <button class="table-action-button" type="button" @click="showPlaceholder('隐藏帖子', postTitle(selectedDetail.post))">隐藏帖子</button>
            <button class="table-action-button" type="button" @click="showPlaceholder('恢复帖子', postTitle(selectedDetail.post))">恢复帖子</button>
            <button class="table-action-button" type="button" @click="showPlaceholder(selectedDetail.post?.is_pinned ? '取消置顶' : '置顶帖子', postTitle(selectedDetail.post))">{{ selectedDetail.post?.is_pinned ? "取消置顶" : "置顶帖子" }}</button>
            <button class="table-action-button" type="button" @click="showPlaceholder('封禁用户', selectedDetail.post?.user_id)">封禁发布者</button>
            <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除帖子', postTitle(selectedDetail.post))">删除帖子</button>
          </div>
        </section>

        <section>
          <h4>用户风险摘要</h4>
          <div v-if="selectedDetail.user_risk" class="community-detail-grid">
            <div><span>Email</span><strong>{{ displayValue(selectedDetail.user_risk.email) }}</strong></div>
            <div><span>发帖数</span><strong>{{ Number(selectedDetail.user_risk.post_count || 0) }}</strong></div>
            <div><span>评论数</span><strong>{{ Number(selectedDetail.user_risk.comment_count || 0) }}</strong></div>
            <div><span>举报次数</span><strong>{{ Number(selectedDetail.user_risk.report_count || 0) }}</strong></div>
            <div><span>发布权限</span><strong>{{ displayValue(selectedDetail.user_risk.posting_permission_status) }}</strong></div>
            <div><span>封禁至</span><strong>{{ formatDateTime(selectedDetail.user_risk.banned_until) }}</strong></div>
          </div>
          <p v-else class="detail-muted">暂无用户风险信息。</p>
        </section>

        <section>
          <h4>图片</h4>
          <div v-if="selectedDetail.images?.length" class="community-image-list">
            <article v-for="image in selectedDetail.images" :key="image.id">
              <span>{{ displayValue(image.status) }} / {{ displayValue(image.file_type) }} / {{ Number(image.file_size || 0) }} bytes</span>
              <a v-if="image.signed_url" :href="image.signed_url" target="_blank" rel="noopener">查看图片</a>
              <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除图片', image.id)">删除图片</button>
            </article>
          </div>
          <p v-else class="detail-muted">暂无图片。</p>
        </section>

        <section>
          <h4>帖子举报记录</h4>
          <ul v-if="selectedDetail.post_reports?.length" class="community-detail-list">
            <li v-for="report in selectedDetail.post_reports" :key="report.id">
              <strong>{{ formatDateTime(report.created_at) }}</strong>
              <span>{{ userLabel(report.reporter, report.reporter_user_id) }} / {{ displayValue(report.reason) }} / {{ displayValue(report.details) }}</span>
            </li>
          </ul>
          <p v-else class="detail-muted">暂无举报记录。</p>
        </section>

        <section>
          <h4>评论摘要</h4>
          <ul v-if="selectedDetail.comments?.length" class="community-detail-list">
            <li v-for="comment in selectedDetail.comments" :key="comment.id">
              <strong>{{ formatDateTime(comment.created_at) }} / {{ userLabel(comment.user, comment.user_id) }}</strong>
              <span>{{ displayValue(comment.content) }}</span>
              <div class="table-action-group table-action-group--compact">
                <button class="table-action-button" type="button" @click="showPlaceholder('隐藏评论', commentSubject(comment))">隐藏</button>
                <button class="table-action-button" type="button" @click="showPlaceholder('恢复评论', commentSubject(comment))">恢复</button>
                <button class="table-action-button table-action-button--danger" type="button" @click="showPlaceholder('删除评论', commentSubject(comment))">删除</button>
              </div>
            </li>
          </ul>
          <p v-else class="detail-muted">暂无评论。</p>
        </section>
      </div>
    </section>
  </section>
</template>
