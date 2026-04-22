const { ok, methodNotAllowed, serverError } = require("../api/_lib/http");
const { getEnv } = require("../api/_lib/supabase");

function getOptionalEnv(name) {
  const value = process.env[name];
  return value ? String(value).trim() : "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    ok(res, {
      supabaseUrl: getEnv("SUPABASE_URL"),
      supabaseAnonKey: getEnv("SUPABASE_ANON_KEY"),
      turnstileSiteKey: getOptionalEnv("TURNSTILE_SITE_KEY")
    });
  } catch (error) {
    serverError(res, error);
  }
};
