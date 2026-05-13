const { getEnv } = require("./supabase");

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstileToken(token, remoteIp) {
  const secret = getEnv("TURNSTILE_SECRET_KEY");
  const responseToken = String(token || "").trim();
  if (!responseToken) {
    return {
      success: false,
      message: "请先完成人机验证。"
    };
  }

  const body = new URLSearchParams({
    secret,
    response: responseToken
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    return {
      success: false,
      message: "人机验证失败，请刷新页面或在浏览器中打开后重试。"
    };
  }

  if (!payload.success) {
    const codes = Array.isArray(payload["error-codes"]) ? payload["error-codes"] : [];
    let message = "人机验证失败，请刷新页面或在浏览器中打开后重试。";

    if (codes.includes("missing-input-response") || codes.includes("invalid-input-response")) {
      message = "人机验证无效或已过期，请重新验证。";
    } else if (codes.includes("timeout-or-duplicate")) {
      message = "人机验证已过期，请重新验证。";
    } else if (codes.includes("missing-input-secret") || codes.includes("invalid-input-secret")) {
      message = "人机验证服务配置异常，请稍后重试。";
    }

    return {
      success: false,
      message
    };
  }

  return {
    success: true,
    message: ""
  };
}

module.exports = {
  verifyTurnstileToken
};
