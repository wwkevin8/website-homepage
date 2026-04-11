(async function () {
  const root = document.querySelector("[data-google-login-page]");
  if (!root) {
    return;
  }

  const button = document.querySelector("[data-google-login-submit]");
  const message = document.querySelector("#googleLoginMessage");
  const returnTo = window.SiteAuth
    ? window.SiteAuth.toAbsolutePath(new URLSearchParams(window.location.search).get("return_to") || "/service-center.html")
    : "/service-center.html";
  const i18n = window.AuthPageI18n;

  function t(key, fallback) {
    return i18n ? i18n.t(key, fallback) : fallback;
  }

  function setMessage(text, isError = false) {
    if (!message) {
      return;
    }
    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(text && isError));
    message.classList.toggle("is-success", Boolean(text && !isError));
  }

  function syncButtonLabel(isBusy) {
    if (!button) {
      return;
    }
    button.disabled = isBusy;
    button.textContent = isBusy ? t("googleBusy", "Redirecting to Google...") : t("googleIdle", "Continue with Google");
  }

  window.addEventListener("auth-lang-change", () => {
    syncButtonLabel(false);
  });

  async function loadSupabase() {
    const [{ createClient }, response] = await Promise.all([
      import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"),
      fetch("/api/public/auth-config")
    ]);

    const payload = await response.json().catch(() => ({
      data: null,
      error: { message: t("configError", "Unable to load auth config.") }
    }));

    if (!response.ok || !payload.data?.supabaseUrl || !payload.data?.supabaseAnonKey) {
      throw new Error(payload.error?.message || t("configMissing", "Missing Supabase auth config."));
    }

    return createClient(payload.data.supabaseUrl, payload.data.supabaseAnonKey, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }

  try {
    if (window.SiteAuth) {
      const session = await window.SiteAuth.getSession();
      if (session.authenticated) {
        window.location.replace(returnTo);
        return;
      }
    }

    const supabase = await loadSupabase();
    syncButtonLabel(false);

    button.addEventListener("click", async () => {
      syncButtonLabel(true);
      setMessage("");

      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth-callback.html?return_to=${encodeURIComponent(returnTo)}`
          }
        });

        if (error) {
          throw error;
        }

        if (data && data.url) {
          window.location.assign(data.url);
          return;
        }
      } catch (error) {
        setMessage(error.message || t("oauthFailed", "Failed to start Google sign-in. Please try again."), true);
        syncButtonLabel(false);
      }
    });
  } catch (error) {
    setMessage(error.message || t("setupFailed", "Login setup failed. Please try again later."), true);
    syncButtonLabel(true);
  }
})();
