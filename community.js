(function () {
  const CATEGORY_LABELS = {
    buddy: "找搭子",
    second_hand: "二手交易",
    sublet: "转租/短租",
    help: "求助/问答",
    official: "官方公告"
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(value) {
    if (!value) {
      return "--";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("zh-CN");
  }

  function formatPrice(value) {
    if (value === null || value === undefined || value === "") {
      return "";
    }
    const number = Number(value);
    return Number.isFinite(number) ? `£${number.toFixed(2)}` : "";
  }

  function setMessage(node, text, type) {
    if (!node) {
      return;
    }
    node.textContent = text || "";
    node.className = "community-message";
    if (type) {
      node.classList.add(`is-${type}`);
    }
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      ...options
    });
    const payload = await response.json().catch(() => ({ data: null, error: { message: "服务器响应异常" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "请求失败");
    }
    return payload.data;
  }

  function postUrl(id) {
    return `/community-post/${encodeURIComponent(id)}`;
  }

  function renderPostCard(post) {
    const category = CATEGORY_LABELS[post.category] || post.category;
    const meta = [
      post.city,
      post.area,
      formatPrice(post.price),
      `评论 ${Number(post.comment_count || 0)}`,
      `浏览 ${Number(post.view_count || 0)}`,
      `发布 ${formatDate(post.published_at)}`,
      `过期 ${formatDate(post.expires_at)}`
    ].filter(Boolean);
    return `
      <a class="community-card" href="${postUrl(post.id)}">
        <h2 class="community-card-title">
          ${post.is_pinned ? '<span class="community-pill">置顶</span>' : ""}
          <span>${escapeHtml(post.title)}</span>
        </h2>
        <div class="community-meta">
          <span class="community-pill ${post.category === "official" ? "is-official" : ""}">${escapeHtml(category)}</span>
          ${meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}
        </div>
      </a>
    `;
  }

  async function initListPage() {
    const list = document.querySelector("[data-community-list]");
    if (!list) {
      return;
    }
    const message = document.querySelector("[data-community-message]");
    const searchInput = document.querySelector("[data-community-search]");
    const searchButton = document.querySelector("[data-community-search-button]");
    const tabs = document.querySelector("[data-community-tabs]");
    let category = "";

    async function loadPosts() {
      setMessage(message, "正在读取信息...");
      const query = new URLSearchParams();
      if (category) {
        query.set("category", category);
      }
      const search = searchInput ? searchInput.value.trim() : "";
      if (search) {
        query.set("q", search);
      }
      try {
        const data = await request(`/api/public/community-posts?${query.toString()}`);
        const items = data.items || [];
        list.innerHTML = items.length
          ? items.map(renderPostCard).join("")
          : '<div class="community-card"><p class="community-help">暂时没有可展示的信息。</p></div>';
        setMessage(message, "");
      } catch (error) {
        list.innerHTML = "";
        setMessage(message, error.message || "读取失败", "error");
      }
    }

    tabs?.addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) {
        return;
      }
      category = button.dataset.category || "";
      tabs.querySelectorAll("[data-category]").forEach(item => item.classList.toggle("is-active", item === button));
      loadPosts();
    });

    searchButton?.addEventListener("click", loadPosts);
    searchInput?.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        loadPosts();
      }
    });

    await loadPosts();
  }

  function renderDetail(post) {
    const category = CATEGORY_LABELS[post.category] || post.category;
    const price = formatPrice(post.price);
    const meta = [
      category,
      post.city,
      post.area,
      price,
      `发布 ${formatDate(post.published_at)}`,
      `过期 ${formatDate(post.expires_at)}`
    ].filter(Boolean);
    const images = Array.isArray(post.images) ? post.images : [];
    return `
      <h1>${escapeHtml(post.title)}</h1>
      <div class="community-meta">${meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      <div class="community-content">${escapeHtml(post.content)}</div>
      ${images.length ? `<div class="community-images">${images.map(image => `<img loading="lazy" src="${escapeHtml(image.url)}" alt="${escapeHtml(post.title)}">`).join("")}</div>` : ""}
    `;
  }

  function renderComments(comments) {
    if (!comments.length) {
      return '<p class="community-help">还没有评论，登录后可以第一个回复。</p>';
    }
    return comments.map(comment => `
      <article class="community-comment-item" data-comment-id="${escapeHtml(comment.id)}">
        <div class="community-meta">
          <span>${escapeHtml(comment.author_label || "同学")}</span>
          <span>${escapeHtml(formatDate(comment.created_at))}</span>
        </div>
        <p>${escapeHtml(comment.content)}</p>
        <button class="community-button community-button-danger" type="button" data-report-comment="${escapeHtml(comment.id)}">举报评论</button>
      </article>
    `).join("");
  }

  function ensureCommentListNode(commentForm) {
    let node = document.querySelector("[data-comment-list]");
    if (node) {
      return node;
    }
    node = document.createElement("div");
    node.className = "community-comments-list";
    node.dataset.commentList = "";
    if (commentForm && commentForm.parentNode) {
      commentForm.parentNode.insertBefore(node, commentForm);
    }
    return node;
  }

  async function loadComments(postId, commentList, commentMessage) {
    if (!commentList) {
      return;
    }
    commentList.innerHTML = '<p class="community-help">正在读取评论...</p>';
    try {
      const data = await request(`/api/public/community-comments?post_id=${encodeURIComponent(postId)}`);
      const comments = Array.isArray(data.items) ? data.items : [];
      commentList.innerHTML = renderComments(comments);
    } catch (error) {
      commentList.innerHTML = '<p class="community-help">评论暂时不可查看。</p>';
      setMessage(commentMessage, error.message || "评论读取失败", "error");
    }
  }

  function updateServiceLinks(category) {
    const node = document.querySelector("[data-category-services]");
    if (!node) {
      return;
    }
    const linksByCategory = {
      buddy: [
        ["接机 / 拼车", "./pickup.html"],
        ["联系客服", "./service-center.html"]
      ],
      second_hand: [
        ["搬家", "./moving.html"],
        ["寄存", "./storage.html"],
        ["新生礼包", "./service-center.html"]
      ],
      sublet: [
        ["订房咨询", "./service-center.html"],
        ["接机", "./pickup.html"]
      ],
      help: [
        ["联系客服", "./service-center.html"],
        ["学生服务", "./service-center.html"]
      ],
      official: [
        ["查看服务中心", "./service-center.html"],
        ["接机", "./pickup.html"],
        ["寄存", "./storage.html"]
      ]
    };
    const links = linksByCategory[category] || linksByCategory.help;
    node.innerHTML = links.map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`).join("");
  }

  async function ensureLoggedIn() {
    const session = window.SiteAuth ? await window.SiteAuth.getSession() : { authenticated: false };
    if (session.authenticated) {
      return true;
    }
    if (window.SiteAuth) {
      await window.SiteAuth.requireLogin({
        returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`
      });
    } else {
      window.location.href = "./login.html";
    }
    return false;
  }

  async function initDetailPage() {
    const root = document.querySelector("[data-community-post-root]");
    if (!root) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const fallbackId = params.get("id");
    const pathMatch = window.location.pathname.match(/\/community-post\/([^/]+)$/);
    const postId = pathMatch ? decodeURIComponent(pathMatch[1]) : fallbackId;
    if (!postId) {
      root.innerHTML = '<p class="community-message is-error">帖子不存在或已不可查看。</p>';
      return;
    }

    let post = null;
    try {
      const data = await request(`/api/public/community-posts?id=${encodeURIComponent(postId)}`);
      post = data.post;
      document.title = `${post.title}｜NGN 学生信息广场`;
      root.innerHTML = renderDetail(post);
      updateServiceLinks(post.category);
    } catch (error) {
      root.innerHTML = `<p class="community-message is-error">${escapeHtml(error.message || "帖子不存在或已不可查看。")}</p>`;
      return;
    }

    const commentForm = document.querySelector("[data-comment-form]");
    const commentMessage = document.querySelector("[data-comment-message]");
    const commentList = ensureCommentListNode(commentForm);
    loadComments(post.id, commentList, commentMessage);

    if (window.SiteAuth) {
      window.SiteAuth.getSession()
        .then(session => {
          if (!session.authenticated) {
            setMessage(commentMessage, "登录后可评论。");
          }
        })
        .catch(() => {});
    }

    commentForm?.addEventListener("submit", async event => {
      event.preventDefault();
      if (!(await ensureLoggedIn())) {
        return;
      }
      const content = commentForm.content.value.trim();
      if (!content) {
        setMessage(commentMessage, "请先填写评论内容。", "error");
        return;
      }
      try {
        await request("/api/public/community-comments", {
          method: "POST",
          body: JSON.stringify({ post_id: post.id, content })
        });
        commentForm.reset();
        setMessage(commentMessage, "评论已发布。", "success");
        await loadComments(post.id, commentList, commentMessage);
      } catch (error) {
        setMessage(commentMessage, error.message || "评论失败", "error");
      }
    });

    commentList?.addEventListener("click", async event => {
      const button = event.target.closest("[data-report-comment]");
      if (!button) {
        return;
      }
      if (!(await ensureLoggedIn())) {
        return;
      }
      const commentId = button.dataset.reportComment;
      const reason = window.prompt("请选择或填写举报原因", "违规内容");
      if (!commentId || !reason) {
        return;
      }
      try {
        await request("/api/public/community-comment-reports", {
          method: "POST",
          body: JSON.stringify({ comment_id: commentId, reason })
        });
        setMessage(commentMessage, "评论举报已提交。", "success");
        await loadComments(post.id, commentList, commentMessage);
      } catch (error) {
        setMessage(commentMessage, error.message || "评论举报失败", "error");
      }
    });

    const reportButton = document.querySelector("[data-report-post]");
    const reportMessage = document.querySelector("[data-report-message]");
    reportButton?.addEventListener("click", async () => {
      if (!(await ensureLoggedIn())) {
        return;
      }
      const reason = window.prompt("请选择或填写举报原因", "违规内容");
      if (!reason) {
        return;
      }
      try {
        await request("/api/public/community-post-reports", {
          method: "POST",
          body: JSON.stringify({ post_id: post.id, reason })
        });
        setMessage(reportMessage, "举报已提交。", "success");
      } catch (error) {
        setMessage(reportMessage, error.message || "举报失败", "error");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initListPage();
      initDetailPage();
    });
  } else {
    initListPage();
    initDetailPage();
  }
})();
