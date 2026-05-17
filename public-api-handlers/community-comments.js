const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { badRequest, created, methodNotAllowed, ok, parseJsonBody, serverError, tooManyRequests, unauthorized } = require("../api/_lib/http");
const { createCommunityComment } = require("../api/_lib/community");

const PUBLIC_COMMENT_COLUMNS = "id, content, created_at";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function sendError(res, error, fallbackMessage) {
  const message = error?.message || fallbackMessage;
  if (error?.statusCode === 401) {
    unauthorized(res, message);
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

async function listPublishedComments(supabase, postId) {
  if (!isUuid(postId)) {
    const error = new Error("Post is not available.");
    error.statusCode = 404;
    throw error;
  }

  const { data: post, error: postError } = await supabase
    .from("community_posts")
    .select("id, status, expires_at")
    .eq("id", postId)
    .maybeSingle();
  if (postError) {
    throw postError;
  }
  if (!post || post.status !== "published" || new Date(post.expires_at).getTime() <= Date.now()) {
    const error = new Error("Post is not available.");
    error.statusCode = 404;
    throw error;
  }

  const { data, error } = await supabase
    .from("community_comments")
    .select(PUBLIC_COMMENT_COLUMNS)
    .eq("post_id", post.id)
    .eq("status", "published")
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }

  return {
    items: (data || []).map(comment => ({
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
      author_label: "同学"
    }))
  };
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  try {
    if (req.method === "GET") {
      try {
        const postId = String(req.query?.post_id || req.query?.postId || "").trim();
        ok(res, await listPublishedComments(supabase, postId));
      } catch (error) {
        sendError(res, error, "Comments are not available.");
      }
      return;
    }

    if (req.method !== "POST") {
      methodNotAllowed(res, ["GET", "POST"]);
      return;
    }

    const user = await getAuthenticatedUser(req, supabase);
    if (!user) {
      unauthorized(res, "Please sign in first.");
      return;
    }

    const body = await parseJsonBody(req);
    try {
      const comment = await createCommunityComment(supabase, req, user, body);
      created(res, { comment });
    } catch (error) {
      sendError(res, error, "Comment failed. Please check the content and try again.");
    }
  } catch (error) {
    serverError(res, error);
  }
};
