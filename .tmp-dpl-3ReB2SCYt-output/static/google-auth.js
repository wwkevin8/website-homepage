(function () {
  const root = document.querySelector("[data-google-login-page]");
  if (!root) {
    return;
  }

  const message = document.querySelector("#googleLoginMessage");
  const button = document.querySelector("[data-google-login-submit]");

  if (message) {
    message.textContent = "Google 登录已下线，请使用邮箱和密码登录，或先注册账号。";
    message.classList.add("is-error");
  }

  if (button) {
    button.disabled = true;
  }

  window.setTimeout(function () {
    window.location.replace("./login.html");
  }, 1200);
})();
