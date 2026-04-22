(function () {
  const AUTH_STORAGE_KEY = "ngn-post-login-action";
  const SUPABASE_AUTH_STORAGE_PREFIX = "sb-";
  let cachedSessionPromise = null;

  function toAbsolutePath(value) {
    const fallback = "/service-center.html";
    if (!value) {
      return fallback;
    }

    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin) {
        return fallback;
      }
      return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
      return fallback;
    }
  }

  function isWechatBrowser() {
    return /micromessenger/i.test(window.navigator.userAgent || "");
  }

  function getEmailPrefix(email) {
    return String(email || "").trim().split("@")[0] || "已登录用户";
  }

  function hasProfileName(user) {
    const nickname = String((user && user.nickname) || "").trim();
    return Boolean(nickname) && nickname !== getEmailPrefix(user && user.email);
  }

  function getDisplayName(user) {
    return hasProfileName(user) ? String(user.nickname).trim() : getEmailPrefix(user && user.email);
  }

  function getProfileCompletionState(user) {
    const hasName = hasProfileName(user);
    const hasPhone = Boolean(String((user && user.phone) || "").trim());
    const contactHandle = String((user && user.wechat_id) || "").trim();
    const hasContact = Boolean(contactHandle);
    const missingFields = [];

    if (!hasName) {
      missingFields.push("姓名");
    }
    if (!hasPhone) {
      missingFields.push("手机号");
    }
    if (!hasContact) {
      missingFields.push("微信号");
    }

    return {
      hasName,
      hasPhone,
      hasContact,
      contactPreference: "wechat",
      contactPreferenceLabel: "微信",
      contactHandle,
      missingFields,
      isComplete: missingFields.length === 0
    };
  }

  async function getSession(force = false) {
    if (!force && cachedSessionPromise) {
      return cachedSessionPromise;
    }

    cachedSessionPromise = fetch("/api/auth/session", {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    })
      .then(async response => {
        const payload = await response.json().catch(() => ({ data: null }));
        return payload.data || { authenticated: false, user: null };
      })
      .catch(() => ({ authenticated: false, user: null }));

    return cachedSessionPromise;
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }).catch(() => {});

    try {
      Object.keys(window.localStorage).forEach(key => {
        if (key.startsWith(SUPABASE_AUTH_STORAGE_PREFIX)) {
          window.localStorage.removeItem(key);
        }
      });
      Object.keys(window.sessionStorage).forEach(key => {
        if (key.startsWith(SUPABASE_AUTH_STORAGE_PREFIX)) {
          window.sessionStorage.removeItem(key);
        }
      });
    } catch (error) {
      // Best effort cleanup.
    }

    cachedSessionPromise = Promise.resolve({ authenticated: false, user: null });
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return { authenticated: false, user: null };
  }

  async function requireLogin(options = {}) {
    const session = await getSession();
    if (session.authenticated) {
      if (options.postLoginUrl) {
        window.location.href = options.postLoginUrl;
      }
      return session;
    }

    const returnTo = toAbsolutePath(options.returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`);
    if (options.postLoginUrl) {
      window.sessionStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
          returnTo,
          postLoginUrl: options.postLoginUrl,
          createdAt: Date.now()
        })
      );
    } else {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }

    window.location.href = `./login.html?return_to=${encodeURIComponent(returnTo)}`;
    return null;
  }

  function renderAuthNav(container, session) {
    if (!container) {
      return;
    }

    if (session.authenticated && session.user) {
      const nickname = getDisplayName(session.user);
      const isServiceCenter = window.location.pathname.endsWith("/service-center.html") || window.location.pathname === "/service-center.html";
      if (isServiceCenter) {
        container.innerHTML = '<button class="button button-secondary site-auth-nav-button" type="button" data-site-auth-logout>退出登录</button>';
        return;
      }
      container.innerHTML = `
        <div class="site-auth-menu">
          <button class="site-user-chip site-auth-menu-trigger" type="button" data-site-auth-menu-trigger aria-expanded="false">
            <img class="site-user-chip-avatar" src="${session.user.avatar_url || "https://dummyimage.com/80x80/dae6fb/35507a&text=NGN"}" alt="${nickname}">
            <span>${nickname}</span>
          </button>
          <div class="site-auth-menu-dropdown" data-site-auth-menu-dropdown hidden>
            <a class="site-auth-menu-item" href="./service-center.html">个人中心</a>
            <button class="site-auth-menu-item" type="button" data-site-auth-logout>退出登录</button>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = '<a class="button button-secondary site-auth-nav-button" href="./login.html">登录</a>';
  }

  function renderMobileAuth(container, session) {
    if (!container) {
      return;
    }

    if (session.authenticated) {
      container.innerHTML = `
        <a href="./service-center.html">个人中心</a>
        <button type="button" class="site-auth-mobile-button" data-site-auth-logout>退出登录</button>
      `;
      return;
    }

    container.innerHTML = '<a href="./login.html">登录</a>';
  }

  function hydrateUserProfile(session) {
    if (!session.authenticated || !session.user) {
      return;
    }

    const user = session.user;
    const displayName = getDisplayName(user);
    const profileState = getProfileCompletionState(user);
    const emailValue = user.email || "未获取";
    const emailStatus = user.email_verified_at ? "已验证" : "未验证";
    const nameStatus = profileState.hasName ? "已填写" : "待补充";
    const phoneStatus = profileState.hasPhone ? "已填写" : "待补充";
    const contactStatus = profileState.hasContact ? "已填写" : "待补充";
    const loginIdText = user.email ? `登录账号：${user.email}` : "登录账号：暂未获取";
    const contactNote = profileState.isComplete
      ? "你已登录，可直接开始预约。"
      : `资料未完善，提交前需补全${profileState.missingFields.join("、")}。`;

    document.querySelectorAll("[data-site-user-name]").forEach(node => {
      node.textContent = displayName;
    });
    document.querySelectorAll("[data-site-user-email]").forEach(node => {
      node.textContent = emailValue;
    });
    document.querySelectorAll("[data-site-user-phone]").forEach(node => {
      node.textContent = profileState.hasPhone ? user.phone : "未补充";
    });
    document.querySelectorAll("[data-site-user-contact]").forEach(node => {
      node.textContent = profileState.hasContact ? `微信 · ${profileState.contactHandle}` : "未补充";
    });
    document.querySelectorAll("[data-site-user-email-status]").forEach(node => {
      node.textContent = emailStatus;
    });
    document.querySelectorAll("[data-site-user-name-status]").forEach(node => {
      node.textContent = nameStatus;
    });
    document.querySelectorAll("[data-site-user-phone-status]").forEach(node => {
      node.textContent = phoneStatus;
    });
    document.querySelectorAll("[data-site-user-contact-status]").forEach(node => {
      node.textContent = contactStatus;
    });
    document.querySelectorAll("[data-site-user-login-id]").forEach(node => {
      node.textContent = loginIdText;
    });
    document.querySelectorAll("[data-site-user-contact-note]").forEach(node => {
      node.textContent = contactNote;
    });
    document.querySelectorAll("[data-site-user-avatar]").forEach(node => {
      node.setAttribute("src", user.avatar_url || "https://dummyimage.com/160x160/dae6fb/35507a&text=NGN");
      node.setAttribute("alt", displayName);
    });
    document.querySelectorAll("[data-site-user-name-missing]").forEach(node => {
      node.hidden = profileState.hasName;
    });
    document.querySelectorAll("[data-site-user-phone-missing]").forEach(node => {
      node.hidden = profileState.hasPhone;
    });
    document.querySelectorAll("[data-site-user-contact-missing]").forEach(node => {
      node.hidden = profileState.hasContact;
    });
    document.querySelectorAll("[data-site-user-profile-missing]").forEach(node => {
      node.hidden = profileState.isComplete;
    });
  }

  function bindLogoutHandlers() {
    document.querySelectorAll("[data-site-auth-logout]").forEach(button => {
      if (button.dataset.authLogoutBound === "true") {
        return;
      }
      button.dataset.authLogoutBound = "true";
      button.addEventListener("click", async event => {
        event.preventDefault();
        await logout();
        window.location.href = "./login.html";
      });
    });
  }

  function bindAuthMenus() {
    document.querySelectorAll("[data-site-auth-menu-trigger]").forEach(button => {
      if (button.dataset.authMenuBound === "true") {
        return;
      }

      button.dataset.authMenuBound = "true";
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        const menu = button.closest(".site-auth-menu");
        const dropdown = menu ? menu.querySelector("[data-site-auth-menu-dropdown]") : null;
        const isExpanded = button.getAttribute("aria-expanded") === "true";

        document.querySelectorAll("[data-site-auth-menu-trigger]").forEach(otherButton => {
          otherButton.setAttribute("aria-expanded", "false");
        });
        document.querySelectorAll("[data-site-auth-menu-dropdown]").forEach(otherDropdown => {
          otherDropdown.hidden = true;
        });

        if (dropdown) {
          button.setAttribute("aria-expanded", String(!isExpanded));
          dropdown.hidden = isExpanded;
        }
      });
    });

    if (document.body.dataset.siteAuthMenuGlobalBound === "true") {
      return;
    }

    document.body.dataset.siteAuthMenuGlobalBound = "true";
    document.addEventListener("click", event => {
      if (event.target.closest(".site-auth-menu")) {
        return;
      }

      document.querySelectorAll("[data-site-auth-menu-trigger]").forEach(button => {
        button.setAttribute("aria-expanded", "false");
      });
      document.querySelectorAll("[data-site-auth-menu-dropdown]").forEach(dropdown => {
        dropdown.hidden = true;
      });
    });
  }

  function bindProtectedActions() {
    document.querySelectorAll("[data-requires-login]").forEach(node => {
      if (node.dataset.authBound === "true") {
        return;
      }
      node.dataset.authBound = "true";

      node.addEventListener("click", async event => {
        const session = await getSession();
        if (session.authenticated) {
          return;
        }

        event.preventDefault();
        const alertMessage = String(node.dataset.loginAlertMessage || "").trim();
        if (alertMessage) {
          window.alert(alertMessage);
        }
        await requireLogin({
          returnTo: node.dataset.returnTo || `${window.location.pathname}${window.location.search}${window.location.hash}`,
          postLoginUrl: node.dataset.postLoginUrl || node.getAttribute("href") || ""
        });
      });
    });
  }

  async function consumePendingAction(session) {
    if (!session.authenticated) {
      return;
    }

    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const payload = JSON.parse(raw);
      if (!payload || !payload.returnTo || !payload.postLoginUrl) {
        window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }

      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (toAbsolutePath(payload.returnTo) !== toAbsolutePath(current)) {
        return;
      }

      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.replace(payload.postLoginUrl);
    } catch (error) {
      window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }

  async function initAuthUi() {
    const session = await getSession();

    document.querySelectorAll("[data-site-auth-nav]").forEach(node => {
      renderAuthNav(node, session);
    });
    document.querySelectorAll("[data-site-auth-mobile]").forEach(node => {
      renderMobileAuth(node, session);
    });

    hydrateUserProfile(session);
    bindLogoutHandlers();
    bindAuthMenus();
    bindProtectedActions();

    if (document.body.dataset.requireAuthPage === "true" && !session.authenticated) {
      await requireLogin({
        returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`
      });
      return;
    }

    await consumePendingAction(session);
  }

  window.SiteAuth = {
    isWechatBrowser,
    getSession,
    getProfileCompletionState,
    requireLogin,
    logout,
    initAuthUi,
    toAbsolutePath
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthUi);
  } else {
    initAuthUi();
  }
})();
