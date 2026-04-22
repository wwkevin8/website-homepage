const { getEnv } = require("./supabase");

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verifyTurnstileToken(token, remoteIp) {
  const secret = getEnv("TURNSTILE_SECRET_KEY");
  const responseToken = String(token || "").trim();
  if (!responseToken) {
    return {
      success: false,
      message: "Human verification is required"
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
      message: "Unable to verify human check. Please try again."
    };
  }

  if (!payload.success) {
    const codes = Array.isArray(payload["error-codes"]) ? payload["error-codes"] : [];
    let message = "Human verification failed. Please try again.";

    if (codes.includes("missing-input-response") || codes.includes("invalid-input-response")) {
      message = "Human verification is invalid or expired. Please try again.";
    } else if (codes.includes("timeout-or-duplicate")) {
      message = "Human verification expired. Please complete it again.";
    } else if (codes.includes("missing-input-secret") || codes.includes("invalid-input-secret")) {
      message = "Turnstile server configuration is invalid.";
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
