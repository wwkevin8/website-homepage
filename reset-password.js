(async function () {
  const root = document.querySelector("[data-reset-page]");
  if (!root) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const resetToken = String(params.get("token") || "").trim();
  const emailHint = String(params.get("email") || "").trim();
  const requestForm = document.querySelector("[data-reset-request]");
  const completeForm = document.querySelector("[data-reset-complete]");
  const titleNode = document.querySelector("[data-reset-title]");
  const textNode = document.querySelector("[data-reset-text]");
  const emailInput = document.querySelector("[data-reset-email]");
  const requestButton = document.querySelector("[data-reset-request-submit]");
  const verifyButton = document.querySelector("[data-turnstile-verify]");
  const verifyStatus = document.querySelector("[data-turnstile-status]");
  const registerLink = document.querySelector("[data-reset-register-link]");
  const requestMessage = document.querySelector("#resetMessage");
  const completeMessage = document.querySelector("#resetCompleteMessage");
  const passwordInput = document.querySelector("[data-new-password]");
  const confirmPasswordInput = document.querySelector("[data-confirm-password]");
  const completeButton = document.querySelector("[data-reset-complete-submit]");
  const turnstileSlot = document.querySelector("[data-turnstile-slot]");
  const i18n = window.AuthPageI18n;
  const returnTo = window.SiteAuth
    ? window.SiteAuth.toAbsolutePath(new URLSearchParams(window.location.search).get("return_to") || "/service-center.html")
    : "/service-center.html";

  let turnstileWidgetId = null;
  let turnstileToken = "";
  let turnstileBusy = false;
  let requestBusy = false;
  let resetBusy = false;

  function t(key, fallback) {
    return i18n ? i18n.t(key, fallback) : fallback;
  }

  function isResetMode() {
    return Boolean(resetToken);
  }

  function setMessage(node, text, isError) {
    if (!node) {
      return;
    }
    node.textContent = text || "";
    node.classList.toggle("is-error", Boolean(text && isError));
    node.classList.toggle("is-success", Boolean(text && !isError));
  }

  function showRegisterLink(visible) {
    if (!registerLink) {
      return;
    }
    registerLink.hidden = !visible;
  }

  function setVerifyStatus(text, state) {
    if (!verifyStatus) {
      return;
    }
    verifyStatus.textContent = text || "";
    verifyStatus.classList.toggle("is-success", state === "success");
    verifyStatus.classList.toggle("is-error", state === "error");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getTurnstileToken() {
    return turnstileToken;
  }

  function resetTurnstile() {
    turnstileToken = "";
    turnstileBusy = false;
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
    setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    syncRequestButton();
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

  async function ensureTurnstileRendered(siteKey) {
    if (turnstileWidgetId !== null || isResetMode()) {
      return;
    }
    const turnstile = await waitForTurnstile();
    turnstileWidgetId = turnstile.render(turnstileSlot, {
      sitekey: siteKey,
      execution: "execute",
      callback(token) {
        turnstileToken = String(token || "").trim();
        turnstileBusy = false;
        setVerifyStatus(t("humanVerified", "Human verification completed. You can send the reset email now."), "success");
        syncRequestButton();
      },
      "error-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("turnstileLoadFailed", "Human verification failed to load. Please refresh and try again."), "error");
        syncRequestButton();
      },
      "expired-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
        syncRequestButton();
      },
      "timeout-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
        syncRequestButton();
      }
    });
    setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    syncRequestButton();
  }

  async function loadAuthConfig() {
    const response = await fetch("/api/public/auth-config", {
      credentials: "include",
      headers: { Accept: "application/json" }
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

  function syncRequestButton() {
    if (requestButton) {
      requestButton.disabled = requestBusy;
      requestButton.textContent = requestBusy
        ? t("requestBusy", "Sending...")
        : t("requestIdle", "Send reset email");
    }

    if (verifyButton) {
      verifyButton.disabled = requestBusy || turnstileBusy || Boolean(turnstileToken) || isResetMode();
      verifyButton.textContent = turnstileToken
        ? t("verifyHumanDone", "Human check completed")
        : turnstileBusy
          ? t("verifyHumanBusy", "Verifying...")
          : t("verifyHumanIdle", "Click to verify you are human");
    }
  }

  function syncResetButton() {
    if (!completeButton) {
      return;
    }
    completeButton.disabled = resetBusy;
    completeButton.textContent = resetBusy
      ? t("resetBusy", "Submitting...")
      : t("resetIdle", "Set new password");
  }

  function applyModeCopy() {
    root.dataset.resetMode = isResetMode() ? "complete" : "request";
    if (requestForm) {
      requestForm.hidden = isResetMode();
    }
    if (completeForm) {
      completeForm.hidden = !isResetMode();
    }
    if (titleNode) {
      titleNode.textContent = isResetMode()
        ? t("resetTitle", "Set a new password")
        : t("requestTitle", "Send reset email");
    }
    if (textNode) {
      textNode.textContent = isResetMode()
        ? t("resetText", "Enter and confirm your new password to finish the reset.")
        : t("requestText", "Enter your email and complete the human verification. We will send a password reset email.");
    }
  }

  function startHumanVerification() {
    if (!window.turnstile || turnstileWidgetId === null || turnstileToken || isResetMode()) {
      return;
    }
    turnstileBusy = true;
    setVerifyStatus("", "");
    syncRequestButton();
    window.turnstile.execute(turnstileWidgetId);
  }

  async function requestResetEmail() {
    const email = normalizeEmail(emailInput && emailInput.value);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage(requestMessage, t("invalidEmail", "Please enter a valid email address."), true);
      emailInput && emailInput.focus();
      return;
    }

    const token = getTurnstileToken();
    if (!token) {
      setMessage(requestMessage, t("humanRequired", "Please click and complete the human verification first."), true);
      return;
    }

    requestBusy = true;
    syncRequestButton();
    setMessage(requestMessage, "", false);

    try {
      const data = await postJson("/api/auth/request-password-reset", {
        email,
        turnstileToken: token
      });
      if (data && data.accountExists === false) {
        setMessage(requestMessage, t("accountNotFound", "We could not find an account for this email. Please register first."), true);
        showRegisterLink(true);
      } else {
        setMessage(requestMessage, t("emailSent", "If that email exists, we have sent a password reset email. Please check your inbox."), false);
        showRegisterLink(false);
      }
    } catch (error) {
      setMessage(requestMessage, error.message || t("requestFailed", "Failed to send the reset email. Please try again."), true);
      showRegisterLink(false);
    } finally {
      requestBusy = false;
      resetTurnstile();
      syncRequestButton();
    }
  }

  async function resetPassword() {
    const password = String((passwordInput && passwordInput.value) || "");
    const confirmPassword = String((confirmPasswordInput && confirmPasswordInput.value) || "");

    if (!resetToken) {
      setMessage(completeMessage, t("missingToken", "A valid reset link is required. Please request a new one."), true);
      return;
    }

    if (password.length < 8) {
      setMessage(completeMessage, t("invalidPassword", "Password must be at least 8 characters."), true);
      passwordInput && passwordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      setMessage(completeMessage, t("passwordMismatch", "Passwords do not match."), true);
      confirmPasswordInput && confirmPasswordInput.focus();
      return;
    }

    resetBusy = true;
    syncResetButton();
    setMessage(completeMessage, "", false);

    try {
      await postJson("/api/auth/reset-password", {
        token: resetToken,
        password,
        confirmPassword
      });
      setMessage(completeMessage, t("resetSuccess", "Your password has been updated. Signing you in..."), false);
      window.location.replace(returnTo);
    } catch (error) {
      setMessage(completeMessage, error.message || t("resetFailed", "Failed to reset the password. The link may have expired."), true);
    } finally {
      resetBusy = false;
      syncResetButton();
    }
  }

  window.addEventListener("auth-lang-change", () => {
    applyModeCopy();
    if (!turnstileToken && !turnstileBusy && !isResetMode()) {
      setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    }
    syncRequestButton();
    syncResetButton();
  });

  try {
    if (!isResetMode()) {
      const authConfig = await loadAuthConfig();
      if (!authConfig.turnstileSiteKey) {
        throw new Error(t("turnstileLoadFailed", "Human verification failed to load. Please refresh and try again."));
      }
      await ensureTurnstileRendered(authConfig.turnstileSiteKey);
    } else if (emailInput && emailHint) {
      emailInput.value = emailHint;
    }
  } catch (error) {
    setMessage(requestMessage, error.message || t("authConfigFailed", "Failed to load auth configuration. Please try again later."), true);
    requestBusy = true;
    syncRequestButton();
  }

  applyModeCopy();
  showRegisterLink(false);
  syncRequestButton();
  syncResetButton();

  verifyButton && verifyButton.addEventListener("click", startHumanVerification);
  requestButton && requestButton.addEventListener("click", requestResetEmail);
  completeButton && completeButton.addEventListener("click", resetPassword);
})();
