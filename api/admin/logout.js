const { clearSessionCookie } = require("../_lib/auth");
const { ok, methodNotAllowed, serverError } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    clearSessionCookie(res);
    ok(res, { authenticated: false });
  } catch (error) {
    serverError(res, error);
  }
};
