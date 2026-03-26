const crypto = require("crypto");
const { getEnv } = require("./supabase");
const { unauthorized } = require("./http");

const COOKIE_NAME = "transport_admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function signValue(value) {
  return crypto
    .createHmac("sha256", getEnv("ADMIN_SESSION_SECRET"))
    .update(value)
    .digest("hex");
}

function createSessionToken() {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = JSON.stringify({ expiresAt });
  const encoded = Buffer.from(payload).toString("base64url");
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) {
    return false;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return false;
  }

  const expected = signValue(encoded);
  if (signature.length !== expected.length) {
    return false;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload && Number(payload.expiresAt) > Date.now();
  } catch (error) {
    return false;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((acc, item) => {
    const [rawKey, ...rest] = item.trim().split("=");
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = rest.join("=");
    return acc;
  }, {});
}

function setSessionCookie(res, token) {
  const cookie = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SECONDS}`
  ];

  if (process.env.NODE_ENV === "production") {
    cookie.push("Secure");
  }

  res.setHeader("Set-Cookie", cookie.join("; "));
}

function clearSessionCookie(res) {
  const cookie = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (process.env.NODE_ENV === "production") {
    cookie.push("Secure");
  }

  res.setHeader("Set-Cookie", cookie.join("; "));
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function requireAuth(req, res) {
  if (!isAuthenticated(req)) {
    unauthorized(res);
    return false;
  }
  return true;
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  createSessionToken,
  setSessionCookie,
  clearSessionCookie,
  isAuthenticated,
  requireAuth
};
