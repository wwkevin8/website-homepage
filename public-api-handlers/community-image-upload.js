const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { badRequest, created, forbidden, methodNotAllowed, parseJsonBody, serverError, tooManyRequests, unauthorized } = require("../api/_lib/http");
const { createCommunityImageUpload } = require("../api/_lib/community");

function sendError(res, error, fallbackMessage) {
  const message = error?.message || fallbackMessage;
  if (error?.statusCode === 401) {
    unauthorized(res, message);
    return;
  }
  if (error?.statusCode === 403) {
    forbidden(res, message);
    return;
  }
  if (error?.statusCode === 404) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ data: null, error: { message } }));
    return;
  }
  if (error?.statusCode === 429) {
    tooManyRequests(res, message);
    return;
  }
  badRequest(res, message);
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  try {
    if (req.method !== "POST") {
      methodNotAllowed(res, ["POST"]);
      return;
    }

    const user = await getAuthenticatedUser(req, supabase);
    if (!user) {
      unauthorized(res, "Please sign in first.");
      return;
    }

    const body = await parseJsonBody(req);
    try {
      const upload = await createCommunityImageUpload(supabase, user, body);
      created(res, { upload });
    } catch (error) {
      sendError(res, error, "Image upload URL creation failed.");
    }
  } catch (error) {
    serverError(res, error);
  }
};
