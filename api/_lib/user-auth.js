const crypto = require("crypto");
const { getEnv } = require("./supabase");

const COOKIE_NAME = "ngn_user_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function signValue(value) {
  return crypto
    .createHmac("sha256", getEnv("USER_SESSION_SECRET"))
    .update(value)
    .digest("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(";").reduce((accumulator, item) => {
    const [rawKey, ...rest] = item.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }
    accumulator[rawKey] = rest.join("=");
    return accumulator;
  }, {});
}

function encodeToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signValue(encoded)}`;
}

function decodeToken(token) {
  if (!token || !token.includes(".")) {
    return null;
  }

  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    return null;
  }

  const expected = signValue(encoded);
  if (signature.length !== expected.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || Number(payload.expiresAt) <= Date.now()) {
      return null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

function buildCookie(name, value, maxAge) {
  const cookie = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];

  if (process.env.NODE_ENV === "production") {
    cookie.push("Secure");
  }

  return cookie.join("; ");
}

function appendCookie(res, cookieValue) {
  const current = typeof res.getHeader === "function" ? res.getHeader("Set-Cookie") : undefined;
  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, cookieValue]);
    return;
  }

  res.setHeader("Set-Cookie", [current, cookieValue]);
}

function createUserSessionToken(userId) {
  return encodeToken({
    userId,
    expiresAt: Date.now() + MAX_AGE_SECONDS * 1000
  });
}

function getUserSession(req) {
  const cookies = parseCookies(req);
  return decodeToken(cookies[COOKIE_NAME]);
}

function setUserSessionCookie(res, token) {
  appendCookie(res, buildCookie(COOKIE_NAME, token, MAX_AGE_SECONDS));
}

function clearUserSessionCookie(res) {
  appendCookie(res, buildCookie(COOKIE_NAME, "", 0));
}

async function getAuthenticatedUser(req, supabase) {
  const session = getUserSession(req);
  if (!session || !session.userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, wechat_openid, nickname, avatar_url, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  parseCookies,
  createUserSessionToken,
  getUserSession,
  setUserSessionCookie,
  clearUserSessionCookie,
  getAuthenticatedUser
};
