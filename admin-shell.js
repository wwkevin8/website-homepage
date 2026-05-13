(function () {
  const AdminApi = window.AdminApi;

  if (!AdminApi) {
    return;
  }

  const NAV_ITEMS = [
    { key: "dashboard", label: "控制台", href: "./admin-dashboard.html" },
    { key: "orders", label: "订单中心", href: "./admin-orders.html" },
    { key: "users", label: "用户管理", href: "./admin-users.html" },
    { key: "managers", label: "管理员管理", href: "./admin-managers.html", permission: "canViewAdminManagers" },
    {
      key: "transport",
      label: "接送机拼车管理",
      children: [
        { key: "transport-forms", label: "登记接送机订单", href: "./transport-admin-requests.html" },
        { key: "transport-orders", label: "拼车组管理", href: "./transport-admin-groups.html" },
        { key: "transport-sync-logs", label: "同步巡检日志", href: "./transport-admin-sync-logs.html" }
      ]
    },
    {
      key: "storage",
      label: "寄存管理",
      children: [
        { key: "storage-box", label: "买箱订单", href: "./admin-storage.html?order_type=box_order" },
        { key: "storage-collection", label: "取寄存订单", href: "./admin-storage.html?order_type=storage_collection" },
        { key: "storage-return", label: "送寄存订单", href: "./admin-storage.html?order_type=storage_return" }
      ]
    }
  ];
  const ADMIN_SESSION_CACHE_KEY = "ngn_admin_session_cache";
  const ADMIN_SESSION_CACHE_TTL_MS = 30 * 1000;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getPageMeta() {
    const body = document.body;
    return {
      key: body.dataset.adminPage || "",
      title: body.dataset.adminTitle || "管理后台",
      section: body.dataset.adminSection || "运营后台",
      description: body.dataset.adminDescription || ""
    };
  }

  function getReturnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function normalizeCachedSession(parsed) {
    if (!parsed) {
      return null;
    }
    if (parsed.session) {
      return {
        session: parsed.session,
        cachedAt: Number(parsed.cached_at || parsed.cachedAt || 0)
      };
    }
    return {
      session: parsed,
      cachedAt: 0
    };
  }

  function isUsableSession(session) {
    return Boolean(session?.authenticated && session?.is_admin && session?.admin);
  }

  function readCachedSession(options = {}) {
    try {
      const raw = window.sessionStorage.getItem(ADMIN_SESSION_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const cached = normalizeCachedSession(JSON.parse(raw));
      if (!isUsableSession(cached?.session)) {
        return null;
      }
      if (!options.allowStale && !cached.cachedAt) {
        return null;
      }
      if (!options.allowStale) {
        const ageMs = Date.now() - cached.cachedAt;
        if (ageMs > ADMIN_SESSION_CACHE_TTL_MS) {
          return null;
        }
      }
      return cached.session;
    } catch (error) {
      return null;
    }
  }

  function writeCachedSession(session) {
    try {
      if (!isUsableSession(session)) {
        window.sessionStorage.removeItem(ADMIN_SESSION_CACHE_KEY);
        window.AdminShellSession = null;
        return;
      }
      window.AdminShellSession = session;
      window.sessionStorage.setItem(ADMIN_SESSION_CACHE_KEY, JSON.stringify({
        session,
        cached_at: Date.now()
      }));
    } catch (error) {}
  }

  function clearCachedSession() {
    try {
      window.sessionStorage.removeItem(ADMIN_SESSION_CACHE_KEY);
    } catch (error) {}
    window.AdminShellSession = null;
    window.AdminShellSessionPromise = null;
  }

  function fetchSession() {
    if (window.AdminShellSessionPromise) {
      return window.AdminShellSessionPromise;
    }

    window.AdminShellSessionPromise = AdminApi.session()
      .then(session => {
        if (isUsableSession(session)) {
          writeCachedSession(session);
        } else {
          clearCachedSession();
        }
        return session;
      })
      .catch(() => {
        clearCachedSession();
        return {
          authenticated: false,
          is_admin: false,
          admin: null,
          permissions: null
        };
      })
      .finally(() => {
        window.AdminShellSessionPromise = null;
      });

    return window.AdminShellSessionPromise;
  }

  async function getSession(options = {}) {
    if (!options.refresh && isUsableSession(window.AdminShellSession)) {
      return window.AdminShellSession;
    }
    if (!options.refresh) {
      const cachedSession = readCachedSession();
      if (cachedSession) {
        window.AdminShellSession = cachedSession;
        return cachedSession;
      }
    }
    return fetchSession();
  }

  function renderSidebar(meta, session) {
    const sidebar = document.querySelector("[data-admin-sidebar]");
    if (!sidebar) {
      return;
    }

    const items = NAV_ITEMS.filter(item => !item.permission || session.permissions?.[item.permission]);
    const currentUrl = new URL(window.location.href);
    const isTransportPage = ["transport-forms", "transport-orders", "transport-sync-logs"].includes(meta.key);
    const isStoragePage = meta.key === "storage";
    const storageOrderType = isStoragePage ? currentUrl.searchParams.get("order_type") || "" : "";

    sidebar.innerHTML = `
      <div class="admin-sidebar-brand">
        <span class="admin-sidebar-badge">NGN</span>
        <div>
          <strong>管理后台</strong>
          <p>内部运营系统</p>
        </div>
      </div>
      <nav class="admin-sidebar-nav">
        ${items.map(item => {
          if (Array.isArray(item.children)) {
            const isGroupOpen = item.key === "transport" ? isTransportPage : item.key === "storage" ? isStoragePage : false;
            return `
              <div class="admin-sidebar-group ${isGroupOpen ? "is-open" : ""}">
                <button class="admin-sidebar-link admin-sidebar-button admin-sidebar-group-toggle ${isGroupOpen ? "is-current" : ""}" type="button" data-admin-nav-toggle="${item.key}" aria-expanded="${isGroupOpen ? "true" : "false"}">
                  <span>${item.label}</span>
                  <span class="admin-sidebar-caret" aria-hidden="true"></span>
                </button>
                <div class="admin-sidebar-subnav" ${isGroupOpen ? "" : "hidden"}>
                  ${item.children.map(child => `
                    <a class="admin-sidebar-link admin-sidebar-sublink ${(meta.key === child.key) || (item.key === "storage" && (storageOrderType ? child.href.includes(`order_type=${storageOrderType}`) : !child.href.includes("order_type="))) ? "is-current" : ""}" href="${child.href}">
                      <span>${child.label}</span>
                    </a>
                  `).join("")}
                </div>
              </div>
            `;
          }

          return `
            <a class="admin-sidebar-link ${meta.key === item.key ? "is-current" : ""}" href="${item.href}">
              <span>${item.label}</span>
            </a>
          `;
        }).join("")}
      </nav>
      <div class="admin-sidebar-footer">
        <button class="admin-sidebar-link admin-sidebar-button" type="button" data-admin-logout>退出登录</button>
      </div>
    `;
  }

  function renderHeader(meta, session) {
    const header = document.querySelector("[data-admin-header]");
    if (!header) {
      return;
    }

    const admin = session.admin || {};

    header.innerHTML = `
      <div class="admin-header-copy">
        <p class="admin-eyebrow">${escapeHtml(meta.section)}</p>
        <h1>${escapeHtml(meta.title)}</h1>
        ${meta.description ? `<p class="admin-header-description">${escapeHtml(meta.description)}</p>` : ""}
      </div>
      <div class="admin-header-actions">
        <div class="admin-header-user">
          <strong>${escapeHtml(admin.name || admin.username || "管理员")}</strong>
          <span>${escapeHtml(admin.role_label || "")}${admin.email ? ` · ${escapeHtml(admin.email)}` : ""}</span>
        </div>
        <button class="button button-secondary" type="button" data-admin-change-password>修改密码</button>
        <button class="button button-secondary" type="button" data-admin-logout>退出登录</button>
      </div>
    `;
  }

  function ensureChangePasswordModal() {
    let modal = document.getElementById("adminChangePasswordModal");
    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.id = "adminChangePasswordModal";
    modal.className = "admin-overlay";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adminChangePasswordTitle">
        <div class="admin-drawer-header">
          <div>
            <h2 id="adminChangePasswordTitle">修改密码</h2>
            <p>为当前登录的管理员账号修改密码。保存后，下次登录请使用新密码。</p>
          </div>
          <button class="button button-text" type="button" data-admin-change-password-close>关闭</button>
        </div>
        <form class="admin-drawer-body admin-form-grid" id="adminChangePasswordForm">
          <label class="field admin-field-span-2">
            <span>当前密码</span>
            <input type="password" name="current_password" autocomplete="current-password" required>
          </label>
          <label class="field admin-field-span-2">
            <span>新密码</span>
            <input type="password" name="new_password" autocomplete="new-password" minlength="8" required>
          </label>
          <label class="field admin-field-span-2">
            <span>确认新密码</span>
            <input type="password" name="confirm_password" autocomplete="new-password" minlength="8" required>
          </label>
          <p class="transport-form-message admin-field-span-2" id="adminChangePasswordMessage"></p>
          <div class="admin-inline-actions admin-field-span-2">
            <button class="button button-primary" type="submit">保存新密码</button>
            <button class="button button-secondary" type="button" data-admin-change-password-close>取消</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  function closeChangePasswordModal() {
    const modal = document.getElementById("adminChangePasswordModal");
    if (!modal) {
      return;
    }

    modal.hidden = true;
    document.body.classList.remove("admin-overlay-open");
  }

  function setChangePasswordMessage(text, isError) {
    const message = document.getElementById("adminChangePasswordMessage");
    if (!message) {
      return;
    }

    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(text && isError));
    message.classList.toggle("is-success", Boolean(text && !isError));
  }

  function openChangePasswordModal() {
    const modal = ensureChangePasswordModal();
    const form = document.getElementById("adminChangePasswordForm");
    if (!modal || !form) {
      return;
    }

    form.reset();
    setChangePasswordMessage("");
    modal.hidden = false;
    document.body.classList.add("admin-overlay-open");
    window.setTimeout(() => {
      form.current_password?.focus();
    }, 0);
  }

  function bindChangePassword() {
    const modal = ensureChangePasswordModal();
    const form = document.getElementById("adminChangePasswordForm");
    if (!modal || !form) {
      return;
    }

    document.querySelectorAll("[data-admin-change-password]").forEach(button => {
      if (button.dataset.adminChangePasswordBound === "true") {
        return;
      }
      button.dataset.adminChangePasswordBound = "true";
      button.addEventListener("click", event => {
        event.preventDefault();
        openChangePasswordModal();
      });
    });

    if (modal.dataset.adminChangePasswordBound === "true") {
      return;
    }
    modal.dataset.adminChangePasswordBound = "true";

    modal.querySelectorAll("[data-admin-change-password-close]").forEach(button => {
      button.addEventListener("click", closeChangePasswordModal);
    });

    modal.addEventListener("click", event => {
      if (event.target === modal) {
        closeChangePasswordModal();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !modal.hidden) {
        closeChangePasswordModal();
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const currentPassword = form.current_password.value;
      const newPassword = form.new_password.value;
      const confirmPassword = form.confirm_password.value;

      if (!currentPassword) {
        setChangePasswordMessage("请输入当前密码", true);
        form.current_password?.focus();
        return;
      }
      if (newPassword.length < 8) {
        setChangePasswordMessage("新密码至少需要 8 位", true);
        form.new_password?.focus();
        return;
      }
      if (newPassword !== confirmPassword) {
        setChangePasswordMessage("两次输入的新密码不一致", true);
        form.confirm_password?.focus();
        return;
      }

      setChangePasswordMessage("正在保存新密码...");

      try {
        const payload = {
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword
        };
        await AdminApi.changeOwnPassword(payload);
        setChangePasswordMessage("密码修改成功，请重新登录。");
        window.dispatchEvent(
          new CustomEvent("admin:assistant-message", {
            detail: { message: "密码已修改成功，请重新登录。" }
          })
        );
        await AdminApi.logout().catch(() => {});
        clearCachedSession();
        window.setTimeout(() => {
          window.location.href = "./admin-login.html";
        }, 800);
      } catch (error) {
        const message = error?.status === 404
          ? "修改密码接口暂时不可用，请刷新页面后重试。"
          : (error.message || "密码修改失败");
        setChangePasswordMessage(message, true);
      }
    });
  }

  async function handleLogout() {
    await AdminApi.logout().catch(() => {});
    clearCachedSession();
    window.location.href = "./admin-login.html";
  }

  function bindLogout() {
    document.querySelectorAll("[data-admin-logout]").forEach(button => {
      if (button.dataset.adminLogoutBound === "true") {
        return;
      }
      button.dataset.adminLogoutBound = "true";
      button.addEventListener("click", event => {
        event.preventDefault();
        handleLogout();
      });
    });
  }

  function bindSidebarToggles() {
    document.querySelectorAll("[data-admin-nav-toggle]").forEach(button => {
      if (button.dataset.adminNavBound === "true") {
        return;
      }
      button.dataset.adminNavBound = "true";
      button.addEventListener("click", () => {
        const group = button.closest(".admin-sidebar-group");
        const subnav = group?.querySelector(".admin-sidebar-subnav");
        const isOpen = group?.classList.toggle("is-open");
        button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        if (subnav) {
          subnav.hidden = !isOpen;
        }
      });
    });
  }

  function renderUnauthorized(meta, options) {
    const content = document.querySelector("[data-admin-content]");
    if (!content) {
      return;
    }

    content.innerHTML = `
      <section class="admin-panel admin-guard-panel">
        <div class="admin-empty-state">
          <h2>${escapeHtml(options.title || "鏆傛棤璁块棶鏉冮檺")}</h2>
          <p>${escapeHtml(options.message || "您没有访问当前后台页面的权限。")}</p>
          <div class="admin-inline-actions">
            <a class="button button-primary" href="./admin-login.html">杩斿洖鍚庡彴鐧诲綍</a>
          </div>
        </div>
      </section>
    `;

    document.body.classList.add("admin-is-blocked");
    const sidebar = document.querySelector("[data-admin-sidebar]");
    if (sidebar) {
      sidebar.innerHTML = "";
    }
    renderHeader(meta, { admin: options.admin || null });
  }

  function renderAdminPet() {
    let widget = document.getElementById("adminPetWidget");
    if (widget) {
      return widget;
    }

    widget = document.createElement("section");
    widget.id = "adminPetWidget";
    widget.className = "admin-pet";
    widget.setAttribute("aria-live", "polite");
    widget.innerHTML = `
      <div class="admin-pet-bubble" data-admin-pet-bubble>我在右下角陪你。</div>
      <div class="admin-pet-tips" data-admin-pet-tips hidden>
        <button class="admin-pet-tip" type="button" data-admin-pet-tip="先保存再跳页，后台操作会更稳。">先保存再跳页</button>
        <button class="admin-pet-tip" type="button" data-admin-pet-tip="如果这里报错了，我会先提醒你看哪一块。">看报错提醒</button>
        <button class="admin-pet-tip" type="button" data-admin-pet-tip="改完拼车组之后，记得刷新核对一遍成员和价格。">核对拼车组</button>
      </div>
      <button class="admin-pet-dog" type="button" aria-label="后台小助手" data-admin-pet-button></button>
    `;
    document.body.appendChild(widget);
    return widget;
  }

  function bindAdminPet(meta) {
    const widget = renderAdminPet();
    const bubble = widget.querySelector("[data-admin-pet-bubble]");
    const button = widget.querySelector("[data-admin-pet-button]");
    const tips = widget.querySelector("[data-admin-pet-tips]");
    if (!(bubble instanceof HTMLElement) || !(button instanceof HTMLElement) || !(tips instanceof HTMLElement)) {
      return;
    }
    if (button.dataset.adminPetBound === "true") {
      return;
    }

    const idleLines = [
      "我在右下角陪你，有报错我会先提醒。",
      "先保存再跳页，后台操作会更稳。",
      "拼车组有成员时不能直接删组，要先处理成员。",
      "同一账号有未来有效单时，不能重复发单。",
      "更换拼车组后，记得核对机场、航站楼、人数和价格。"
    ];
    const encouragementLines = [
      "别急，我陪你慢慢看。",
      "先看提示，再决定下一步。",
      "已经做很多了，剩下的我继续帮你看着。"
    ];
    const logicLines = [
      "空拼车组可以直接删除；有成员的组要先移成员。",
      "付款从未付款切到已付款时，会优先用订单邮箱发邮件。",
      "拼车组当前均价 = 总价 ÷ 当前人数；如果跨航站楼，则按当前人数每人 +£15。",
      "一张订单只能在一个拼车组里。",
      "前台详情只显示匿名信息，不显示姓名电话微信和地址。",
      "发现总价变成 0 时，先核对机场代码和组内汇总信息。"
    ];
    const successKeywords = ["已保存", "保存成功", "已更新", "已删除", "已更换", "已标记", "已发送", "已撤回", "成功"];

    let bubbleTimer = null;
    const showBubble = (text, mode) => {
      const message = String(text || "").trim();
      if (!message) {
        return;
      }
      bubble.textContent = message;
      widget.classList.toggle("is-alert", mode === "error");
      widget.classList.toggle("is-happy", mode === "happy");
      bubble.classList.add("is-visible");
      if (bubbleTimer) {
        window.clearTimeout(bubbleTimer);
      }
      bubbleTimer = window.setTimeout(() => {
        bubble.classList.remove("is-visible");
        widget.classList.remove("is-alert", "is-happy");
      }, mode === "error" ? 6200 : 4600);
    };

    const randomFrom = list => list[Math.floor(Math.random() * list.length)];
    const isSuccessMessage = message => successKeywords.some(keyword => message.includes(keyword));

    button.dataset.adminPetBound = "true";
    tips.hidden = true;
    widget.classList.remove("is-open");
    showBubble(meta?.title ? `${meta.title}这页我帮你盯着。` : idleLines[0], "happy");

    button.addEventListener("click", () => {
      const line = randomFrom([...encouragementLines, ...logicLines]);
      widget.classList.add("is-waving");
      showBubble(line, "happy");
      window.setTimeout(() => widget.classList.remove("is-waving"), 1200);
    });

    tips.addEventListener("click", event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const message = target.getAttribute("data-admin-pet-tip");
      if (!message) {
        return;
      }
      showBubble(message, "happy");
    });

    button.addEventListener("mouseenter", () => {
      widget.classList.add("is-curious");
      showBubble(randomFrom(idleLines), "happy");
    });

    button.addEventListener("mouseleave", () => {
      widget.classList.remove("is-curious");
    });

    window.addEventListener("admin:assistant-message", event => {
      const detail = event.detail || {};
      const message = String(detail.message || "").trim();
      if (!message) {
        return;
      }
      const clipped = message.length > 72 ? `${message.slice(0, 72)}...` : message;
      if (detail.isError) {
        showBubble(`这里刚刚报错了：${clipped}`, "error");
        return;
      }
      if (isSuccessMessage(message)) {
        showBubble(randomFrom([
          `已经处理好了：${clipped}`,
          `这一步完成了：${clipped}`,
          "已经保存好了，我继续帮你看着。"
        ]), "happy");
        return;
      }
      showBubble(clipped, "happy");
    });

    window.addEventListener("error", event => {
      const message = String(event.message || "").trim();
      if (!message) {
        return;
      }
      showBubble(`我看到一个页面报错：${message.slice(0, 56)}`, "error");
    });

    window.addEventListener("unhandledrejection", event => {
      const reason = event.reason;
      const message = typeof reason === "string"
        ? reason
        : typeof reason?.message === "string"
          ? reason.message
          : "有个请求没有顺利完成。";
      showBubble(`这个请求没跑顺：${message.slice(0, 56)}`, "error");
    });
  }
  async function initAdminShell() {
    const shellRoot = document.querySelector("[data-admin-shell]");
    if (!shellRoot) {
      return;
    }

    const meta = getPageMeta();
    const cachedSession = readCachedSession();

    if (cachedSession) {
      window.AdminShellSession = cachedSession;
      renderSidebar(meta, cachedSession);
      renderHeader(meta, cachedSession);
      bindLogout();
      bindChangePassword();
    }

    const session = cachedSession || await getSession({ refresh: true });

    if (!session.authenticated) {
      clearCachedSession();
      window.location.href = `./admin-login.html?return_to=${encodeURIComponent(getReturnTo())}`;
      return;
    }

    writeCachedSession(session);

    if (meta.key === "managers" && !session.permissions?.canViewAdminManagers) {
      renderUnauthorized(meta, {
        admin: session.admin,
        title: "鏆傛棤璁块棶鏉冮檺",
        message: "仅超级管理员可以访问管理员管理模块。"
      });
      return;
    }

    renderSidebar(meta, session);
    renderHeader(meta, session);
    bindAdminPet(meta);
    bindLogout();
    bindChangePassword();
    bindSidebarToggles();

    document.dispatchEvent(
      new CustomEvent("admin:shell-ready", {
        detail: {
          meta,
          session
        }
      })
    );
  }

  window.AdminShell = {
    init: initAdminShell,
    escapeHtml,
    logout: handleLogout,
    getSession,
    getCachedSession: readCachedSession,
    cacheSession: writeCachedSession,
    clearSessionCache: clearCachedSession
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminShell);
  } else {
    initAdminShell();
  }
})();
