(async function () {
  const root = document.querySelector("[data-login-page]");
  if (!root) {
    return;
  }

  const emailInput = document.querySelector("[data-login-email]");
  const passwordInput = document.querySelector("[data-login-password]");
  const submitButton = document.querySelector("[data-login-submit]");
  const verifyButton = document.querySelector("[data-turnstile-verify]");
  const verifyStatus = document.querySelector("[data-turnstile-status]");
  const turnstileSlot = document.querySelector("[data-turnstile-slot]");
  const message = document.querySelector("#loginMessage");
  const returnTo = window.SiteAuth
    ? window.SiteAuth.toAbsolutePath(new URLSearchParams(window.location.search).get("return_to") || "/service-center.html")
    : "/service-center.html";
  const i18n = window.AuthPageI18n;
  let isBusy = false;
  let turnstileWidgetId = null;
  let turnstileToken = "";
  let turnstileBusy = false;

  function t(key, fallback) {
    return i18n ? i18n.t(key, fallback) : fallback;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function setMessage(text, isError) {
    if (!message) {
      return;
    }
    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(text && isError));
    message.classList.toggle("is-success", Boolean(text && !isError));
  }

  function setVerifyStatus(text, state) {
    if (!verifyStatus) {
      return;
    }
    verifyStatus.textContent = text || "";
    verifyStatus.classList.toggle("is-success", state === "success");
    verifyStatus.classList.toggle("is-error", state === "error");
  }

  function syncButton() {
    if (submitButton) {
      submitButton.disabled = isBusy;
      submitButton.textContent = isBusy
        ? t("loginBusy", "Signing in...")
        : t("loginIdle", "Sign in");
    }

    if (verifyButton) {
      verifyButton.disabled = isBusy || turnstileBusy || Boolean(turnstileToken);
      verifyButton.textContent = turnstileToken
        ? t("verifyHumanDone", "Human check completed")
        : turnstileBusy
          ? t("verifyHumanBusy", "Verifying...")
          : t("verifyHumanIdle", "Click to verify you are human");
    }
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body || {})
    });

    const payload = await response.json().catch(() => ({ data: null, error: { message: "Request failed" } }));
    if (!response.ok) {
      throw new Error((payload && payload.error && payload.error.message) || "Request failed");
    }

    return payload.data;
  }

  async function waitForTurnstile() {
    if (window.turnstile) {
      return window.turnstile;
    }

    await new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = window.setInterval(() => {
        if (window.turnstile) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - start > 10000) {
          window.clearInterval(timer);
          reject(new Error(t("turnstileLoadFailed", "Human verification failed to load. Please refresh and try again.")));
        }
      }, 100);
    });

    return window.turnstile;
  }

  function resetTurnstile() {
    turnstileToken = "";
    turnstileBusy = false;
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    syncButton();
  }

  async function ensureTurnstileRendered(siteKey) {
    if (turnstileWidgetId !== null) {
      return;
    }

    const turnstile = await waitForTurnstile();
    turnstileWidgetId = turnstile.render(turnstileSlot, {
      sitekey: siteKey,
      execution: "execute",
      callback(token) {
        turnstileToken = String(token || "").trim();
        turnstileBusy = false;
        setVerifyStatus(t("humanVerified", "Human verification completed. You can now sign in."), "success");
        syncButton();
      },
      "error-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("turnstileLoadFailed", "Human verification failed to load. Please refresh and try again."), "error");
        syncButton();
      },
      "expired-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
        syncButton();
      },
      "timeout-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
        syncButton();
      }
    });

    setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    syncButton();
  }

  async function loadAuthConfig() {
    const response = await fetch("/api/public/auth-config", {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
    const payload = await response.json().catch(() => ({
      data: null,
      error: { message: t("authConfigFailed", "Failed to load auth configuration. Please try again later.") }
    }));

    if (!response.ok || !payload.data) {
      throw new Error((payload.error && payload.error.message) || t("authConfigFailed", "Failed to load auth configuration. Please try again later."));
    }

    return payload.data;
  }

  function startHumanVerification() {
    if (!window.turnstile || turnstileWidgetId === null || turnstileToken) {
      return;
    }
    turnstileBusy = true;
    setVerifyStatus("", "");
    syncButton();
    window.turnstile.execute(turnstileWidgetId);
  }

  async function submitLogin() {
    const email = normalizeEmail(emailInput && emailInput.value);
    const password = String((passwordInput && passwordInput.value) || "");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage(t("invalidEmail", "Please enter a valid email address."), true);
      emailInput && emailInput.focus();
      return;
    }

    if (!password) {
      setMessage(t("passwordRequired", "Please enter your password."), true);
      passwordInput && passwordInput.focus();
      return;
    }

    if (!turnstileToken) {
      setMessage(t("humanRequired", "Please click and complete the human verification first."), true);
      return;
    }

    isBusy = true;
    syncButton();
    setMessage("", false);

    try {
      await postJson("/api/auth/login", { email, password, turnstileToken: turnstileToken });
      window.location.replace(returnTo);
    } catch (error) {
      setMessage(error.message || t("loginFailed", "Invalid email or password."), true);
    } finally {
      isBusy = false;
      resetTurnstile();
      syncButton();
    }
  }

  window.addEventListener("auth-lang-change", () => {
    if (!turnstileToken && !turnstileBusy) {
      setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    }
    syncButton();
  });

  try {
    if (window.SiteAuth) {
      const session = await window.SiteAuth.getSession();
      if (session.authenticated) {
        window.location.replace(returnTo);
        return;
      }
    }

    const authConfig = await loadAuthConfig();
    if (!authConfig.turnstileSiteKey) {
      throw new Error(t("turnstileLoadFailed", "Human verification failed to load. Please refresh and try again."));
    }
    await ensureTurnstileRendered(authConfig.turnstileSiteKey);
  } catch (error) {
    setMessage(error.message || t("authConfigFailed", "Failed to load auth configuration. Please try again later."), true);
    isBusy = true;
    syncButton();
    return;
  }

  syncButton();

  verifyButton && verifyButton.addEventListener("click", startHumanVerification);
  submitButton && submitButton.addEventListener("click", submitLogin);
  passwordInput && passwordInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !isBusy) {
      event.preventDefault();
      submitLogin();
    }
  });
})();
