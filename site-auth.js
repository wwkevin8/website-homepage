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
      // Best-effort cleanup for any residual Supabase client storage.
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
      const nickname = session.user.nickname || (session.user.email ? session.user.email.split("@")[0] : "Signed-in user");
      container.innerHTML = `
        <a class="button button-secondary site-auth-nav-button" href="./service-center.html">Service Center</a>
        <button class="button button-secondary site-auth-nav-button" type="button" data-site-auth-logout>Log out</button>
        <div class="site-user-chip">
          <img class="site-user-chip-avatar" src="${session.user.avatar_url || "https://dummyimage.com/80x80/dae6fb/35507a&text=NGN"}" alt="${nickname}">
          <span>${nickname}</span>
        </div>
      `;
      return;
    }

    container.innerHTML = `<a class="button button-secondary site-auth-nav-button" href="./login.html">Sign In</a>`;
  }

  function renderMobileAuth(container, session) {
    if (!container) {
      return;
    }

    if (session.authenticated) {
      container.innerHTML = `
        <a href="./service-center.html">Service Center</a>
        <button type="button" class="site-auth-mobile-button" data-site-auth-logout>Log out</button>
      `;
      return;
    }

    container.innerHTML = `<a href="./login.html">Sign In</a>`;
  }

  function hydrateUserProfile(session) {
    if (!session.authenticated || !session.user) {
      return;
    }

    const user = session.user;
    const displayName = user.nickname || (user.email ? user.email.split("@")[0] : "Signed-in user");

    document.querySelectorAll("[data-site-user-name]").forEach(node => {
      node.textContent = displayName;
    });
    document.querySelectorAll("[data-site-user-email]").forEach(node => {
      node.textContent = user.email || "-";
    });
    document.querySelectorAll("[data-site-user-openid]").forEach(node => {
      node.textContent = user.wechat_openid || "-";
    });
    document.querySelectorAll("[data-site-user-phone]").forEach(node => {
      node.textContent = user.phone || "Not provided yet";
    });
    document.querySelectorAll("[data-site-user-avatar]").forEach(node => {
      node.setAttribute("src", user.avatar_url || "https://dummyimage.com/160x160/dae6fb/35507a&text=NGN");
      node.setAttribute("alt", displayName);
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
