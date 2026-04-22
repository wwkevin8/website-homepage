const crypto = require("crypto");
const {
  ok,
  methodNotAllowed,
  serverError,
  parseJsonBody,
  badRequest,
  unauthorized,
  tooManyRequests
} = require("../_lib/http");
const { getSupabaseAdmin } = require("../_lib/supabase");
const { normalizeEmail } = require("../_lib/email-login");
const { sendAuthCodeEmail, sendPasswordResetEmail } = require("../_lib/auth-email");
const { verifyTurnstileToken } = require("../_lib/turnstile");
const { hashPassword, verifyPassword } = require("../_lib/admin-security");
const {
  getAuthenticatedUser,
  clearUserSessionCookie,
  getUserSession,
  createUserSessionToken,
  setUserSessionCookie
} = require("../_lib/user-auth");

const AUTH_CODE_TTL_MINUTES = 10;
const AUTH_CODE_TTL_MS = AUTH_CODE_TTL_MINUTES * 60 * 1000;
const AUTH_CODE_REQUEST_COOLDOWN_SECONDS = 60;
const AUTH_CODE_HOURLY_LIMIT = 5;
const AUTH_CODE_IP_WINDOW_MINUTES = 10;
const AUTH_CODE_IP_MAX_REQUESTS = 5;
const AUTH_CODE_MAX_ATTEMPTS = 5;
const SIGNUP_TICKET_TTL_MINUTES = 20;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 60;
const PASSWORD_MIN_LENGTH = 8;
const SIGNUP_CODE_PURPOSE = "signup";
const AUTH_USER_SELECT = "id, email, created_at, nickname, avatar_url, phone, contact_preference, wechat_id, whatsapp_contact, nationality, email_verified_at";
const OPTIONAL_SITE_USER_COLUMNS = new Set([
  "nickname",
  "nationality",
  "contact_preference",
  "wechat_id",
  "whatsapp_contact"
]);

function getRequestIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePassword(value) {
  return String(value || "");
}

function validatePasswordFields(password, confirmPassword) {
  const normalizedPassword = normalizePassword(password);
  const normalizedConfirm = normalizePassword(confirmPassword);

  if (normalizedPassword.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }

  if (normalizedPassword !== normalizedConfirm) {
    throw new Error("Passwords do not match");
  }

  return normalizedPassword;
}

function createLoginCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signValue(value) {
  return crypto
    .createHmac("sha256", process.env.USER_SESSION_SECRET || "")
    .update(value)
    .digest("hex");
}

function encodeSignedPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signValue(encoded)}`;
}

function decodeSignedPayload(token) {
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

function createSignupTicket(email, codeId) {
  return encodeSignedPayload({
    type: "signup_ticket",
    email: normalizeEmail(email),
    codeId,
    expiresAt: Date.now() + SIGNUP_TICKET_TTL_MINUTES * 60 * 1000
  });
}

function parseSignupTicket(ticket, email) {
  const payload = decodeSignedPayload(ticket);
  if (!payload || payload.type !== "signup_ticket") {
    return null;
  }
  if (normalizeEmail(payload.email) !== normalizeEmail(email)) {
    return null;
  }
  if (!payload.codeId) {
    return null;
  }
  return payload;
}

function hashScopedValue(scope, value) {
  return crypto
    .createHmac("sha256", process.env.USER_SESSION_SECRET || "")
    .update(`${scope}:${String(value || "").trim()}`)
    .digest("hex");
}

function hashLoginCode(email, code) {
  return hashScopedValue(`signup_code:${normalizeEmail(email)}`, String(code || "").trim());
}

function createPasswordResetToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function hashPasswordResetToken(token) {
  return hashScopedValue("password_reset", token);
}

function maskEmail(email) {
  return String(email || "").replace(/(^..)[^@]*(@.*$)/, "$1***$2");
}

function extractMissingSiteUserColumn(error) {
  const message = String((error && error.message) || "");
  if (!message) {
    return "";
  }

  const schemaCacheMatch = message.match(/Could not find the '([^']+)' column of 'site_users'/i);
  if (schemaCacheMatch && schemaCacheMatch[1]) {
    return schemaCacheMatch[1];
  }

  const postgresMatch = message.match(/column\s+(?:site_users\.)?("?)([a-zA-Z0-9_]+)\1\s+does not exist/i);
  if (postgresMatch && postgresMatch[2]) {
    return postgresMatch[2];
  }

  return "";
}

function normalizeProfileText(value) {
  return String(value || "").trim();
}

function normalizeNationality(value) {
  return String(value || "").trim();
}

function normalizeContactPreference(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized !== "wechat" && normalized !== "whatsapp") {
    throw new Error("contact_preference is invalid");
  }
  return normalized;
}

function validateRegistrationPayload(body) {
  const fullName = normalizeProfileText(body.fullName || body.full_name || body.nickname);
  const nationality = normalizeNationality(body.nationality);
  const phone = normalizeProfileText(body.phone);
  const contactPreference = normalizeContactPreference(body.contactPreference || body.contact_preference);
  const contactHandle = normalizeProfileText(body.contactHandle || body.contact_handle);

  if (!fullName) {
    throw new Error("Full name is required");
  }
  if (!nationality) {
    throw new Error("Nationality is required");
  }
  if (!phone) {
    throw new Error("Phone number is required");
  }
  if (!contactPreference) {
    throw new Error("A contact method is required");
  }
  if (!contactHandle) {
    throw new Error(contactPreference === "wechat" ? "WeChat ID is required" : "WhatsApp is required");
  }

  return {
    fullName,
    nationality,
    phone,
    contactPreference,
    wechatId: contactPreference === "wechat" ? contactHandle : null,
    whatsappContact: contactPreference === "whatsapp" ? contactHandle : null
  };
}

function validateProfilePayload(body) {
  const nickname = normalizeProfileText(body.nickname);
  const phone = normalizeProfileText(body.phone);
  const contactPreference = normalizeContactPreference(body.contact_preference);
  const wechatId = normalizeProfileText(body.wechat_id);
  const whatsappContact = normalizeProfileText(body.whatsapp_contact);

  if (!nickname) {
    throw new Error("nickname is required");
  }
  if (!phone) {
    throw new Error("phone is required");
  }
  if (!wechatId) {
    throw new Error("wechat_id is required");
  }

  return {
    nickname,
    phone,
    contactPreference: contactPreference || "wechat",
    wechatId,
    whatsappContact: whatsappContact || ""
  };
}

function getPasswordResetBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = req.headers.host;
  if (!host) {
    return "http://localhost:3000";
  }

  const isLocalhost = /^localhost(?::\d+)?$/i.test(host) || /^127\.0\.0\.1(?::\d+)?$/i.test(host);
  const protocol = isLocalhost ? "http" : "https";
  return `${protocol}://${host}`;
}

async function findSiteUserByEmail(supabase, email) {
  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, password_hash, first_login_at, last_login_at, last_login_provider, login_count, created_at, email_verified_at")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function finalizeUserLogin({ supabase, user, provider, req, res }) {
  const loginAt = new Date().toISOString();
  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
  const ip = getRequestIp(req);

  const { error: loginEventError } = await supabase.from("user_login_events").insert({
    user_id: user.id,
    provider,
    login_at: loginAt,
    ip,
    user_agent: userAgent
  });

  if (loginEventError) {
    throw loginEventError;
  }

  const nextLoginCount = Number(user.login_count || 0) + 1;
  const loginSummaryPayload = {
    last_login_at: loginAt,
    last_login_provider: provider,
    login_count: nextLoginCount
  };

  if (!user.first_login_at) {
    loginSummaryPayload.first_login_at = loginAt;
  }

  const { data: updatedUser, error: updateUserError } = await supabase
    .from("site_users")
    .update(loginSummaryPayload)
    .eq("id", user.id)
    .select(AUTH_USER_SELECT)
    .single();

  if (updateUserError) {
    throw updateUserError;
  }

  setUserSessionCookie(res, createUserSessionToken(user.id));
  return updatedUser;
}

async function createSiteUserWithFallback(supabase, payload) {
  const insertPayload = { ...payload };
  let lastError = null;

  while (true) {
    const { data, error } = await supabase
      .from("site_users")
      .insert(insertPayload)
      .select("id, email, first_login_at, last_login_at, last_login_provider, login_count, created_at")
      .single();

    if (!error) {
      return data;
    }

    lastError = error;
    const missingColumn = extractMissingSiteUserColumn(error);

    if (!missingColumn || !OPTIONAL_SITE_USER_COLUMNS.has(missingColumn) || !Object.prototype.hasOwnProperty.call(insertPayload, missingColumn)) {
      throw error;
    }

    delete insertPayload[missingColumn];
  }
}

async function enforceEmailRateLimit({ supabase, table, email, cooldownSeconds, hourlyLimit, extraFilters }) {
  const cooldownThreshold = new Date(Date.now() - cooldownSeconds * 1000).toISOString();
  let cooldownQuery = supabase
    .from(table)
    .select("id, created_at")
    .eq("email", email)
    .gte("created_at", cooldownThreshold)
    .order("created_at", { ascending: false })
    .limit(1);

  if (typeof extraFilters === "function") {
    cooldownQuery = extraFilters(cooldownQuery);
  }

  const { data: recentRow, error: recentError } = await cooldownQuery.maybeSingle();
  if (recentError) {
    throw recentError;
  }
  if (recentRow) {
    return `This email has requested a message recently. Please wait ${cooldownSeconds} seconds and try again.`;
  }

  const hourThreshold = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let hourlyQuery = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", hourThreshold);

  if (typeof extraFilters === "function") {
    hourlyQuery = extraFilters(hourlyQuery);
  }

  const { count, error: countError } = await hourlyQuery;
  if (countError) {
    throw countError;
  }

  if (Number(count || 0) >= hourlyLimit) {
    return `This email has reached the hourly request limit. Please try again later.`;
  }

  return null;
}

async function enforceIpRateLimit({ supabase, table, ip, windowMinutes, maxRequests, extraFilters }) {
  if (!ip) {
    return null;
  }

  const threshold = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("request_ip", ip)
    .gte("created_at", threshold);

  if (typeof extraFilters === "function") {
    query = extraFilters(query);
  }

  const { count, error } = await query;
  if (error) {
    throw error;
  }

  if (Number(count || 0) >= maxRequests) {
    return `Too many requests have been sent from this network. Please wait ${windowMinutes} minutes and try again.`;
  }

  return null;
}

module.exports = async function handler(req, res) {
  const { action } = req.query || {};

  try {
    if (action === "session") {
      if (req.method !== "GET") {
        methodNotAllowed(res, ["GET"]);
        return;
      }

      const supabase = getSupabaseAdmin();
      const user = await getAuthenticatedUser(req, supabase);

      if (!user && getUserSession(req)) {
        clearUserSessionCookie(res);
      }

      ok(res, {
        authenticated: Boolean(user),
        user: user || null
      });
      return;
    }

    if (action === "logout") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      clearUserSessionCookie(res);
      ok(res, { authenticated: false, user: null });
      return;
    }

    if (action === "profile") {
      const supabase = getSupabaseAdmin();
      const user = await getAuthenticatedUser(req, supabase);

      if (!user) {
        unauthorized(res);
        return;
      }

      if (req.method === "GET") {
        ok(res, user);
        return;
      }

      if (req.method !== "POST") {
        methodNotAllowed(res, ["GET", "POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      if (Object.prototype.hasOwnProperty.call(body, "email")) {
        badRequest(res, "Email cannot be updated from profile settings");
        return;
      }

      let nextProfile;
      try {
        nextProfile = validateProfilePayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { data: updatedUser, error: updateError } = await supabase
        .from("site_users")
        .update({
          nickname: nextProfile.nickname,
          phone: nextProfile.phone,
          contact_preference: nextProfile.contactPreference,
          wechat_id: nextProfile.wechatId || null,
          whatsapp_contact: nextProfile.whatsappContact || null
        })
        .eq("id", user.id)
        .select("id, email, nickname, avatar_url, phone, contact_preference, wechat_id, whatsapp_contact, created_at, email_verified_at")
        .single();

      if (updateError) {
        throw updateError;
      }

      ok(res, updatedUser);
      return;
    }

    if (action === "login") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = normalizePassword(body.password);
      const turnstileToken = String(body.turnstileToken || "").trim();

      if (!email || !isValidEmail(email)) {
        badRequest(res, "A valid email address is required");
        return;
      }

      if (!password) {
        badRequest(res, "Password is required");
        return;
      }

      const requestIp = getRequestIp(req);
      const turnstileResult = await verifyTurnstileToken(turnstileToken, requestIp);
      if (!turnstileResult.success) {
        badRequest(res, turnstileResult.message || "Human verification failed. Please try again.");
        return;
      }

      const supabase = getSupabaseAdmin();
      const user = await findSiteUserByEmail(supabase, email);
      if (!user) {
        unauthorized(res, "Invalid email or password");
        return;
      }

      if (!user.password_hash) {
        unauthorized(res, "This account needs to set a password first. Please use Forgot password.");
        return;
      }

      if (!verifyPassword(password, user.password_hash)) {
        unauthorized(res, "Invalid email or password");
        return;
      }

      if (!user.email_verified_at) {
        unauthorized(res, "Please complete email verification during registration before signing in.");
        return;
      }

      const updatedUser = await finalizeUserLogin({
        supabase,
        user,
        provider: "password",
        req,
        res
      });

      ok(res, {
        authenticated: true,
        user: updatedUser
      });
      return;
    }

    if (action === "request-signup-code") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const turnstileToken = String(body.turnstileToken || "").trim();

      if (!email || !isValidEmail(email)) {
        badRequest(res, "A valid email address is required");
        return;
      }

      const supabase = getSupabaseAdmin();
      const existingUser = await findSiteUserByEmail(supabase, email);
      if (existingUser) {
        badRequest(res, "This email is already registered. Please sign in or reset your password.");
        return;
      }

      const requestIp = getRequestIp(req);
      const turnstileResult = await verifyTurnstileToken(turnstileToken, requestIp);
      if (!turnstileResult.success) {
        badRequest(res, turnstileResult.message || "Human verification failed. Please try again.");
        return;
      }

      const emailRateMessage = await enforceEmailRateLimit({
        supabase,
        table: "email_login_codes",
        email,
        cooldownSeconds: AUTH_CODE_REQUEST_COOLDOWN_SECONDS,
        hourlyLimit: AUTH_CODE_HOURLY_LIMIT,
        extraFilters: query => query.eq("purpose", SIGNUP_CODE_PURPOSE)
      });
      if (emailRateMessage) {
        tooManyRequests(res, emailRateMessage);
        return;
      }

      const ipRateMessage = await enforceIpRateLimit({
        supabase,
        table: "email_login_codes",
        ip: requestIp,
        windowMinutes: AUTH_CODE_IP_WINDOW_MINUTES,
        maxRequests: AUTH_CODE_IP_MAX_REQUESTS,
        extraFilters: query => query.eq("purpose", SIGNUP_CODE_PURPOSE)
      });
      if (ipRateMessage) {
        tooManyRequests(res, ipRateMessage);
        return;
      }

      const code = createLoginCode();
      const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();
      const { data: insertedCode, error: insertCodeError } = await supabase
        .from("email_login_codes")
        .insert({
          email,
          purpose: SIGNUP_CODE_PURPOSE,
          code_hash: hashLoginCode(email, code),
          request_ip: requestIp,
          expires_at: expiresAt
        })
        .select("id")
        .single();

      if (insertCodeError) {
        throw insertCodeError;
      }

      try {
        await sendAuthCodeEmail({
          email,
          code,
          expiresInMinutes: AUTH_CODE_TTL_MINUTES
        });
      } catch (error) {
        await supabase.from("email_login_codes").delete().eq("id", insertedCode.id);
        throw error;
      }

      ok(res, {
        sent: true,
        maskedEmail: maskEmail(email),
        expiresInMinutes: AUTH_CODE_TTL_MINUTES
      });
      return;
    }

    if (action === "verify-signup-code") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const code = String(body.code || "").trim();

      if (!email || !isValidEmail(email)) {
        badRequest(res, "A valid email address is required");
        return;
      }

      if (!/^\d{6}$/.test(code)) {
        badRequest(res, "A valid 6-digit verification code is required");
        return;
      }

      const supabase = getSupabaseAdmin();
      const existingUser = await findSiteUserByEmail(supabase, email);
      if (existingUser) {
        badRequest(res, "This email is already registered. Please sign in or reset your password.");
        return;
      }

      const nowIso = new Date().toISOString();
      const { data: codeRow, error: codeLookupError } = await supabase
        .from("email_login_codes")
        .select("id, email, purpose, code_hash, attempt_count, expires_at, consumed_at, created_at")
        .eq("email", email)
        .eq("purpose", SIGNUP_CODE_PURPOSE)
        .is("consumed_at", null)
        .gte("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (codeLookupError) {
        throw codeLookupError;
      }

      if (!codeRow) {
        unauthorized(res, "Verification code is invalid or expired");
        return;
      }

      if (Number(codeRow.attempt_count || 0) >= AUTH_CODE_MAX_ATTEMPTS) {
        unauthorized(res, "Too many failed attempts. Please request a new code");
        return;
      }

      if (hashLoginCode(email, code) !== codeRow.code_hash) {
        const { error: updateAttemptError } = await supabase
          .from("email_login_codes")
          .update({ attempt_count: Number(codeRow.attempt_count || 0) + 1 })
          .eq("id", codeRow.id);

        if (updateAttemptError) {
          throw updateAttemptError;
        }

        unauthorized(res, "Verification code is invalid or expired");
        return;
      }

      const { error: consumeCodeError } = await supabase
        .from("email_login_codes")
        .update({ consumed_at: nowIso })
        .eq("id", codeRow.id)
        .is("consumed_at", null);

      if (consumeCodeError) {
        throw consumeCodeError;
      }

      ok(res, {
        verified: true,
        signupTicket: createSignupTicket(email, codeRow.id),
        expiresInMinutes: SIGNUP_TICKET_TTL_MINUTES
      });
      return;
    }

    if (action === "register") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const signupTicket = String(body.signupTicket || "").trim();
      let registrationProfile;

      if (!email || !isValidEmail(email)) {
        badRequest(res, "A valid email address is required");
        return;
      }

      let password;
      try {
        password = validatePasswordFields(body.password, body.confirmPassword);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      try {
        registrationProfile = validateRegistrationPayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const ticketPayload = parseSignupTicket(signupTicket, email);
      if (!ticketPayload) {
        unauthorized(res, "Your signup verification has expired. Please request a new code.");
        return;
      }

      const supabase = getSupabaseAdmin();
      const existingUser = await findSiteUserByEmail(supabase, email);
      if (existingUser) {
        badRequest(res, "This email is already registered. Please sign in or reset your password.");
        return;
      }

      const { data: codeRow, error: codeError } = await supabase
        .from("email_login_codes")
        .select("id, email, purpose, consumed_at")
        .eq("id", ticketPayload.codeId)
        .eq("email", email)
        .eq("purpose", SIGNUP_CODE_PURPOSE)
        .not("consumed_at", "is", null)
        .maybeSingle();

      if (codeError) {
        throw codeError;
      }

      if (!codeRow) {
        unauthorized(res, "Your signup verification has expired. Please request a new code.");
        return;
      }

      const nickname = email.split("@")[0] || "user";
      const nowIso = new Date().toISOString();
      const createdUser = await createSiteUserWithFallback(supabase, {
        email,
        nickname: registrationProfile.fullName || nickname,
        nationality: registrationProfile.nationality,
        phone: registrationProfile.phone,
        contact_preference: registrationProfile.contactPreference,
        wechat_id: registrationProfile.wechatId,
        whatsapp_contact: registrationProfile.whatsappContact,
        password_hash: hashPassword(password),
        password_set_at: nowIso,
        email_verified_at: nowIso
      });

      const updatedUser = await finalizeUserLogin({
        supabase,
        user: createdUser,
        provider: "password",
        req,
        res
      });

      ok(res, {
        authenticated: true,
        user: updatedUser
      });
      return;
    }

    if (action === "request-password-reset") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const turnstileToken = String(body.turnstileToken || "").trim();

      if (!email || !isValidEmail(email)) {
        badRequest(res, "A valid email address is required");
        return;
      }

      const requestIp = getRequestIp(req);
      const turnstileResult = await verifyTurnstileToken(turnstileToken, requestIp);
      if (!turnstileResult.success) {
        badRequest(res, turnstileResult.message || "Human verification failed. Please try again.");
        return;
      }

      const supabase = getSupabaseAdmin();
      const emailRateMessage = await enforceEmailRateLimit({
        supabase,
        table: "password_reset_tokens",
        email,
        cooldownSeconds: AUTH_CODE_REQUEST_COOLDOWN_SECONDS,
        hourlyLimit: AUTH_CODE_HOURLY_LIMIT
      });
      if (emailRateMessage) {
        tooManyRequests(res, emailRateMessage);
        return;
      }

      const ipRateMessage = await enforceIpRateLimit({
        supabase,
        table: "password_reset_tokens",
        ip: requestIp,
        windowMinutes: AUTH_CODE_IP_WINDOW_MINUTES,
        maxRequests: AUTH_CODE_IP_MAX_REQUESTS
      });
      if (ipRateMessage) {
        tooManyRequests(res, ipRateMessage);
        return;
      }

      const user = await findSiteUserByEmail(supabase, email);
      if (!user) {
        ok(res, {
          sent: false,
          accountExists: false,
          shouldRegister: true
        });
        return;
      }

      const token = createPasswordResetToken();
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
      const { data: tokenRow, error: insertTokenError } = await supabase
        .from("password_reset_tokens")
        .insert({
          email,
          user_id: user.id,
          token_hash: hashPasswordResetToken(token),
          request_ip: requestIp,
          expires_at: expiresAt
        })
        .select("id")
        .single();

      if (insertTokenError) {
        throw insertTokenError;
      }

      try {
        const resetUrl = `${getPasswordResetBaseUrl(req)}/reset-password.html?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
        await sendPasswordResetEmail({
          email,
          resetUrl,
          expiresInMinutes: PASSWORD_RESET_TOKEN_TTL_MINUTES
        });
      } catch (error) {
        await supabase.from("password_reset_tokens").delete().eq("id", tokenRow.id);
        throw error;
      }

      ok(res, {
        sent: true,
        accountExists: true
      });
      return;
    }

    if (action === "reset-password") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      const token = String(body.token || "").trim();

      if (!token) {
        badRequest(res, "Reset token is required");
        return;
      }

      let password;
      try {
        password = validatePasswordFields(body.password, body.confirmPassword);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const supabase = getSupabaseAdmin();
      const nowIso = new Date().toISOString();
      const { data: tokenRow, error: tokenLookupError } = await supabase
        .from("password_reset_tokens")
        .select("id, email, user_id, token_hash, expires_at, consumed_at, created_at")
        .eq("token_hash", hashPasswordResetToken(token))
        .is("consumed_at", null)
        .gte("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tokenLookupError) {
        throw tokenLookupError;
      }

      if (!tokenRow) {
        unauthorized(res, "This password reset link is invalid or expired.");
        return;
      }

      const { data: updatedUser, error: updateUserError } = await supabase
        .from("site_users")
        .update({
          password_hash: hashPassword(password),
          password_set_at: nowIso,
          email_verified_at: nowIso
        })
        .eq("id", tokenRow.user_id)
        .select("id, email, first_login_at, last_login_at, last_login_provider, login_count, created_at")
        .single();

      if (updateUserError) {
        throw updateUserError;
      }

      const { error: consumeTokenError } = await supabase
        .from("password_reset_tokens")
        .update({ consumed_at: nowIso })
        .eq("id", tokenRow.id)
        .is("consumed_at", null);

      if (consumeTokenError) {
        throw consumeTokenError;
      }

      const loggedInUser = await finalizeUserLogin({
        supabase,
        user: updatedUser,
        provider: "password",
        req,
        res
      });

      ok(res, {
        authenticated: true,
        user: loggedInUser
      });
      return;
    }

    methodNotAllowed(res, []);
  } catch (error) {
    serverError(res, error);
  }
};
