const { ok, methodNotAllowed, serverError } = require("../_lib/http");
const { getEnv } = require("../_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    ok(res, {
      supabaseUrl: getEnv("SUPABASE_URL"),
      supabaseAnonKey: getEnv("SUPABASE_ANON_KEY")
    });
  } catch (error) {
    serverError(res, error);
  }
};
