(async function () {
  const root = document.querySelector("[data-register-page]");
  if (!root) {
    return;
  }

  const emailInput = document.querySelector("[data-register-email]");
  const codeInput = document.querySelector("[data-register-code]");
  const fullNameInput = document.querySelector("[data-register-full-name]");
  const nationalityInput = document.querySelector("[data-register-nationality]");
  const phoneInput = document.querySelector("[data-register-phone]");
  const contactMethodInput = document.querySelector("[data-register-contact-method]");
  const contactHandleInput = document.querySelector("[data-register-contact-handle]");
  const contactHandleLabel = document.querySelector("[data-contact-handle-label]");
  const passwordInput = document.querySelector("[data-register-password]");
  const confirmPasswordInput = document.querySelector("[data-register-confirm-password]");
  const primaryButton = document.querySelector("[data-primary-submit]");
  const verifyButton = document.querySelector("[data-turnstile-verify]");
  const verifyStatus = document.querySelector("[data-turnstile-status]");
  const stepLabel = document.querySelector("[data-auth-step-label]");
  const message = document.querySelector("#registerMessage");
  const stepCode = document.querySelector("[data-step-code]");
  const stepPassword = document.querySelector("[data-step-password]");
  const resendStatus = document.querySelector("[data-resend-status]");
  const resendButton = document.querySelector("[data-resend-button]");
  const turnstileSlot = document.querySelector("[data-turnstile-slot]");
  const turnstileBlock = document.querySelector("[data-turnstile-block]");
  const i18n = window.AuthPageI18n;
  const returnTo = window.SiteAuth
    ? window.SiteAuth.toAbsolutePath(new URLSearchParams(window.location.search).get("return_to") || "/service-center.html")
    : "/service-center.html";

  const STEP_EMAIL = "email";
  const STEP_CODE = "code";
  const STEP_PASSWORD = "password";
  const RESEND_SECONDS = 60;

  let currentStep = STEP_EMAIL;
  let isBusy = false;
  let primaryAction = "send";
  let turnstileWidgetId = null;
  let turnstileToken = "";
  let turnstileBusy = false;
  let signupTicket = "";
  let resendCountdown = 0;
  let resendTimer = null;

  function t(key, fallback) {
    return i18n ? i18n.t(key, fallback) : fallback;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeCode(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 6);
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

  function clearResendTimer() {
    if (resendTimer) {
      window.clearInterval(resendTimer);
      resendTimer = null;
    }
  }

  function updateResendUi() {
    if (!resendStatus || !resendButton) {
      return;
    }

    if (currentStep !== STEP_CODE) {
      resendStatus.textContent = "";
      resendButton.hidden = true;
      return;
    }

    if (resendCountdown > 0) {
      resendStatus.textContent = t("resendCountdown", "{seconds}s").replace("{seconds}", String(resendCountdown));
      resendButton.hidden = true;
      resendButton.disabled = true;
      resendButton.textContent = t("resendCodeIdle", "Resend verification code");
      return;
    }

    resendStatus.textContent = "";
    resendButton.hidden = false;
    resendButton.disabled = isBusy;
    resendButton.textContent = isBusy && primaryAction === "resend"
      ? t("resendCodeBusy", "Resending...")
      : t("resendCodeIdle", "Resend verification code");
  }

  function startResendCountdown(seconds) {
    clearResendTimer();
    resendCountdown = seconds;
    updateResendUi();
    resendTimer = window.setInterval(() => {
      resendCountdown -= 1;
      if (resendCountdown <= 0) {
        resendCountdown = 0;
        clearResendTimer();
      }
      updateResendUi();
    }, 1000);
  }

  function updateContactHandleCopy() {
    if (!contactMethodInput || !contactHandleLabel || !contactHandleInput) {
      return;
    }

    const method = String(contactMethodInput.value || "").trim().toLowerCase();
    if (method === "wechat") {
      contactHandleLabel.textContent = "微信号 / WeChat";
      contactHandleInput.placeholder = "请输入你的微信号";
      return;
    }

    if (method === "whatsapp") {
      contactHandleLabel.textContent = "WhatsApp";
      contactHandleInput.placeholder = "请输入你的 WhatsApp";
      return;
    }

    contactHandleLabel.textContent = t("contactHandleLabel", "WeChat ID / WhatsApp");
    contactHandleInput.placeholder = t("contactHandlePlaceholder", "Enter your WeChat ID or WhatsApp");
  }

  function syncPrimaryButton() {
    if (primaryButton) {
      primaryButton.disabled = isBusy;

      if (currentStep === STEP_PASSWORD) {
        primaryButton.textContent = isBusy
          ? t("registerBusy", "Creating account...")
          : t("registerIdle", "Create account");
      } else if (currentStep === STEP_CODE) {
        primaryButton.textContent = isBusy
          ? t("verifyCodeBusy", "Verifying...")
          : t("verifyCodeIdle", "Verify email");
      } else {
        primaryButton.textContent = isBusy
          ? t("sendCodeBusy", "Sending code...")
          : t("sendCodeIdle", "Send verification code");
      }
    }

    if (verifyButton) {
      verifyButton.disabled = isBusy || turnstileBusy || Boolean(turnstileToken) || currentStep !== STEP_EMAIL;
      verifyButton.textContent = turnstileToken
        ? t("verifyHumanDone", "Human check completed")
        : turnstileBusy
          ? t("verifyHumanBusy", "Verifying...")
          : t("verifyHumanIdle", "Click to verify you are human");
    }
  }

  function setStep(step) {
    currentStep = step;
    root.dataset.authStep = currentStep;
    if (stepCode) {
      stepCode.hidden = currentStep === STEP_EMAIL;
    }
    if (stepPassword) {
      stepPassword.hidden = currentStep !== STEP_PASSWORD;
    }
    if (turnstileBlock) {
      turnstileBlock.hidden = currentStep !== STEP_EMAIL;
    }
    if (emailInput) {
      emailInput.readOnly = currentStep !== STEP_EMAIL;
    }
    if (stepLabel) {
      if (currentStep === STEP_PASSWORD) {
        stepLabel.textContent = t("stepPasswordLabel", "Step 3: Complete your profile and set a password");
      } else if (currentStep === STEP_CODE) {
        stepLabel.textContent = t("stepCodeLabel", "Step 2: Verify email");
      } else {
        stepLabel.textContent = t("stepEmailLabel", "Step 1: Send verification code");
      }
    }
    syncPrimaryButton();
    updateResendUi();
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
    syncPrimaryButton();
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
        setVerifyStatus(t("humanVerified", "Human verification completed. Continue to the next step."), "success");
        syncPrimaryButton();
      },
      "error-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("turnstileLoadFailed", "Human verification failed to load. Please refresh and try again."), "error");
        syncPrimaryButton();
      },
      "expired-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
        syncPrimaryButton();
      },
      "timeout-callback"() {
        turnstileToken = "";
        turnstileBusy = false;
        setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
        syncPrimaryButton();
      }
    });
    setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    syncPrimaryButton();
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

  function startHumanVerification() {
    if (!window.turnstile || turnstileWidgetId === null || turnstileToken || currentStep !== STEP_EMAIL) {
      return;
    }
    turnstileBusy = true;
    setVerifyStatus("", "");
    syncPrimaryButton();
    window.turnstile.execute(turnstileWidgetId);
  }

  async function sendCode(actionType) {
    const email = normalizeEmail(emailInput && emailInput.value);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage(t("invalidEmail", "Please enter a valid email address."), true);
      emailInput && emailInput.focus();
      return;
    }

    const token = getTurnstileToken();
    if (!token) {
      setMessage(t("humanRequired", "Please click and complete the human verification first."), true);
      return;
    }

    isBusy = true;
    primaryAction = actionType;
    setMessage("", false);
    syncPrimaryButton();
    updateResendUi();

    try {
      const data = await postJson("/api/auth/request-signup-code", {
        email,
        turnstileToken: token
      });
      setStep(STEP_CODE);
      startResendCountdown(RESEND_SECONDS);
      if (codeInput) {
        codeInput.value = "";
        codeInput.focus();
      }
      setMessage(
        t("codeSentTo", "Verification code sent to {email}. Enter the 6-digit code to continue.")
          .replace("{email}", (data && data.maskedEmail) || email),
        false
      );
    } catch (error) {
      setMessage(error.message || t("requestCodeFailed", "Failed to send the verification code. Please try again."), true);
    } finally {
      isBusy = false;
      primaryAction = currentStep === STEP_EMAIL ? "send" : "verify";
      resetTurnstile();
      syncPrimaryButton();
      updateResendUi();
    }
  }

  async function verifyCode() {
    const email = normalizeEmail(emailInput && emailInput.value);
    const code = normalizeCode(codeInput && codeInput.value);

    if (!/^\d{6}$/.test(code)) {
      setMessage(t("invalidCode", "Please enter a valid 6-digit verification code."), true);
      codeInput && codeInput.focus();
      return;
    }

    isBusy = true;
    primaryAction = "verify";
    setMessage("", false);
    syncPrimaryButton();
    updateResendUi();

    try {
      const data = await postJson("/api/auth/verify-signup-code", { email, code });
      signupTicket = String((data && data.signupTicket) || "");
      setStep(STEP_PASSWORD);
      updateContactHandleCopy();
      if (fullNameInput) {
        fullNameInput.focus();
      }
      setMessage(t("codeVerified", "Email verified. Complete your profile and set your password to finish registration."), false);
    } catch (error) {
      setMessage(error.message || t("verifyCodeFailed", "The verification code is invalid or expired."), true);
    } finally {
      isBusy = false;
      primaryAction = currentStep === STEP_PASSWORD ? "register" : "verify";
      syncPrimaryButton();
      updateResendUi();
    }
  }

  async function registerAccount() {
    const email = normalizeEmail(emailInput && emailInput.value);
    const fullName = String((fullNameInput && fullNameInput.value) || "").trim();
    const nationality = String((nationalityInput && nationalityInput.value) || "").trim();
    const phone = String((phoneInput && phoneInput.value) || "").trim();
    const contactPreference = String((contactMethodInput && contactMethodInput.value) || "").trim().toLowerCase();
    const contactHandle = String((contactHandleInput && contactHandleInput.value) || "").trim();
    const password = String((passwordInput && passwordInput.value) || "");
    const confirmPassword = String((confirmPasswordInput && confirmPasswordInput.value) || "");

    if (!fullName) {
      setMessage(t("fullNameRequired", "Please enter your full name."), true);
      fullNameInput && fullNameInput.focus();
      return;
    }

    if (!nationality) {
      setMessage(t("nationalityRequired", "Please select your nationality."), true);
      nationalityInput && nationalityInput.focus();
      return;
    }

    if (!phone) {
      setMessage(t("phoneRequired", "Please enter your phone number."), true);
      phoneInput && phoneInput.focus();
      return;
    }

    if (!contactPreference) {
      setMessage(t("contactMethodRequired", "Please choose a contact method."), true);
      contactMethodInput && contactMethodInput.focus();
      return;
    }

    if (!contactHandle) {
      setMessage(t("contactHandleRequired", "Please enter your WeChat ID or WhatsApp."), true);
      contactHandleInput && contactHandleInput.focus();
      return;
    }

    if (password.length < 8) {
      setMessage(t("invalidPassword", "Password must be at least 8 characters."), true);
      passwordInput && passwordInput.focus();
      return;
    }

    if (password !== confirmPassword) {
      setMessage(t("passwordMismatch", "Passwords do not match."), true);
      confirmPasswordInput && confirmPasswordInput.focus();
      return;
    }

    if (!signupTicket) {
      setMessage(t("verifyCodeFailed", "The verification code is invalid or expired."), true);
      setStep(STEP_EMAIL);
      return;
    }

    isBusy = true;
    primaryAction = "register";
    setMessage("", false);
    syncPrimaryButton();

    try {
      await postJson("/api/auth/register", {
        email,
        signupTicket,
        fullName,
        nationality,
        phone,
        contactPreference,
        contactHandle,
        password,
        confirmPassword
      });
      setMessage(t("registerSuccess", "Account created. Signing you in..."), false);
      window.location.replace(returnTo);
    } catch (error) {
      setMessage(error.message || t("registerFailed", "Failed to create your account. Please try again."), true);
    } finally {
      isBusy = false;
      primaryAction = "register";
      syncPrimaryButton();
    }
  }

  window.addEventListener("auth-lang-change", () => {
    if (!turnstileToken && !turnstileBusy && currentStep === STEP_EMAIL) {
      setVerifyStatus(t("humanNotVerified", "Human verification has not been completed"), "");
    }
    setStep(currentStep);
    updateContactHandleCopy();
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
    updateContactHandleCopy();
    setStep(STEP_EMAIL);

    primaryButton && primaryButton.addEventListener("click", async () => {
      if (isBusy) {
        return;
      }
      if (currentStep === STEP_PASSWORD) {
        await registerAccount();
        return;
      }
      if (currentStep === STEP_CODE) {
        await verifyCode();
        return;
      }
      await sendCode("send");
    });

    verifyButton && verifyButton.addEventListener("click", startHumanVerification);
    resendButton && resendButton.addEventListener("click", async () => {
      if (isBusy || resendCountdown > 0) {
        return;
      }
      await sendCode("resend");
    });
    contactMethodInput && contactMethodInput.addEventListener("change", updateContactHandleCopy);
  } catch (error) {
    setMessage(error.message || t("authConfigFailed", "Failed to load auth configuration. Please try again later."), true);
    isBusy = true;
    syncPrimaryButton();
  }
})();
