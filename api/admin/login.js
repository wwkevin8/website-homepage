const { parseJsonBody, ok, badRequest, methodNotAllowed, serverError, unauthorized } = require("../_lib/http");
const { createSessionToken, setSessionCookie } = require("../_lib/auth");
const { getEnv } = require("../_lib/supabase");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const body = await parseJsonBody(req);
    if (!body.password) {
      badRequest(res, "password is required");
      return;
    }

    if (body.password !== getEnv("ADMIN_PASSWORD")) {
      unauthorized(res, "Invalid password");
      return;
    }

    setSessionCookie(res, createSessionToken());
    ok(res, { authenticated: true });
  } catch (error) {
    serverError(res, error);
  }
};
