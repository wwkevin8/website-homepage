const crypto = require("crypto");

const ADMIN_COOKIE_NAME = "ngn_admin_session";
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const PASSWORD_HASH_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_DIGEST = "sha512";

function getAdminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.USER_SESSION_SECRET;
}

function signValue(value) {
  return crypto
    .createHmac("sha256", getAdminSessionSecret())
    .update(value)
    .digest("hex");
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

function createAdminSessionToken(adminId) {
  return encodeToken({
    adminId,
    expiresAt: Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000
  });
}

function getAdminSessionToken(req) {
  const cookies = parseCookies(req);
  return decodeToken(cookies[ADMIN_COOKIE_NAME]);
}

function setAdminSessionCookie(res, token) {
  appendCookie(res, buildCookie(ADMIN_COOKIE_NAME, token, ADMIN_SESSION_MAX_AGE_SECONDS));
}

function clearAdminSessionCookie(res) {
  appendCookie(res, buildCookie(ADMIN_COOKIE_NAME, "", 0));
}

function pbkdf2Hash(password, salt) {
  return crypto
    .pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST)
    .toString("hex");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = pbkdf2Hash(password, salt);
  return `pbkdf2$${PASSWORD_DIGEST}$${PASSWORD_HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash || !storedHash.startsWith("pbkdf2$")) {
    return false;
  }

  const [, digest, iterationText, salt, hash] = storedHash.split("$");
  const iterations = Number.parseInt(iterationText, 10);
  if (!digest || !iterations || !salt || !hash) {
    return false;
  }

  const calculated = crypto
    .pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, digest)
    .toString("hex");

  if (calculated.length !== hash.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash));
}

function generateTemporaryPassword() {
  return crypto.randomBytes(6).toString("base64url");
}

module.exports = {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  getAdminSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
  hashPassword,
  verifyPassword,
  generateTemporaryPassword
};
