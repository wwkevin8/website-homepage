const { getEnv } = require("./supabase");

function getWebhookConfig() {
  try {
    return {
      url: getEnv("STORAGE_ORDER_WEBHOOK_URL"),
      secret: process.env.STORAGE_ORDER_WEBHOOK_SECRET || ""
    };
  } catch (error) {
    return {
      url: "",
      secret: ""
    };
  }
}

async function sendStorageOrderWebhook(payload) {
  const config = getWebhookConfig();
  if (!config.url) {
    return {
      ok: false,
      error: "Missing STORAGE_ORDER_WEBHOOK_URL"
    };
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.secret ? { "X-Storage-Webhook-Secret": config.secret } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `Webhook responded with ${response.status}${text ? `: ${text.slice(0, 300)}` : ""}`
    };
  }

  return {
    ok: true
  };
}

module.exports = {
  sendStorageOrderWebhook
};
