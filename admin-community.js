(function () {
  const AdminApi = window.AdminApi;
  const AdminShell = window.AdminShell;

  if (!AdminApi || !AdminShell) {
    return;
  }

  const CATEGORY_LABELS = {
    buddy: "找搭子",
    second_hand: "二手交易",
    sublet: "转租/短租",
    help: "求助/问答",
    official: "官方公告"
  };
  const STATUS_LABELS = {
    published: "已发布",
    hidden: "已隐藏",
    expired: "已过期",
    deleted: "已删除"
  };

  let currentPage = 1;
  let latestPosts = [];

  function escapeHtml(value) {
    return AdminShell.escapeHtml(value === null || value === undefined ? "" : String(value));
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
    } catch (error) {
      return String(value);
    }
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "--";
    }
    const number = Number(value);
    return Number.isFinite(number) ? `GBP ${number.toFixed(2)}` : String(value);
  }

  function setMessage(text, isError = false) {
    const node = document.querySelector("#adminCommunityMessage");
    if (!node) {
      return;
    }
    node.textContent = text || "";
    node.classList.toggle("is-error", Boolean(text && isError));
    node.classList.toggle("is-success", Boolean(text && !isError));
  }

  function statusBadge(status) {
    const normalized = String(status || "").trim();
    const className = normalized === "published"
      ? "is-success"
      : normalized === "hidden" || normalized === "expired"
        ? "is-warning"
        : normalized === "deleted"
          ? "is-danger"
          : "is-neutral";
    return `<span class="admin-status-badge ${className}">${escapeHtml(STATUS_LABELS[normalized] || normalized || "--")}</span>`;
  }

  function buildFilters() {
    const form = document.querySelector("#adminCommunityFilters");
    const formData = new FormData(form);
    return {
      search: formData.get("search") || "",
      status: formData.get("status") || "",
      category: formData.get("category") || "",
      page: currentPage,
      page_size: 20
    };
  }

  function renderPagination(meta) {
    const container = document.querySelector("#adminCommunityPagination");
    if (!container) {
      return;
    }
    const page = Number(meta?.page || 1);
    const totalPages = Math.max(Number(meta?.total_pages || 1), 1);
    const total = Number(meta?.total || 0);
    container.innerHTML = `
      <button class="button button-secondary" type="button" data-community-page="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span class="transport-pagination-current">第 ${page} / ${totalPages} 页，共 ${total} 条</span>
      <button class="button button-secondary" type="button" data-community-page="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    `;
  }

  function renderPosts(posts, pagination) {
    const container = document.querySelector("#adminCommunityPostsTable");
    if (!container) {
      return;
    }
    latestPosts = posts || [];
    if (!latestPosts.length) {
      container.innerHTML = `
        <div class="admin-empty-state">
          <h2>暂无社区帖子</h2>
          <p>可以调整状态、分类或关键词后重新查询。</p>
        </div>
      `;
      renderPagination(pagination);
      return;
    }
    container.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>分类</th>
              <th>状态</th>
              <th>发布者</th>
              <th>发布时间</th>
              <th>过期时间</th>
              <th>浏览 / 评论 / 举报</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${latestPosts.map(post => `
              <tr>
                <td>
                  <strong>${post.is_pinned ? "【置顶】" : ""}${escapeHtml(post.title)}</strong>
                  <p class="admin-table-subtle">${escapeHtml([post.city, post.area, formatMoney(post.price)].filter(Boolean).join(" · "))}</p>
                </td>
                <td>${escapeHtml(CATEGORY_LABELS[post.category] || post.category || "--")}</td>
                <td>${statusBadge(post.display_status || post.status)}</td>
                <td>${escapeHtml(post.user?.email || post.user?.nickname || post.user_id || "--")}</td>
                <td>${escapeHtml(formatDateTime(post.published_at || post.created_at))}</td>
                <td>${escapeHtml(formatDateTime(post.expires_at))}</td>
                <td>${Number(post.view_count || 0)} / ${Number(post.comment_count || 0)} / ${Number(post.report_count || 0)}</td>
                <td>
                  <div class="admin-table-actions">
                    <button class="button button-text" type="button" data-community-view="${escapeHtml(post.id)}">详情</button>
                    <button class="button button-text" type="button" data-community-post-action="hide" data-post-id="${escapeHtml(post.id)}">隐藏</button>
                    <button class="button button-text" type="button" data-community-post-action="restore" data-post-id="${escapeHtml(post.id)}">恢复</button>
                    <button class="button button-text" type="button" data-community-post-action="${post.is_pinned ? "unpin" : "pin"}" data-post-id="${escapeHtml(post.id)}">${post.is_pinned ? "取消置顶" : "置顶"}</button>
                    <button class="button button-text is-danger" type="button" data-community-post-action="delete" data-post-id="${escapeHtml(post.id)}">删除</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    renderPagination(pagination);
  }

  async function loadPosts() {
    setMessage("正在读取社区帖子...");
    try {
      const data = await AdminApi.listCommunityPosts(buildFilters());
      renderPosts(data.items || [], data.pagination || {});
      setMessage("");
    } catch (error) {
      setMessage(error.message || "社区帖子读取失败", true);
    }
  }

  function renderUserRisk(userRisk) {
    if (!userRisk) {
      return '<p class="admin-table-subtle">暂无用户信息。</p>';
    }
    return `
      <div class="admin-detail-grid">
        <div><span>Email</span><strong>${escapeHtml(userRisk.email || "--")}</strong></div>
        <div><span>发帖数</span><strong>${Number(userRisk.post_count || 0)}</strong></div>
        <div><span>评论数</span><strong>${Number(userRisk.comment_count || 0)}</strong></div>
        <div><span>举报次数</span><strong>${Number(userRisk.report_count || 0)}</strong></div>
        <div><span>权限状态</span><strong>${escapeHtml(userRisk.posting_permission_status || "--")}</strong></div>
        <div><span>信任分</span><strong>${Number(userRisk.trust_score || 0)}</strong></div>
        <div><span>封禁至</span><strong>${escapeHtml(formatDateTime(userRisk.banned_until))}</strong></div>
        <div><span>封禁原因</span><strong>${escapeHtml(userRisk.ban_reason || "--")}</strong></div>
      </div>
    `;
  }

  function renderReports(reports) {
    if (!Array.isArray(reports) || !reports.length) {
      return '<p class="admin-table-subtle">暂无举报记录。</p>';
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>时间</th><th>举报人</th><th>原因</th><th>详情</th></tr></thead>
          <tbody>
            ${reports.map(report => `
              <tr>
                <td>${escapeHtml(formatDateTime(report.created_at))}</td>
                <td>${escapeHtml(report.reporter?.email || report.reporter_user_id || "--")}</td>
                <td>${escapeHtml(report.reason || "--")}</td>
                <td>${escapeHtml(report.details || "--")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderImages(images) {
    if (!Array.isArray(images) || !images.length) {
      return '<p class="admin-table-subtle">暂无图片。</p>';
    }
    return `
      <div class="admin-detail-grid">
        ${images.map(image => `
          <div>
            <span>${escapeHtml(image.status || "--")} · ${escapeHtml(image.file_type || "--")} · ${Number(image.file_size || 0)} bytes</span>
            ${image.signed_url ? `<p><a href="${escapeHtml(image.signed_url)}" target="_blank" rel="noopener">查看图片</a></p>` : ""}
            <button class="button button-text is-danger" type="button" data-community-delete-image="${escapeHtml(image.id)}">删除图片</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderComments(comments) {
    if (!Array.isArray(comments) || !comments.length) {
      return '<p class="admin-table-subtle">暂无评论。</p>';
    }
    return `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>时间</th><th>用户</th><th>状态</th><th>举报</th><th>内容</th><th>操作</th></tr></thead>
          <tbody>
            ${comments.map(comment => `
              <tr>
                <td>${escapeHtml(formatDateTime(comment.created_at))}</td>
                <td>${escapeHtml(comment.user?.email || comment.user_id || "--")}</td>
                <td>${statusBadge(comment.status)}</td>
                <td>${Number(comment.report_count || 0)}</td>
                <td>${escapeHtml(comment.content || "")}</td>
                <td>
                  <div class="admin-table-actions">
                    <button class="button button-text" type="button" data-community-comment-action="hide" data-comment-id="${escapeHtml(comment.id)}">隐藏</button>
                    <button class="button button-text" type="button" data-community-comment-action="restore" data-comment-id="${escapeHtml(comment.id)}">恢复</button>
                    <button class="button button-text is-danger" type="button" data-community-comment-action="delete" data-comment-id="${escapeHtml(comment.id)}">删除</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPostDetail(detail) {
    const drawer = document.querySelector("#adminCommunityDrawer");
    const body = document.querySelector("#adminCommunityDrawerBody");
    const post = detail.post || {};
    body.innerHTML = `
      <section class="admin-detail-section">
        <h3>${escapeHtml(post.title || "--")}</h3>
        <p class="admin-detail-pre">${escapeHtml(post.content || "")}</p>
        <div class="admin-detail-grid">
          <div><span>分类</span><strong>${escapeHtml(CATEGORY_LABELS[post.category] || post.category || "--")}</strong></div>
          <div><span>状态</span><strong>${escapeHtml(STATUS_LABELS[post.display_status || post.status] || post.status || "--")}</strong></div>
          <div><span>城市</span><strong>${escapeHtml(post.city || "--")}</strong></div>
          <div><span>区域</span><strong>${escapeHtml(post.area || "--")}</strong></div>
          <div><span>价格</span><strong>${escapeHtml(formatMoney(post.price))}</strong></div>
          <div><span>过期时间</span><strong>${escapeHtml(formatDateTime(post.expires_at))}</strong></div>
          <div><span>微信</span><strong>${escapeHtml(post.contact_wechat || "--")}</strong></div>
          <div><span>电话</span><strong>${escapeHtml(post.contact_phone || "--")}</strong></div>
          <div><span>Email</span><strong>${escapeHtml(post.contact_email || "--")}</strong></div>
        </div>
        <div class="admin-inline-actions">
          <button class="button button-secondary" type="button" data-community-detail-action="hide" data-post-id="${escapeHtml(post.id)}">隐藏帖子</button>
          <button class="button button-secondary" type="button" data-community-detail-action="restore" data-post-id="${escapeHtml(post.id)}">恢复帖子</button>
          <button class="button button-secondary" type="button" data-community-detail-action="${post.is_pinned ? "unpin" : "pin"}" data-post-id="${escapeHtml(post.id)}">${post.is_pinned ? "取消置顶" : "置顶帖子"}</button>
          <button class="button button-secondary" type="button" data-community-update-expiry="${escapeHtml(post.id)}">修改过期时间</button>
          <button class="button button-secondary" type="button" data-community-ban-user="${escapeHtml(post.user_id)}">封禁发布者</button>
          <button class="button button-text is-danger" type="button" data-community-detail-action="delete" data-post-id="${escapeHtml(post.id)}">删除帖子</button>
        </div>
      </section>
      <section class="admin-detail-section"><h3>用户风险信息</h3>${renderUserRisk(detail.user_risk)}</section>
      <section class="admin-detail-section"><h3>图片</h3>${renderImages(detail.images)}</section>
      <section class="admin-detail-section"><h3>帖子举报记录</h3>${renderReports(detail.post_reports)}</section>
      <section class="admin-detail-section"><h3>评论</h3>${renderComments(detail.comments)}</section>
    `;
    drawer.hidden = false;
  }

  async function openPost(id) {
    setMessage("正在读取帖子详情...");
    try {
      const detail = await AdminApi.getCommunityPost(id);
      renderPostDetail(detail);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "帖子详情读取失败", true);
    }
  }

  async function runPostAction(id, action) {
    if (!id || !action) {
      return;
    }
    if (action === "delete" && !window.confirm("确认删除该帖子？")) {
      return;
    }
    try {
      await AdminApi.updateCommunityPost(id, { action });
      setMessage("帖子已更新。");
      await loadPosts();
      if (!document.querySelector("#adminCommunityDrawer").hidden) {
        await openPost(id);
      }
    } catch (error) {
      setMessage(error.message || "帖子更新失败", true);
    }
  }

  async function loadReportedComments() {
    const container = document.querySelector("#adminCommunityReportedComments");
    if (!container) {
      return;
    }
    container.innerHTML = '<p class="admin-table-subtle">正在读取被举报评论...</p>';
    try {
      const data = await AdminApi.listCommunityComments({ reported: "1", page_size: 20 });
      container.innerHTML = renderComments(data.items || []);
    } catch (error) {
      container.innerHTML = `<p class="admin-table-subtle">${escapeHtml(error.message || "读取失败")}</p>`;
    }
  }

  async function updateComment(id, action) {
    if (!id || !action) {
      return;
    }
    try {
      await AdminApi.updateCommunityComment(id, { action });
      setMessage("评论已更新。");
      await loadReportedComments();
      const openPostId = document.querySelector("[data-community-detail-action]")?.getAttribute("data-post-id");
      if (openPostId) {
        await openPost(openPostId);
      }
    } catch (error) {
      setMessage(error.message || "评论更新失败", true);
    }
  }

  function bindEvents() {
    const filters = document.querySelector("#adminCommunityFilters");
    filters?.addEventListener("submit", event => {
      event.preventDefault();
      currentPage = 1;
      loadPosts();
    });
    filters?.addEventListener("reset", () => {
      setTimeout(() => {
        currentPage = 1;
        loadPosts();
      }, 0);
    });
    document.querySelector("#adminCommunityPagination")?.addEventListener("click", event => {
      const direction = event.target.closest("[data-community-page]")?.getAttribute("data-community-page");
      if (!direction) {
        return;
      }
      currentPage += direction === "next" ? 1 : -1;
      currentPage = Math.max(1, currentPage);
      loadPosts();
    });
    document.querySelector("#adminCommunityPostsTable")?.addEventListener("click", event => {
      const viewId = event.target.closest("[data-community-view]")?.getAttribute("data-community-view");
      if (viewId) {
        openPost(viewId);
        return;
      }
      const actionButton = event.target.closest("[data-community-post-action]");
      if (actionButton) {
        runPostAction(actionButton.getAttribute("data-post-id"), actionButton.getAttribute("data-community-post-action"));
      }
    });
    document.querySelector("#adminCommunityDrawer")?.addEventListener("click", event => {
      if (event.target.closest("[data-community-drawer-close]")) {
        document.querySelector("#adminCommunityDrawer").hidden = true;
        return;
      }
      const detailAction = event.target.closest("[data-community-detail-action]");
      if (detailAction) {
        runPostAction(detailAction.getAttribute("data-post-id"), detailAction.getAttribute("data-community-detail-action"));
        return;
      }
      const expiryButton = event.target.closest("[data-community-update-expiry]");
      if (expiryButton) {
        const expiresAt = window.prompt("请输入新的过期时间，例如 2026-06-30T12:00:00+01:00");
        if (expiresAt) {
          AdminApi.updateCommunityPost(expiryButton.getAttribute("data-community-update-expiry"), { action: "update_expires", expires_at: expiresAt })
            .then(() => openPost(expiryButton.getAttribute("data-community-update-expiry")))
            .then(loadPosts)
            .catch(error => setMessage(error.message || "过期时间更新失败", true));
        }
        return;
      }
      const banButton = event.target.closest("[data-community-ban-user]");
      if (banButton) {
        const days = Number(window.prompt("封禁多少天？输入 0 解除封禁。", "7"));
        if (!Number.isFinite(days)) {
          return;
        }
        const reason = days > 0 ? window.prompt("封禁原因", "社区违规") || "" : "";
        const bannedUntil = days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString() : null;
        AdminApi.updateCommunityUser(banButton.getAttribute("data-community-ban-user"), {
          posting_permission_status: days > 0 ? "banned" : "normal",
          banned_until: bannedUntil,
          ban_reason: reason
        })
          .then(() => setMessage(days > 0 ? "用户已封禁。" : "用户封禁已解除。"))
          .catch(error => setMessage(error.message || "用户风控更新失败", true));
        return;
      }
      const imageButton = event.target.closest("[data-community-delete-image]");
      if (imageButton && window.confirm("确认删除这张图片？")) {
        AdminApi.deleteCommunityImage(imageButton.getAttribute("data-community-delete-image"))
          .then(() => {
            const openPostId = document.querySelector("[data-community-detail-action]")?.getAttribute("data-post-id");
            return openPostId ? openPost(openPostId) : null;
          })
          .catch(error => setMessage(error.message || "图片删除失败", true));
        return;
      }
      const commentButton = event.target.closest("[data-community-comment-action]");
      if (commentButton) {
        updateComment(commentButton.getAttribute("data-comment-id"), commentButton.getAttribute("data-community-comment-action"));
      }
    });
    document.querySelector("#adminCommunityReportedComments")?.addEventListener("click", event => {
      const commentButton = event.target.closest("[data-community-comment-action]");
      if (commentButton) {
        updateComment(commentButton.getAttribute("data-comment-id"), commentButton.getAttribute("data-community-comment-action"));
      }
    });
    document.querySelector("#adminCommunityRefreshReportedComments")?.addEventListener("click", loadReportedComments);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadPosts();
    loadReportedComments();
  });
})();
