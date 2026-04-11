(function () {
  const AdminApi = window.AdminApi;

  if (!AdminApi) {
    return;
  }

  const NAV_ITEMS = [
    { key: "dashboard", label: "\u63a7\u5236\u53f0", href: "./admin-dashboard.html" },
    { key: "users", label: "\u7528\u6237\u7ba1\u7406", href: "./admin-users.html" },
    { key: "managers", label: "\u7ba1\u7406\u5458\u7ba1\u7406", href: "./admin-managers.html", permission: "canViewAdminManagers" },
    {
      key: "transport",
      label: "\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355",
      children: [
        { key: "transport-forms", label: "\u767b\u8bb0\u63a5\u9001\u673a\u8ba2\u5355", href: "./transport-admin-requests.html" },
        { key: "transport-orders", label: "\u786e\u8ba4\u63a5\u9001\u673a\u8ba2\u5355", href: "./transport-admin-groups.html" }
      ]
    },
    { key: "storage", label: "\u5bc4\u5b58\u7ba1\u7406", href: "./admin-storage.html" }
  ];
  const ADMIN_SESSION_CACHE_KEY = "ngn_admin_session_cache";

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
      title: body.dataset.adminTitle || "\u7ba1\u7406\u540e\u53f0",
      section: body.dataset.adminSection || "\u8fd0\u8425\u540e\u53f0",
      description: body.dataset.adminDescription || ""
    };
  }

  function getReturnTo() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function readCachedSession() {
    try {
      const raw = window.sessionStorage.getItem(ADMIN_SESSION_CACHE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.authenticated || !parsed.admin) {
        return null;
      }
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeCachedSession(session) {
    try {
      if (!session || !session.authenticated || !session.admin) {
        window.sessionStorage.removeItem(ADMIN_SESSION_CACHE_KEY);
        return;
      }
      window.sessionStorage.setItem(ADMIN_SESSION_CACHE_KEY, JSON.stringify(session));
    } catch (error) {}
  }

  function clearCachedSession() {
    try {
      window.sessionStorage.removeItem(ADMIN_SESSION_CACHE_KEY);
    } catch (error) {}
  }

  function renderSidebar(meta, session) {
    const sidebar = document.querySelector("[data-admin-sidebar]");
    if (!sidebar) {
      return;
    }

    const items = NAV_ITEMS.filter(item => !item.permission || session.permissions?.[item.permission]);
    const isTransportPage = ["transport-forms", "transport-orders"].includes(meta.key);

    sidebar.innerHTML = `
      <div class="admin-sidebar-brand">
        <span class="admin-sidebar-badge">NGN</span>
        <div>
          <strong>\u7ba1\u7406\u540e\u53f0</strong>
          <p>\u5185\u90e8\u8fd0\u8425\u7cfb\u7edf</p>
        </div>
      </div>
      <nav class="admin-sidebar-nav">
        ${items.map(item => {
          if (Array.isArray(item.children)) {
            return `
              <div class="admin-sidebar-group ${isTransportPage ? "is-open" : ""}">
                <button class="admin-sidebar-link admin-sidebar-button admin-sidebar-group-toggle ${isTransportPage ? "is-current" : ""}" type="button" data-admin-nav-toggle="${item.key}" aria-expanded="${isTransportPage ? "true" : "false"}">
                  <span>${item.label}</span>
                  <span class="admin-sidebar-caret" aria-hidden="true"></span>
                </button>
                <div class="admin-sidebar-subnav" ${isTransportPage ? "" : "hidden"}>
                  ${item.children.map(child => `
                    <a class="admin-sidebar-link admin-sidebar-sublink ${meta.key === child.key ? "is-current" : ""}" href="${child.href}">
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
        <button class="admin-sidebar-link admin-sidebar-button" type="button" data-admin-logout>\u9000\u51fa\u767b\u5f55</button>
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
          <strong>${escapeHtml(admin.name || admin.username || "\u7ba1\u7406\u5458")}</strong>
          <span>${escapeHtml(admin.role_label || "")}${admin.email ? ` · ${escapeHtml(admin.email)}` : ""}</span>
        </div>
        <button class="button button-secondary" type="button" data-admin-logout>\u9000\u51fa\u767b\u5f55</button>
      </div>
    `;
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
          <h2>${escapeHtml(options.title || "\u6682\u65e0\u8bbf\u95ee\u6743\u9650")}</h2>
          <p>${escapeHtml(options.message || "\u60a8\u6ca1\u6709\u8bbf\u95ee\u5f53\u524d\u540e\u53f0\u9875\u9762\u7684\u6743\u9650\u3002")}</p>
          <div class="admin-inline-actions">
            <a class="button button-primary" href="./admin-login.html">\u8fd4\u56de\u540e\u53f0\u767b\u5f55</a>
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

  async function initAdminShell() {
    const shellRoot = document.querySelector("[data-admin-shell]");
    if (!shellRoot) {
      return;
    }

    const meta = getPageMeta();
    const cachedSession = readCachedSession();

    if (cachedSession) {
      renderSidebar(meta, cachedSession);
      renderHeader(meta, cachedSession);
      bindLogout();
    }

    const session = await AdminApi.session().catch(() => ({
      authenticated: false,
      is_admin: false,
      admin: null,
      permissions: null
    }));

    if (!session.authenticated) {
      clearCachedSession();
      window.location.href = `./admin-login.html?return_to=${encodeURIComponent(getReturnTo())}`;
      return;
    }

    writeCachedSession(session);

    if (meta.key === "managers" && !session.permissions?.canViewAdminManagers) {
      renderUnauthorized(meta, {
        admin: session.admin,
        title: "\u6682\u65e0\u8bbf\u95ee\u6743\u9650",
        message: "\u4ec5\u8d85\u7ea7\u7ba1\u7406\u5458\u53ef\u4ee5\u8bbf\u95ee\u7ba1\u7406\u5458\u7ba1\u7406\u6a21\u5757\u3002"
      });
      return;
    }

    renderSidebar(meta, session);
    renderHeader(meta, session);
    bindLogout();
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
    cacheSession: writeCachedSession,
    clearSessionCache: clearCachedSession
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminShell);
  } else {
    initAdminShell();
  }
})();
