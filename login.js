(function () {
  const safeNoopLogger = function (eventName, payload) {
    try {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn(`${eventName} logger is not configured`, payload || null);
      }
    } catch (error) {
      // Logging must never block login.
    }
  };

  window.logLoginRequest = window.logLoginRequest || (payload => safeNoopLogger("logLoginRequest", payload));
  window.logCaptchaEvent = window.logCaptchaEvent || (payload => safeNoopLogger("logCaptchaEvent", payload));
  window.logAccountEvent = window.logAccountEvent || (payload => safeNoopLogger("logAccountEvent", payload));
})();

(async function () {
  const root = document.querySelector("[data-login-page]");
  if (!root) {
    return;
  }

  const emailInput = document.querySelector("[data-login-email]");
  const passwordInput = document.querySelector("[data-login-password]");
  const submitButton = document.querySelector("[data-login-submit]");
  const wechatTip = document.querySelector("[data-wechat-auth-tip]");
  const verifyButton = document.querySelector("[data-turnstile-verify]");
  const verifyStatus = document.querySelector("[data-turnstile-status]");
  const turnstileSlot = document.querySelector("[data-turnstile-slot]");
  const turnstileBlock = document.querySelector("[data-turnstile-block]");
  const message = document.querySelector("#loginMessage");
  const returnTo = window.SiteAuth
    ? window.SiteAuth.toAbsolutePath(new URLSearchParams(window.location.search).get("return_to") || "/service-center.html")
    : "/service-center.html";
  const i18n = window.AuthPageI18n;
  let isBusy = false;
  let turnstileWidgetId = null;
  let turnstileToken = "";
  let turnstileBusy = false;
  let needCaptcha = false;
  let authConfig = null;
  let temporarilyBlocked = false;
  let blockCountdown = 0;
  let blockTimer = null;

  function t(key, fallback) {
    return i18n ? i18n.t(key, fallback) : fallback;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getDeviceId() {
    try {
      const storageKey = "ngnAuthDeviceId";
      const existing = window.localStorage && window.localStorage.getItem(storageKey);
      if (existing) {
        return existing;
      }
      const generated = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      window.localStorage && window.localStorage.setItem(storageKey, generated);
      return generated;
    } catch (error) {
      return "";
    }
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

  function clearBlockTimer() {
    if (blockTimer) {
      window.clearInterval(blockTimer);
      blockTimer = null;
    }
  }

  function applyTemporaryBlock(messageText, retryAfter) {
    temporarilyBlocked = true;
    needCaptcha = false;
    resetTurnstile();
    blockCountdown = Math.max(0, Number(retryAfter || 0));
    setMessage(messageText || "登录请求过于频繁，请稍后再试。", true);
    clearBlockTimer();
    if (blockCountdown > 0) {
      blockTimer = window.setInterval(() => {
        blockCountdown -= 1;
        if (blockCountdown <= 0) {
          blockCountdown = 0;
          temporarilyBlocked = false;
          clearBlockTimer();
          setMessage("", false);
        }
        syncButton();
      }, 1000);
    }
    syncButton();
  }

  function syncButton() {
    if (submitButton) {
      submitButton.disabled = isBusy || temporarilyBlocked;
      submitButton.textContent = temporarilyBlocked && blockCountdown > 0
        ? `请 ${blockCountdown} 秒后重试`
        : isBusy
        ? t("loginBusy", "Signing in...")
        : t("loginIdle", "登录");
    }

    if (verifyButton) {
      verifyButton.disabled = isBusy || turnstileBusy || Boolean(turnstileToken) || !needCaptcha;
      verifyButton.textContent = turnstileToken
        ? t("verifyHumanDone", "Human check completed")
        : turnstileBusy
          ? t("verifyHumanBusy", "Verifying...")
          : t("verifyHumanIdle", "Click to verify you are human");
    }

    if (turnstileBlock) {
      turnstileBlock.hidden = !needCaptcha;
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

    const payload = await response.json().catch(() => ({ data: null, error: { message: "请求失败，请稍后再试。" } }));
    if (!response.ok) {
      const error = new Error((payload && payload.error && payload.error.message) || "请求失败，请稍后重试。");
      const details = payload && payload.error && payload.error.details;
      if (details && typeof details === "object") {
        error.details = details;
        error.needCaptcha = Boolean(details.needCaptcha);
        error.cooldown = Boolean(details.cooldown);
        error.temporarilyBlocked = Boolean(details.temporarilyBlocked);
        error.retryAfter = Number(details.retryAfter || 0);
        error.errorCode = details.errorCode || "";
      }
      throw error;
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
          reject(new Error(t("turnstileLoadFailed", "人机验证加载失败。如果你正在微信里打开，请点击右上角 … 选择在浏览器中打开，或稍后重试。")));
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
    setVerifyStatus(t("humanNotVerified", "尚未完成人机校验"), "");
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
        setVerifyStatus(t("humanVerified", "人机验证已完成，请再次点击登录。"), "success");
        syncButton();
      },
      "error-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("turnstileLoadFailed", "人机验证加载失败。如果你正在微信里打开，请点击右上角 … 选择在浏览器中打开，或稍后重试。"), "error");
        syncButton();
      },
      "expired-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "尚未完成人机校验"), "");
        syncButton();
      },
      "timeout-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "尚未完成人机校验"), "");
        syncButton();
      }
    });

    setVerifyStatus(t("humanNotVerified", "尚未完成人机校验"), "");
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
      error: { message: t("authConfigFailed", "认证配置加载失败，请稍后再试。") }
    }));

    if (!response.ok || !payload.data) {
      throw new Error((payload.error && payload.error.message) || t("authConfigFailed", "认证配置加载失败，请稍后再试。"));
    }

    return payload.data;
  }

  function startHumanVerification() {
    if (!needCaptcha || !window.turnstile || turnstileWidgetId === null || turnstileToken) {
      return;
    }
    turnstileBusy = true;
    setVerifyStatus("", "");
    syncButton();
    window.turnstile.execute(turnstileWidgetId);
  }

  async function requireCaptcha(messageText) {
    needCaptcha = true;
    turnstileToken = "";
    turnstileBusy = false;
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    setMessage(messageText || t("humanRequired", "请先点击并完成人机校验。"), true);
    syncButton();

    try {
      if (!authConfig) {
        authConfig = await loadAuthConfig();
      }
      if (!authConfig.turnstileSiteKey) {
        throw new Error(t("turnstileLoadFailed", "人机验证加载失败。如果你正在微信里打开，请点击右上角 … 选择在浏览器中打开，或稍后重试。"));
      }
      await ensureTurnstileRendered(authConfig.turnstileSiteKey);
    } catch (error) {
      turnstileBusy = false;
      setVerifyStatus(error.message || t("turnstileLoadFailed", "人机验证加载失败。如果你正在微信里打开，请点击右上角 … 选择在浏览器中打开，或稍后重试。"), "error");
      syncButton();
    }
  }

  async function submitLogin() {
    const email = normalizeEmail(emailInput && emailInput.value);
    const password = String((passwordInput && passwordInput.value) || "");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage(t("invalidEmail", "请输入有效的邮箱地址。"), true);
      emailInput && emailInput.focus();
      return;
    }

    if (!password) {
      setMessage(t("passwordRequired", "请输入密码。"), true);
      passwordInput && passwordInput.focus();
      return;
    }

    if (needCaptcha && !turnstileToken) {
      setMessage(t("humanRequired", "请先点击并完成人机校验。"), true);
      return;
    }

    isBusy = true;
    syncButton();
    setMessage("", false);

    try {
      await postJson("/api/auth/login", {
        email,
        password,
        deviceId: getDeviceId(),
        turnstileToken: needCaptcha ? turnstileToken : ""
      });
      temporarilyBlocked = false;
      needCaptcha = false;
      window.location.replace(returnTo);
    } catch (error) {
      if (error.temporarilyBlocked) {
        applyTemporaryBlock(error.message, error.retryAfter);
        return;
      }
      if (error.errorCode === "invalid_credentials" && !error.needCaptcha) {
        setMessage("邮箱或密码不正确，请检查后重试", true);
        return;
      }
      if (error.needCaptcha) {
        await requireCaptcha(error.errorCode === "invalid_credentials" ? "邮箱或密码不正确，请检查后重试" : error.message);
      } else {
        setMessage(error.message || t("loginFailed", "邮箱或密码错误。"), true);
      }
    } finally {
      isBusy = false;
      if (needCaptcha) {
        turnstileBusy = false;
      } else {
        resetTurnstile();
      }
      syncButton();
    }
  }

  window.addEventListener("auth-lang-change", () => {
    if (!turnstileToken && !turnstileBusy && needCaptcha) {
      setVerifyStatus(t("humanNotVerified", "尚未完成人机校验"), "");
    }
    syncButton();
  });

  try {
    if (wechatTip && /MicroMessenger/i.test(window.navigator.userAgent || "")) {
      wechatTip.hidden = false;
    }

    if (window.SiteAuth) {
      const session = await window.SiteAuth.getSession();
      if (session.authenticated) {
        window.location.replace(returnTo);
        return;
      }
    }

  } catch (error) {
    setMessage(error.message || t("authConfigFailed", "认证配置加载失败，请稍后再试。"), true);
    isBusy = false;
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
