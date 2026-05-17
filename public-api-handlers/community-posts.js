const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { badRequest, created, methodNotAllowed, notFound, ok, parseJsonBody, serverError, unauthorized } = require("../api/_lib/http");
const {
  createCommunityPost,
  getCommunityPostDetail,
  listCommunityPosts
} = require("../api/_lib/community");

function sendNotFound(res, message) {
  if (typeof notFound === "function") {
    notFound(res, message);
    return;
  }
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ data: null, error: { message } }));
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();

  try {
    if (req.method === "GET") {
      const id = String(req.query?.id || "").trim();
      if (id) {
        const post = await getCommunityPostDetail(supabase, req, id);
        if (!post) {
          sendNotFound(res, "帖子不存在或已不可查看");
          return;
        }
        ok(res, { post });
        return;
      }
      ok(res, await listCommunityPosts(supabase, req.query || {}));
      return;
    }

    if (req.method === "POST") {
      const user = await getAuthenticatedUser(req, supabase);
      if (!user) {
        unauthorized(res, "请先登录后发布信息");
        return;
      }
      const body = await parseJsonBody(req);
      try {
        const post = await createCommunityPost(supabase, req, user, body);
        created(res, { post });
      } catch (error) {
        badRequest(res, error.message || "发布失败，请检查内容后重试");
      }
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    serverError(res, error);
  }
};
