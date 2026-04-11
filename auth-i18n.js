(function () {
  const STORAGE_KEY = "ngn-auth-page-lang";
  const translations = window.AUTH_PAGE_TRANSLATIONS || {};

  function detectDefaultLang() {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && translations[saved]) {
      return saved;
    }

    const browserLang = String(window.navigator.language || "").toLowerCase();
    if (browserLang.startsWith("zh")) {
      return "zh-CN";
    }

    return "en";
  }

  let currentLang = detectDefaultLang();

  function getDictionary(lang) {
    return translations[lang] || translations.en || {};
  }

  function t(key, fallback) {
    const dict = getDictionary(currentLang);
    return dict[key] || fallback || key;
  }

  function applyTranslations() {
    document.documentElement.lang = currentLang;

    const dict = getDictionary(currentLang);
    if (dict.pageTitle) {
      document.title = dict.pageTitle;
    }

    document.querySelectorAll("[data-i18n]").forEach(node => {
      const key = node.getAttribute("data-i18n");
      if (!key) {
        return;
      }
      node.textContent = t(key, node.textContent);
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(node => {
      const key = node.getAttribute("data-i18n-placeholder");
      if (!key) {
        return;
      }
      node.setAttribute("placeholder", t(key, node.getAttribute("placeholder") || ""));
    });

    document.querySelectorAll("[data-i18n-content]").forEach(node => {
      const key = node.getAttribute("data-i18n-content");
      if (!key) {
        return;
      }
      node.setAttribute("content", t(key, node.getAttribute("content") || ""));
    });

    document.querySelectorAll("[data-auth-lang]").forEach(button => {
      button.classList.toggle("is-active", button.getAttribute("data-auth-lang") === currentLang);
    });
  }

  function setLang(lang) {
    if (!translations[lang]) {
      return;
    }

    currentLang = lang;
    window.localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations();
    window.dispatchEvent(new CustomEvent("auth-lang-change", { detail: { lang } }));
  }

  function bindSwitcher() {
    document.querySelectorAll("[data-auth-lang]").forEach(button => {
      button.addEventListener("click", () => {
        setLang(button.getAttribute("data-auth-lang"));
      });
    });
  }

  window.AuthPageI18n = {
    getLang: function () {
      return currentLang;
    },
    setLang,
    t
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindSwitcher();
      applyTranslations();
    });
  } else {
    bindSwitcher();
    applyTranslations();
  }
})();
