const COMMUNITY_IMAGE_BUCKET = "community-images";

const POST_LIST_COLUMNS = [
  "id",
  "user_id",
  "category",
  "title",
  "content",
  "status",
  "city",
  "university",
  "area",
  "price",
  "contact_wechat",
  "contact_phone",
  "contact_email",
  "is_pinned",
  "view_count",
  "comment_count",
  "report_count",
  "auto_hidden_reason",
  "expires_at",
  "created_at",
  "updated_at",
  "published_at"
].join(", ");

const COMMENT_COLUMNS = [
  "id",
  "post_id",
  "user_id",
  "content",
  "status",
  "report_count",
  "auto_hidden_reason",
  "created_at",
  "updated_at"
].join(", ");

const IMAGE_COLUMNS = [
  "id",
  "post_id",
  "user_id",
  "storage_path",
  "file_type",
  "file_size",
  "sort_order",
  "status",
  "created_at",
  "deleted_at"
].join(", ");

function parsePositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value, maxLength = 500) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  return ["published", "hidden", "expired", "deleted"].includes(status) ? status : "";
}

function normalizeCategory(value) {
  const category = String(value || "").trim();
  return ["buddy", "second_hand", "sublet", "help", "official"].includes(category) ? category : "";
}

function isExpired(row) {
  if (!row?.expires_at) {
    return false;
  }
  return new Date(row.expires_at).getTime() <= Date.now();
}

function serializePost(row) {
  return {
    ...row,
    display_status: row?.status === "published" && isExpired(row) ? "expired" : row?.status,
    price: row?.price === null || row?.price === undefined ? null : Number(row.price),
    is_pinned: Boolean(row?.is_pinned),
    view_count: Number(row?.view_count || 0),
    comment_count: Number(row?.comment_count || 0),
    report_count: Number(row?.report_count || 0)
  };
}

async function countRows(supabase, table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    throw error;
  }
  return count || 0;
}

async function fetchUsersByIds(supabase, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!ids.length) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("site_users")
    .select("id, email, nickname, public_user_id, posting_permission_status, trust_score, banned_until, ban_reason, created_at")
    .in("id", ids);
  if (error) {
    throw error;
  }
  return new Map((data || []).map(user => [String(user.id), user]));
}

async function buildUserRisk(supabase, userId) {
  if (!userId) {
    return null;
  }
  const userById = await fetchUsersByIds(supabase, [userId]);
  const user = userById.get(String(userId));
  if (!user) {
    return null;
  }
  const [postCount, commentCount, posts, comments] = await Promise.all([
    countRows(supabase, "community_posts", "user_id", userId),
    countRows(supabase, "community_comments", "user_id", userId),
    supabase.from("community_posts").select("id").eq("user_id", userId),
    supabase.from("community_comments").select("id").eq("user_id", userId)
  ]);
  if (posts.error) {
    throw posts.error;
  }
  if (comments.error) {
    throw comments.error;
  }
  const postIds = (posts.data || []).map(item => item.id);
  const commentIds = (comments.data || []).map(item => item.id);
  let postReportCount = 0;
  let commentReportCount = 0;
  if (postIds.length) {
    const { count, error } = await supabase
      .from("community_post_reports")
      .select("id", { count: "exact", head: true })
      .in("post_id", postIds);
    if (error) {
      throw error;
    }
    postReportCount = count || 0;
  }
  if (commentIds.length) {
    const { count, error } = await supabase
      .from("community_comment_reports")
      .select("id", { count: "exact", head: true })
      .in("comment_id", commentIds);
    if (error) {
      throw error;
    }
    commentReportCount = count || 0;
  }
  return {
    ...user,
    post_count: postCount,
    comment_count: commentCount,
    report_count: postReportCount + commentReportCount
  };
}

async function listCommunityPosts(supabase, filters = {}) {
  const page = parsePositiveInteger(filters.page, 1);
  const pageSize = Math.min(parsePositiveInteger(filters.page_size || filters.pageSize, 20), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const status = normalizeStatus(filters.status);
  const category = normalizeCategory(filters.category);
  const q = normalizeText(filters.q || filters.search, 120);

  let query = supabase
    .from("community_posts")
    .select(POST_LIST_COLUMNS, { count: "exact" });
  if (status && status !== "expired") {
    query = query.eq("status", status);
  }
  if (status === "expired") {
    query = query.eq("status", "published").lte("expires_at", new Date().toISOString());
  }
  if (category) {
    query = query.eq("category", category);
  }
  if (q) {
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%,city.ilike.%${q}%,university.ilike.%${q}%,area.ilike.%${q}%`);
  }
  const { data, error, count } = await query
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    throw error;
  }
  const userById = await fetchUsersByIds(supabase, (data || []).map(item => item.user_id));
  return {
    items: (data || []).map(item => ({
      ...serializePost(item),
      user: userById.get(String(item.user_id)) || null
    })),
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  };
}

async function getSignedImages(supabase, postId) {
  const { data, error } = await supabase
    .from("community_post_images")
    .select(IMAGE_COLUMNS)
    .eq("post_id", postId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  const activePaths = (data || []).filter(item => item.status === "active" && item.storage_path).map(item => item.storage_path);
  let signedByPath = new Map();
  if (activePaths.length) {
    const { data: signedRows, error: signedError } = await supabase
      .storage
      .from(COMMUNITY_IMAGE_BUCKET)
      .createSignedUrls(activePaths, 10 * 60);
    if (signedError) {
      throw signedError;
    }
    signedByPath = new Map((signedRows || []).map(item => [item.path || item.storage_path, item.signedUrl || item.signed_url || null]));
  }
  return (data || []).map(item => ({
    ...item,
    signed_url: signedByPath.get(item.storage_path) || null
  }));
}

async function getCommunityPostDetail(supabase, postId) {
  if (!isUuid(postId)) {
    return null;
  }
  const { data: post, error } = await supabase
    .from("community_posts")
    .select(POST_LIST_COLUMNS)
    .eq("id", postId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!post) {
    return null;
  }
  const [userRisk, images, comments, postReports] = await Promise.all([
    buildUserRisk(supabase, post.user_id),
    getSignedImages(supabase, post.id),
    listCommunityComments(supabase, { post_id: post.id, include_all: "1", page_size: 100 }),
    listPostReports(supabase, post.id)
  ]);
  return {
    post: serializePost(post),
    user_risk: userRisk,
    images,
    comments: comments.items,
    post_reports: postReports
  };
}

async function listCommunityComments(supabase, filters = {}) {
  const page = parsePositiveInteger(filters.page, 1);
  const pageSize = Math.min(parsePositiveInteger(filters.page_size || filters.pageSize, 50), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const postId = normalizeText(filters.post_id || filters.postId, 80);
  const reportedOnly = String(filters.reported || "") === "1";
  const includeAll = String(filters.include_all || filters.includeAll || "") === "1";

  let query = supabase
    .from("community_comments")
    .select(COMMENT_COLUMNS, { count: "exact" });
  if (postId) {
    query = query.eq("post_id", postId);
  }
  if (!includeAll) {
    query = query.in("status", ["published", "hidden"]);
  }
  if (reportedOnly) {
    query = query.gt("report_count", 0);
  }
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    throw error;
  }
  const userById = await fetchUsersByIds(supabase, (data || []).map(item => item.user_id));
  return {
    items: (data || []).map(item => ({
      ...item,
      user: userById.get(String(item.user_id)) || null
    })),
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: count ? Math.ceil(count / pageSize) : 0
    }
  };
}

async function listPostReports(supabase, postId) {
  const { data, error } = await supabase
    .from("community_post_reports")
    .select("id, reporter_user_id, reason, details, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  const userById = await fetchUsersByIds(supabase, (data || []).map(item => item.reporter_user_id));
  return (data || []).map(item => ({
    ...item,
    reporter: userById.get(String(item.reporter_user_id)) || null
  }));
}

async function listCommentReports(supabase, commentId) {
  const { data, error } = await supabase
    .from("community_comment_reports")
    .select("id, reporter_user_id, reason, details, created_at")
    .eq("comment_id", commentId)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  const userById = await fetchUsersByIds(supabase, (data || []).map(item => item.reporter_user_id));
  return (data || []).map(item => ({
    ...item,
    reporter: userById.get(String(item.reporter_user_id)) || null
  }));
}

async function updateCommunityPost(supabase, postId, body = {}) {
  if (!isUuid(postId)) {
    throw new Error("Invalid post id");
  }
  const action = normalizeText(body.action || body.post_action || "", 80);
  const patch = {};
  if (action === "hide") {
    patch.status = "hidden";
  } else if (action === "delete") {
    patch.status = "deleted";
  } else if (action === "restore") {
    patch.status = "published";
    patch.auto_hidden_reason = null;
  } else if (action === "pin") {
    patch.is_pinned = true;
  } else if (action === "unpin") {
    patch.is_pinned = false;
  } else if (action === "update_expires") {
    const expiresAt = new Date(body.expires_at || body.expiresAt || "");
    if (Number.isNaN(expiresAt.getTime())) {
      throw new Error("Invalid expires_at");
    }
    patch.expires_at = expiresAt.toISOString();
  } else {
    throw new Error("Unsupported post action");
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("community_posts")
    .update(patch)
    .eq("id", postId)
    .select(POST_LIST_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  return serializePost(data);
}

async function updateCommunityComment(supabase, commentId, body = {}) {
  if (!isUuid(commentId)) {
    throw new Error("Invalid comment id");
  }
  const action = normalizeText(body.action || body.comment_action || "", 80);
  const patch = {};
  if (action === "hide") {
    patch.status = "hidden";
  } else if (action === "delete") {
    patch.status = "deleted";
  } else if (action === "restore") {
    patch.status = "published";
    patch.auto_hidden_reason = null;
  } else {
    throw new Error("Unsupported comment action");
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("community_comments")
    .update(patch)
    .eq("id", commentId)
    .select(COMMENT_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

async function deleteCommunityImage(supabase, imageId) {
  if (!isUuid(imageId)) {
    throw new Error("Invalid image id");
  }
  const { data: image, error: imageError } = await supabase
    .from("community_post_images")
    .select(IMAGE_COLUMNS)
    .eq("id", imageId)
    .maybeSingle();
  if (imageError) {
    throw imageError;
  }
  if (!image) {
    throw new Error("Image not found");
  }
  if (image.storage_path) {
    await supabase.storage.from(COMMUNITY_IMAGE_BUCKET).remove([image.storage_path]).catch(error => {
      console.warn("[admin-community] storage image remove failed", error.message);
    });
  }
  const { data, error } = await supabase
    .from("community_post_images")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", imageId)
    .select(IMAGE_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  return data;
}

async function banCommunityUser(supabase, userId, body = {}) {
  if (!isUuid(userId)) {
    throw new Error("Invalid user id");
  }
  const bannedUntilRaw = body.banned_until || body.bannedUntil || "";
  const bannedUntil = bannedUntilRaw ? new Date(bannedUntilRaw) : null;
  if (bannedUntilRaw && Number.isNaN(bannedUntil.getTime())) {
    throw new Error("Invalid banned_until");
  }
  const patch = {
    posting_permission_status: body.posting_permission_status || body.status || (bannedUntil ? "banned" : "normal"),
    banned_until: bannedUntil ? bannedUntil.toISOString() : null,
    ban_reason: normalizeText(body.ban_reason || body.reason || "", 500) || null
  };
  const { data, error } = await supabase
    .from("site_users")
    .update(patch)
    .eq("id", userId)
    .select("id, email, nickname, public_user_id, posting_permission_status, trust_score, banned_until, ban_reason, created_at")
    .single();
  if (error) {
    throw error;
  }
  return data;
}

module.exports = {
  listCommunityPosts,
  getCommunityPostDetail,
  listCommunityComments,
  listCommentReports,
  updateCommunityPost,
  updateCommunityComment,
  deleteCommunityImage,
  banCommunityUser
};
