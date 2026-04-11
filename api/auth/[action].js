const { ok, methodNotAllowed, serverError, parseJsonBody, badRequest, unauthorized } = require("../_lib/http");
const { getSupabaseAdmin } = require("../_lib/supabase");
const {
  normalizeEmail,
  upsertSiteUserByEmail,
  upsertSiteUserProfile
} = require("../_lib/email-login");
const {
  getAuthenticatedUser,
  clearUserSessionCookie,
  getUserSession,
  createUserSessionToken,
  setUserSessionCookie
} = require("../_lib/user-auth");

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

    if (action === "sync") {
      if (req.method !== "POST") {
        methodNotAllowed(res, ["POST"]);
        return;
      }

      const body = await parseJsonBody(req);
      if (!body.access_token) {
        badRequest(res, "access_token is required");
        return;
      }

      const supabase = getSupabaseAdmin();
      const { data: authUserData, error: authUserError } = await supabase.auth.getUser(body.access_token);

      if (authUserError) {
        unauthorized(res, authUserError.message || "Invalid auth token");
        return;
      }

      const authUser = authUserData && authUserData.user;
      const email = authUser && authUser.email ? String(authUser.email).trim().toLowerCase() : "";

      if (!email) {
        badRequest(res, "Authenticated user email is required");
        return;
      }

      const nickname =
        (authUser.user_metadata && (authUser.user_metadata.full_name || authUser.user_metadata.name)) ||
        "";
      const avatarUrl =
        (authUser.user_metadata && (authUser.user_metadata.avatar_url || authUser.user_metadata.picture)) ||
        null;

      const loginAt = new Date().toISOString();
      const provider = "google";
      const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null;
      const ip = getRequestIp(req);

      const user = await upsertSiteUserProfile(supabase, {
        email,
        nickname,
        avatar_url: avatarUrl
      });

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
        .select("id, email, wechat_openid, nickname, avatar_url, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at")
        .single();

      if (updateUserError) {
        throw updateUserError;
      }

      setUserSessionCookie(res, createUserSessionToken(user.id));
      ok(res, {
        authenticated: true,
        user: updatedUser
      });
      return;
    }

    methodNotAllowed(res, []);
  } catch (error) {
    serverError(res, error);
  }
};
