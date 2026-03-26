const { isAuthenticated, MAX_AGE_SECONDS } = require("../_lib/auth");
const { ok, methodNotAllowed, serverError } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    ok(res, { authenticated: isAuthenticated(req), session_max_age_seconds: MAX_AGE_SECONDS });
  } catch (error) {
    serverError(res, error);
  }
};
