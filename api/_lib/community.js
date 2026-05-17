const crypto = require("crypto");
const { getClientIp } = require("./rate-limit");

const COMMUNITY_CATEGORIES = new Set(["buddy", "second_hand", "sublet", "help", "official"]);
const USER_POST_CATEGORIES = new Set(["buddy", "second_hand", "sublet", "help"]);
const IMAGE_ALLOWED_CATEGORIES = new Set(["second_hand", "sublet"]);
const COMMUNITY_IMAGE_BUCKET = "community-images";
const COMMUNITY_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const COMMUNITY_IMAGE_MAX_COUNT = 3;
const COMMUNITY_IMAGE_SIGNED_URL_SECONDS = 10 * 60;
const IMAGE_TYPES = {
  jpg: {
    mime: "image/jpeg",
    extensions: new Set(["jpg", "jpeg"])
  },
  png: {
    mime: "image/png",
    extensions: new Set(["png"])
  },
  webp: {
    mime: "image/webp",
    extensions: new Set(["webp"])
  }
};
const CATEGORY_EXPIRY_DAYS = {
  buddy: 7,
  second_hand: 14,
  sublet: 30,
  help: 30,
  official: null
};
const CATEGORY_CONTENT_MAX = {
  buddy: 200,
  second_hand: 200,
  sublet: 200,
  help: 300,
  official: 300
};
const SENSITIVE_TERMS = [
  "代写",
  "考试答案",
  "刷单",
  "赌博",
  "博彩",
  "贷款",
  "投资",
  "裸聊",
  "成人服务",
  "处方药",
  "电子烟",
  "香烟",
  "酒",
  "刀",
  "押金先付",
  "私下转账",
  "定金不退",
  "加微信",
  "加我微信",
  "v信",
  "whatsapp",
  "telegram"
];
const ASCII_SENSITIVE_TERMS = ["vx", "http", "https", "www."];
const COMMUNITY_USER_RISK_COLUMNS = [
  "id",
  "email",
  "created_at",
  "posting_permission_status",
  "trust_score",
  "banned_until",
  "ban_reason"
];
const PUBLIC_POST_COLUMNS = [
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
const PUBLIC_COMMENT_COLUMNS = [
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
const PUBLIC_IMAGE_COLUMNS = [
  "id",
  "post_id",
  "storage_path",
  "file_type",
  "file_size",
  "sort_order",
  "status",
  "created_at"
].join(", ");

function createUserFacingError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeText(value, options = {}) {
  const maxLength = Number(options.maxLength || 500);
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function normalizeMultilineText(value, options = {}) {
  const maxLength = Number(options.maxLength || 3000);
  const text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function normalizeCategory(value) {
  const category = String(value || "").trim();
  return COMMUNITY_CATEGORIES.has(category) ? category : "";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function hasHtmlTags(text) {
  return /<[^>]+>/.test(String(text || ""));
}

function hasUrl(text) {
  return /\b(?:https?:\/\/|www\.)\S+/i.test(String(text || ""));
}

function hasScriptOrIframe(text) {
  return /\b(?:script|iframe)\b/i.test(String(text || ""));
}

function hasContactInfo(text) {
  const value = String(text || "");
  return Boolean(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value)
    || /(?:\+?\d[\s().-]*){8,}/.test(value)
    || /\b(?:wechat|weixin|whatsapp|telegram|instagram|xiaohongshu|rednote|小红书|小红书号|vx|v信)\b/i.test(value)
    || /微信|手机号|手机|电话|邮箱|电邮|加我|私信/.test(value)
  );
}

function findSensitiveTerms(text) {
  const value = String(text || "");
  const lower = value.toLowerCase();
  return [
    ...SENSITIVE_TERMS.filter(term => value.includes(term)),
    ...ASCII_SENSITIVE_TERMS.filter(term => lower.includes(term))
  ];
}

function assertPublicTextSafe(title, content, category) {
  if (title.length < 8) {
    throw new Error("标题至少需要 8 个字符");
  }
  if (title.length > 120) {
    throw new Error("标题不能超过 120 个字符");
  }
  if (content.length < 20) {
    throw new Error("内容至少需要 20 个字符");
  }
  const maxContentLength = CATEGORY_CONTENT_MAX[category] || 200;
  if (content.length > maxContentLength) {
    throw new Error(`该分类内容不能超过 ${maxContentLength} 个字符`);
  }
  const combined = `${title}\n${content}`;
  if (hasHtmlTags(combined) || hasScriptOrIframe(combined)) {
    throw new Error("内容不能包含 HTML、script 或 iframe");
  }
  if (hasUrl(combined)) {
    throw new Error("内容不能包含外部链接");
  }
  if (hasContactInfo(combined)) {
    throw new Error("联系方式只能填写在联系方式字段中，不能公开写在标题或正文里");
  }
  const sensitiveHits = findSensitiveTerms(combined);
  if (sensitiveHits.length) {
    throw new Error(`内容包含不允许发布的词语：${Array.from(new Set(sensitiveHits)).join("、")}`);
  }
}

function normalizeOptionalContact(value, options = {}) {
  const maxLength = Number(options.maxLength || 120);
  const text = normalizeText(value, { maxLength });
  return text || null;
}

function normalizePrice(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > 100000) {
    throw new Error("价格格式不正确");
  }
  return Math.round(price * 100) / 100;
}

function resolveExpiresAt(category, value) {
  if (value && category === "official") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("过期时间格式不正确");
    }
    return parsed.toISOString();
  }
  const days = CATEGORY_EXPIRY_DAYS[category];
  if (!days) {
    return new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function serializePublicPost(row, fields = []) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    status: row.status,
    city: row.city || null,
    university: row.university || null,
    area: row.area || null,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    is_pinned: Boolean(row.is_pinned),
    view_count: Number(row.view_count || 0),
    comment_count: Number(row.comment_count || 0),
    report_count: Number(row.report_count || 0),
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    published_at: row.published_at,
    fields: fields.map(item => ({
      key: item.field_key,
      value: item.field_value || ""
    })),
    images: Array.isArray(row.images) ? row.images : []
  };
}

function serializePublicImage(row, signedUrl = null) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    post_id: row.post_id,
    url: signedUrl,
    file_type: row.file_type,
    file_size: Number(row.file_size || 0),
    sort_order: Number(row.sort_order || 0),
    created_at: row.created_at
  };
}

function extractMissingColumnName(error, tableName) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  const tableMatch = tableName
    ? message.match(new RegExp(`${tableName}\\.([a-z0-9_]+)\\s+does not exist`, "i"))
    : null;
  const genericMatch = message.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i)
    || message.match(/'([a-z0-9_]+)' column of '[a-z0-9_]+'/i);
  return tableMatch?.[1] || genericMatch?.[1] || "";
}

async function getCommunityUserRisk(supabase, userId) {
  if (!userId) {
    return null;
  }
  const columns = [...COMMUNITY_USER_RISK_COLUMNS];
  while (columns.length) {
    const { data, error } = await supabase
      .from("site_users")
      .select(columns.join(", "))
      .eq("id", userId)
      .maybeSingle();
    if (!error) {
      return {
        id: data?.id || userId,
        email: data?.email || null,
        created_at: data?.created_at || null,
        posting_permission_status: data?.posting_permission_status || "normal",
        trust_score: Number(data?.trust_score || 0),
        banned_until: data?.banned_until || null,
        ban_reason: data?.ban_reason || null
      };
    }
    const missingColumn = extractMissingColumnName(error, "site_users");
    const missingIndex = columns.indexOf(missingColumn);
    if (!missingColumn || missingIndex === -1) {
      throw error;
    }
    columns.splice(missingIndex, 1);
  }
  return { id: userId, posting_permission_status: "normal", trust_score: 0 };
}

function assertCanPost(userRisk) {
  if (!userRisk) {
    throw new Error("请先登录后发布信息");
  }
  if (userRisk.posting_permission_status === "banned") {
    throw new Error(userRisk.ban_reason || "当前账号暂不能发布信息");
  }
  if (userRisk.banned_until && new Date(userRisk.banned_until).getTime() > Date.now()) {
    throw new Error(userRisk.ban_reason || "当前账号暂不能发布信息");
  }
  if (userRisk.created_at) {
    const accountAgeMs = Date.now() - new Date(userRisk.created_at).getTime();
    if (accountAgeMs < 10 * 60 * 1000) {
      throw new Error("新账号注册 10 分钟后才可以发布信息");
    }
  }
}

function assertCanInteract(userRisk) {
  if (!userRisk) {
    throw createUserFacingError("Please sign in first.", 401);
  }
  if (userRisk.posting_permission_status === "banned") {
    throw createUserFacingError(userRisk.ban_reason || "This account is temporarily restricted.");
  }
  if (userRisk.banned_until && new Date(userRisk.banned_until).getTime() > Date.now()) {
    throw createUserFacingError(userRisk.ban_reason || "This account is temporarily restricted.");
  }
}

function assertCanReport(userRisk) {
  assertCanInteract(userRisk);
  if (userRisk.created_at) {
    const accountAgeMs = Date.now() - new Date(userRisk.created_at).getTime();
    if (accountAgeMs < 10 * 60 * 1000) {
      throw createUserFacingError("New accounts can report after 10 minutes.");
    }
  }
}

async function countRateLimitRows(supabase, filters) {
  let query = supabase
    .from("community_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("action", filters.action)
    .gte("created_at", filters.sinceIso);
  if (filters.userId) {
    query = query.eq("user_id", filters.userId);
  }
  if (filters.ipAddress) {
    query = query.eq("ip_address", filters.ipAddress);
  }
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count || 0;
}

async function assertCreatePostRateLimits(supabase, req, userId) {
  const ipAddress = getClientIp(req);
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const [userDaily, ipHourly, ipDaily] = await Promise.all([
    countRateLimitRows(supabase, { action: "create_post", userId, sinceIso: dayAgo }),
    countRateLimitRows(supabase, { action: "create_post", ipAddress, sinceIso: hourAgo }),
    countRateLimitRows(supabase, { action: "create_post", ipAddress, sinceIso: dayAgo })
  ]);
  if (userDaily >= 2) {
    throw new Error("每个用户每天最多发布 2 条信息");
  }
  if (ipHourly >= 1) {
    throw new Error("当前网络环境发布过于频繁，请稍后再试");
  }
  if (ipDaily >= 3) {
    throw new Error("当前网络环境今天发布次数已达上限");
  }
  return ipAddress;
}

async function recordRateLimitAction(supabase, { userId = null, ipAddress = null, action }) {
  const { error } = await supabase
    .from("community_rate_limits")
    .insert({
      user_id: userId,
      ip_address: ipAddress,
      action
    });
  if (error) {
    throw error;
  }
}

async function assertReportIpRateLimit(supabase, req) {
  const ipAddress = getClientIp(req);
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [postReports, commentReports] = await Promise.all([
    countRateLimitRows(supabase, { action: "report_post", ipAddress, sinceIso: tenMinutesAgo }),
    countRateLimitRows(supabase, { action: "report_comment", ipAddress, sinceIso: tenMinutesAgo })
  ]);
  if (postReports + commentReports >= 5) {
    throw createUserFacingError("Too many reports from this network. Please try again later.", 429);
  }
  return ipAddress;
}

async function assertNoDuplicateTitle(supabase, userId, title) {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("community_posts")
    .select("id")
    .eq("user_id", userId)
    .eq("title", title)
    .gte("created_at", sinceIso)
    .neq("status", "deleted")
    .limit(1);
  if (error) {
    throw error;
  }
  if (data?.length) {
    throw new Error("同一用户 24 小时内不能发布重复标题");
  }
}

function normalizeFields(fields) {
  if (!isPlainObject(fields)) {
    return [];
  }
  return Object.entries(fields)
    .map(([key, value]) => ({
      field_key: normalizeText(key, { maxLength: 64 }),
      field_value: normalizeText(value, { maxLength: 500 })
    }))
    .filter(item => item.field_key && item.field_value)
    .slice(0, 12);
}

function buildCreatePostPayload(body, userId) {
  const category = normalizeCategory(body.category);
  if (!category) {
    throw new Error("请选择有效分类");
  }
  if (!USER_POST_CATEGORIES.has(category)) {
    throw new Error("官方公告只能由管理员发布");
  }
  const title = normalizeText(body.title, { maxLength: 1000 });
  const content = normalizeMultilineText(body.content, { maxLength: 2000 });
  assertPublicTextSafe(title, content, category);
  const expiresAt = resolveExpiresAt(category, body.expires_at);
  return {
    post: {
      user_id: userId,
      category,
      title,
      content,
      status: "published",
      city: normalizeOptionalContact(body.city, { maxLength: 80 }),
      university: normalizeOptionalContact(body.university, { maxLength: 120 }),
      area: normalizeOptionalContact(body.area, { maxLength: 120 }),
      price: normalizePrice(body.price),
      contact_wechat: normalizeOptionalContact(body.contact_wechat, { maxLength: 120 }),
      contact_phone: normalizeOptionalContact(body.contact_phone, { maxLength: 80 }),
      contact_email: normalizeOptionalContact(body.contact_email, { maxLength: 160 }),
      is_pinned: false,
      view_count: 0,
      comment_count: 0,
      report_count: 0,
      expires_at: expiresAt,
      published_at: new Date().toISOString()
    },
    fields: normalizeFields(body.fields)
  };
}

async function createCommunityPost(supabase, req, user, body) {
  const userRisk = await getCommunityUserRisk(supabase, user?.id);
  assertCanPost(userRisk);
  const payload = buildCreatePostPayload(body, user.id);
  await assertNoDuplicateTitle(supabase, user.id, payload.post.title);
  const ipAddress = await assertCreatePostRateLimits(supabase, req, user.id);
  const { data: post, error } = await supabase
    .from("community_posts")
    .insert(payload.post)
    .select(PUBLIC_POST_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  let fields = [];
  if (payload.fields.length) {
    const rows = payload.fields.map(item => ({ ...item, post_id: post.id }));
    const { data, error: fieldsError } = await supabase
      .from("community_post_fields")
      .insert(rows)
      .select("field_key, field_value, created_at");
    if (fieldsError) {
      throw fieldsError;
    }
    fields = data || [];
  }
  await recordRateLimitAction(supabase, {
    userId: user.id,
    ipAddress,
    action: "create_post"
  });
  return serializePublicPost(post, fields);
}

async function listCommunityPosts(supabase, queryParams = {}) {
  const page = Math.max(1, Number.parseInt(queryParams.page, 10) || 1);
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(queryParams.limit, 10) || 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const category = normalizeCategory(queryParams.category);
  const q = normalizeText(queryParams.q || queryParams.search, { maxLength: 80 });
  let query = supabase
    .from("community_posts")
    .select(PUBLIC_POST_COLUMNS, { count: "exact" })
    .eq("status", "published")
    .gt("expires_at", new Date().toISOString());
  if (category) {
    query = query.eq("category", category);
  }
  if (q) {
    query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%,city.ilike.%${q}%,university.ilike.%${q}%,area.ilike.%${q}%`);
  }
  query = query
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false })
    .range(from, to);
  const { data, error, count } = await query;
  if (error) {
    throw error;
  }
  return {
    items: (data || []).map(item => serializePublicPost(item)),
    page,
    page_size: pageSize,
    total: count || 0,
    has_next: count ? to + 1 < count : false
  };
}

async function recordPostView(supabase, req, postId) {
  const ipAddress = getClientIp(req);
  const sinceIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  try {
    const existing = await countRateLimitRows(supabase, {
      action: `view_post:${postId}`,
      ipAddress,
      sinceIso
    });
    if (existing > 0) {
      return;
    }
    await recordRateLimitAction(supabase, {
      ipAddress,
      action: `view_post:${postId}`
    });
    const { data: current, error: currentError } = await supabase
      .from("community_posts")
      .select("view_count")
      .eq("id", postId)
      .maybeSingle();
    if (currentError) {
      throw currentError;
    }
    await supabase
      .from("community_posts")
      .update({ view_count: Number(current?.view_count || 0) + 1 })
      .eq("id", postId);
  } catch (error) {
    console.warn("[community] view count skipped", error.message);
  }
}

async function getCommunityPostDetail(supabase, req, postId) {
  if (!isUuid(postId)) {
    return null;
  }
  const { data: post, error } = await supabase
    .from("community_posts")
    .select(PUBLIC_POST_COLUMNS)
    .eq("id", postId)
    .eq("status", "published")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!post) {
    return null;
  }
  const { data: fields, error: fieldsError } = await supabase
    .from("community_post_fields")
    .select("field_key, field_value, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (fieldsError) {
    throw fieldsError;
  }
  const images = await getPublicImagesForPost(supabase, postId);
  await recordPostView(supabase, req, postId);
  return serializePublicPost({
    ...post,
    view_count: Number(post.view_count || 0) + 1,
    images
  }, fields || []);
}

async function getVisibleCommunityPost(supabase, postId) {
  if (!isUuid(postId)) {
    return null;
  }
  const { data, error } = await supabase
    .from("community_posts")
    .select(PUBLIC_POST_COLUMNS)
    .eq("id", postId)
    .eq("status", "published")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
}

function normalizeCommentContent(value) {
  const content = normalizeMultilineText(value, { maxLength: 1000 });
  if (!content) {
    throw createUserFacingError("Comment content is required.");
  }
  if (content.length > 300) {
    throw createUserFacingError("Comments cannot exceed 300 characters.");
  }
  if (hasHtmlTags(content) || hasScriptOrIframe(content)) {
    throw createUserFacingError("Comments cannot contain HTML, script, or iframe content.");
  }
  if (hasUrl(content)) {
    throw createUserFacingError("Comments cannot contain external links.");
  }
  if (hasContactInfo(content)) {
    throw createUserFacingError("Comments cannot contain contact information.");
  }
  const sensitiveHits = findSensitiveTerms(content);
  if (sensitiveHits.length) {
    throw createUserFacingError("Comments contain words that are not allowed.");
  }
  return content;
}

function serializePublicComment(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    post_id: row.post_id,
    content: row.content,
    status: row.status,
    report_count: Number(row.report_count || 0),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function countUserComments(supabase, userId, sinceIso, postId = null) {
  let query = supabase
    .from("community_comments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "deleted")
    .gte("created_at", sinceIso);
  if (postId) {
    query = query.eq("post_id", postId);
  }
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count || 0;
}

async function assertCreateCommentRateLimits(supabase, userId, postId) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [dailyCount, postDailyCount] = await Promise.all([
    countUserComments(supabase, userId, dayAgo),
    countUserComments(supabase, userId, dayAgo, postId)
  ]);
  if (postDailyCount >= 3) {
    throw createUserFacingError("You can comment on the same post up to 3 times per day.", 429);
  }
  if (dailyCount >= 10) {
    throw createUserFacingError("You can post up to 10 comments per day.", 429);
  }
}

async function createCommunityComment(supabase, req, user, body) {
  const userRisk = await getCommunityUserRisk(supabase, user?.id);
  assertCanInteract(userRisk);
  const postId = String(body?.post_id || body?.postId || "").trim();
  const post = await getVisibleCommunityPost(supabase, postId);
  if (!post) {
    throw createUserFacingError("Post is not available for comments.", 404);
  }
  const content = normalizeCommentContent(body?.content);
  await assertCreateCommentRateLimits(supabase, user.id, post.id);
  const ipAddress = getClientIp(req);
  const { data: comment, error } = await supabase
    .from("community_comments")
    .insert({
      post_id: post.id,
      user_id: user.id,
      content,
      status: "published",
      report_count: 0
    })
    .select(PUBLIC_COMMENT_COLUMNS)
    .single();
  if (error) {
    throw error;
  }
  const { error: updateError } = await supabase
    .from("community_posts")
    .update({ comment_count: Number(post.comment_count || 0) + 1 })
    .eq("id", post.id);
  if (updateError) {
    throw updateError;
  }
  await recordRateLimitAction(supabase, { userId: user.id, ipAddress, action: "create_comment" });
  return serializePublicComment(comment);
}

function normalizeReportReason(value) {
  const reason = normalizeText(value, { maxLength: 80 });
  if (!reason) {
    throw createUserFacingError("Report reason is required.");
  }
  return reason;
}

function normalizeReportDetails(value) {
  return normalizeMultilineText(value, { maxLength: 500 }) || null;
}

function normalizeImageExtension(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\./, "");
  const extension = raw === "jpeg" ? "jpg" : raw;
  return Object.prototype.hasOwnProperty.call(IMAGE_TYPES, extension) ? extension : "";
}

function normalizeImageMime(value) {
  const mime = String(value || "").trim().toLowerCase();
  return Object.values(IMAGE_TYPES).some(item => item.mime === mime) ? mime : "";
}

function resolveImageType(input = {}) {
  const originalName = String(input.file_name || input.fileName || "").trim();
  const extensionFromName = originalName.includes(".")
    ? normalizeImageExtension(originalName.split(".").pop())
    : "";
  const extension = normalizeImageExtension(input.extension) || extensionFromName;
  const mime = normalizeImageMime(input.file_type || input.fileType || input.mime_type || input.mimeType);
  if (!extension || !mime) {
    throw createUserFacingError("Only jpg, jpeg, png, and webp images are allowed.");
  }
  const type = IMAGE_TYPES[extension];
  if (!type || type.mime !== mime) {
    throw createUserFacingError("Image extension and MIME type do not match.");
  }
  return { extension, mime };
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return "";
  }
  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

async function countActiveImages(supabase, postId) {
  const { count, error } = await supabase
    .from("community_post_images")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("status", "active");
  if (error) {
    throw error;
  }
  return count || 0;
}

async function getOwnedImageUploadPost(supabase, userId, postId) {
  const post = await getVisibleCommunityPost(supabase, postId);
  if (!post) {
    throw createUserFacingError("Post is not available for image upload.", 404);
  }
  if (post.user_id !== userId) {
    throw createUserFacingError("You can only upload images to your own post.", 403);
  }
  if (!IMAGE_ALLOWED_CATEGORIES.has(post.category)) {
    throw createUserFacingError("Images are only allowed for second-hand and sublet posts.");
  }
  return post;
}

function buildImageStoragePath(userId, postId, extension) {
  const token = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
  return `community/${userId}/${postId}/${token}.${extension}`;
}

async function createCommunityImageUpload(supabase, user, body) {
  const userRisk = await getCommunityUserRisk(supabase, user?.id);
  assertCanInteract(userRisk);
  const postId = String(body?.post_id || body?.postId || "").trim();
  const post = await getOwnedImageUploadPost(supabase, user.id, postId);
  const currentImageCount = await countActiveImages(supabase, post.id);
  if (currentImageCount >= COMMUNITY_IMAGE_MAX_COUNT) {
    throw createUserFacingError("Each post can have up to 3 active images.", 429);
  }
  const { extension, mime } = resolveImageType(body || {});
  const storagePath = buildImageStoragePath(user.id, post.id, extension);
  const { data, error } = await supabase
    .storage
    .from(COMMUNITY_IMAGE_BUCKET)
    .createSignedUploadUrl(storagePath);
  if (error) {
    throw error;
  }
  return {
    post_id: post.id,
    storage_path: storagePath,
    file_type: mime,
    max_file_size: COMMUNITY_IMAGE_MAX_BYTES,
    expires_in: 2 * 60 * 60,
    signed_upload_url: data?.signedUrl || data?.signed_url || null,
    token: data?.token || null
  };
}

async function getStorageObjectMetadata(supabase, storagePath) {
  const slashIndex = storagePath.lastIndexOf("/");
  const folder = slashIndex > 0 ? storagePath.slice(0, slashIndex) : "";
  const fileName = slashIndex > 0 ? storagePath.slice(slashIndex + 1) : storagePath;
  const { data, error } = await supabase
    .storage
    .from(COMMUNITY_IMAGE_BUCKET)
    .list(folder, { limit: 100 });
  if (error) {
    throw error;
  }
  const item = (data || []).find(row => row.name === fileName);
  if (!item) {
    throw createUserFacingError("Uploaded image object was not found.", 404);
  }
  return item.metadata || {};
}

async function downloadStorageObject(supabase, storagePath) {
  const { data, error } = await supabase
    .storage
    .from(COMMUNITY_IMAGE_BUCKET)
    .download(storagePath);
  if (error) {
    throw error;
  }
  const arrayBuffer = await data.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mime: String(data.type || "").toLowerCase()
  };
}

async function removeStorageObjectQuietly(supabase, storagePath) {
  try {
    await supabase.storage.from(COMMUNITY_IMAGE_BUCKET).remove([storagePath]);
  } catch (error) {
    console.warn("[community] image cleanup skipped", error.message);
  }
}

function assertFinalizedImageValid({ storagePath, requestedMime, metadataMime, metadataSize, downloadedMime, detectedMime, fileSize }) {
  const extension = normalizeImageExtension(storagePath.split(".").pop());
  if (!extension) {
    throw createUserFacingError("Only jpg, jpeg, png, and webp images are allowed.");
  }
  const expected = IMAGE_TYPES[extension];
  if (!expected) {
    throw createUserFacingError("Only jpg, jpeg, png, and webp images are allowed.");
  }
  if (fileSize <= 0 || fileSize > COMMUNITY_IMAGE_MAX_BYTES) {
    throw createUserFacingError("Each image must be 2MB or smaller.");
  }
  if (metadataSize && metadataSize !== fileSize) {
    throw createUserFacingError("Uploaded object metadata size does not match the downloaded file size.");
  }
  if (metadataSize && metadataSize > COMMUNITY_IMAGE_MAX_BYTES) {
    throw createUserFacingError("Each image must be 2MB or smaller.");
  }
  if (requestedMime && requestedMime !== expected.mime) {
    throw createUserFacingError("Image MIME type does not match the storage path.");
  }
  if (metadataMime && metadataMime !== expected.mime) {
    throw createUserFacingError("Uploaded object metadata MIME type is not allowed.");
  }
  if (downloadedMime && downloadedMime !== expected.mime) {
    throw createUserFacingError("Uploaded object MIME type is not allowed.");
  }
  if (detectedMime !== expected.mime) {
    throw createUserFacingError("Uploaded file header does not match an allowed image type.");
  }
}

async function finalizeCommunityImage(supabase, user, body) {
  const userRisk = await getCommunityUserRisk(supabase, user?.id);
  assertCanInteract(userRisk);
  const postId = String(body?.post_id || body?.postId || "").trim();
  const storagePath = String(body?.storage_path || body?.storagePath || "").trim();
  const requestedMime = normalizeImageMime(body?.file_type || body?.fileType || body?.mime_type || body?.mimeType);
  const post = await getOwnedImageUploadPost(supabase, user.id, postId);
  if (!storagePath.startsWith(`community/${user.id}/${post.id}/`)) {
    throw createUserFacingError("Invalid image upload path.");
  }
  const existingImageCount = await countActiveImages(supabase, post.id);
  if (existingImageCount >= COMMUNITY_IMAGE_MAX_COUNT) {
    await removeStorageObjectQuietly(supabase, storagePath);
    throw createUserFacingError("Each post can have up to 3 active images.", 429);
  }
  const { data: existingImage, error: existingImageError } = await supabase
    .from("community_post_images")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (existingImageError) {
    throw existingImageError;
  }
  if (existingImage) {
    throw createUserFacingError("This image has already been finalized.");
  }

  try {
    const metadata = await getStorageObjectMetadata(supabase, storagePath);
    const { buffer, mime: downloadedMime } = await downloadStorageObject(supabase, storagePath);
    const metadataMime = normalizeImageMime(metadata?.mimetype || metadata?.contentType);
    const metadataSize = Number(metadata?.size || metadata?.contentLength || 0);
    const detectedMime = detectImageMime(buffer);
    assertFinalizedImageValid({
      storagePath,
      requestedMime,
      metadataMime,
      metadataSize,
      downloadedMime,
      detectedMime,
      fileSize: buffer.length
    });
    const { data: image, error } = await supabase
      .from("community_post_images")
      .insert({
        post_id: post.id,
        user_id: user.id,
        storage_path: storagePath,
        public_url: null,
        file_name: null,
        file_type: detectedMime,
        file_size: buffer.length,
        sort_order: existingImageCount,
        status: "active"
      })
      .select(PUBLIC_IMAGE_COLUMNS)
      .single();
    if (error) {
      throw error;
    }
    return serializePublicImage(image);
  } catch (error) {
    await removeStorageObjectQuietly(supabase, storagePath);
    throw error;
  }
}

async function getPublicImagesForPost(supabase, postId) {
  const { data, error } = await supabase
    .from("community_post_images")
    .select(PUBLIC_IMAGE_COLUMNS)
    .eq("post_id", postId)
    .eq("status", "active")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  if (!data?.length) {
    return [];
  }
  const { data: signedRows, error: signedError } = await supabase
    .storage
    .from(COMMUNITY_IMAGE_BUCKET)
    .createSignedUrls(data.map(item => item.storage_path), COMMUNITY_IMAGE_SIGNED_URL_SECONDS);
  if (signedError) {
    throw signedError;
  }
  const signedByPath = new Map((signedRows || []).map(item => [
    item.path || item.storage_path,
    item.signedUrl || item.signed_url || null
  ]));
  return data.map(item => serializePublicImage(item, signedByPath.get(item.storage_path) || null));
}

async function countRowsByColumn(supabase, table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    throw error;
  }
  return count || 0;
}

async function reportCommunityPost(supabase, req, user, body) {
  const userRisk = await getCommunityUserRisk(supabase, user?.id);
  assertCanReport(userRisk);
  const postId = String(body?.post_id || body?.postId || "").trim();
  const post = await getVisibleCommunityPost(supabase, postId);
  if (!post) {
    throw createUserFacingError("Post is not available for reports.", 404);
  }
  const { data: existing, error: existingError } = await supabase
    .from("community_post_reports")
    .select("id")
    .eq("post_id", post.id)
    .eq("reporter_user_id", user.id)
    .maybeSingle();
  if (existingError) {
    throw existingError;
  }
  if (existing) {
    throw createUserFacingError("You have already reported this post.");
  }
  const reason = normalizeReportReason(body?.reason);
  const details = normalizeReportDetails(body?.details);
  const ipAddress = await assertReportIpRateLimit(supabase, req);
  const { data: report, error } = await supabase
    .from("community_post_reports")
    .insert({
      post_id: post.id,
      reporter_user_id: user.id,
      reason,
      details
    })
    .select("id, post_id, reason, details, created_at")
    .single();
  if (error) {
    if (String(error.code || "") === "23505") {
      throw createUserFacingError("You have already reported this post.");
    }
    throw error;
  }
  const reportCount = await countRowsByColumn(supabase, "community_post_reports", "post_id", post.id);
  const postUpdate = { report_count: reportCount };
  if (reportCount >= 2) {
    postUpdate.status = "hidden";
    postUpdate.auto_hidden_reason = "reported_threshold";
  }
  const { error: updateError } = await supabase
    .from("community_posts")
    .update(postUpdate)
    .eq("id", post.id);
  if (updateError) {
    throw updateError;
  }
  await recordRateLimitAction(supabase, { userId: user.id, ipAddress, action: "report_post" });
  return {
    report: {
      id: report.id,
      post_id: report.post_id,
      reason: report.reason,
      details: report.details,
      created_at: report.created_at
    },
    report_count: reportCount,
    auto_hidden: reportCount >= 2
  };
}

async function reportCommunityComment(supabase, req, user, body) {
  const userRisk = await getCommunityUserRisk(supabase, user?.id);
  assertCanReport(userRisk);
  const commentId = String(body?.comment_id || body?.commentId || "").trim();
  if (!isUuid(commentId)) {
    throw createUserFacingError("Comment is not available for reports.", 404);
  }
  const { data: comment, error: commentError } = await supabase
    .from("community_comments")
    .select(`${PUBLIC_COMMENT_COLUMNS}, community_posts!inner(id, status, expires_at)`)
    .eq("id", commentId)
    .eq("status", "published")
    .eq("community_posts.status", "published")
    .gt("community_posts.expires_at", new Date().toISOString())
    .maybeSingle();
  if (commentError) {
    throw commentError;
  }
  if (!comment) {
    throw createUserFacingError("Comment is not available for reports.", 404);
  }
  const { data: existing, error: existingError } = await supabase
    .from("community_comment_reports")
    .select("id")
    .eq("comment_id", comment.id)
    .eq("reporter_user_id", user.id)
    .maybeSingle();
  if (existingError) {
    throw existingError;
  }
  if (existing) {
    throw createUserFacingError("You have already reported this comment.");
  }
  const reason = normalizeReportReason(body?.reason);
  const details = normalizeReportDetails(body?.details);
  const ipAddress = await assertReportIpRateLimit(supabase, req);
  const { data: report, error } = await supabase
    .from("community_comment_reports")
    .insert({
      comment_id: comment.id,
      reporter_user_id: user.id,
      reason,
      details
    })
    .select("id, comment_id, reason, details, created_at")
    .single();
  if (error) {
    if (String(error.code || "") === "23505") {
      throw createUserFacingError("You have already reported this comment.");
    }
    throw error;
  }
  const reportCount = await countRowsByColumn(supabase, "community_comment_reports", "comment_id", comment.id);
  const commentUpdate = { report_count: reportCount };
  if (reportCount >= 2) {
    commentUpdate.status = "hidden";
    commentUpdate.auto_hidden_reason = "reported_threshold";
  }
  const { error: updateError } = await supabase
    .from("community_comments")
    .update(commentUpdate)
    .eq("id", comment.id);
  if (updateError) {
    throw updateError;
  }
  await recordRateLimitAction(supabase, { userId: user.id, ipAddress, action: "report_comment" });
  return {
    report: {
      id: report.id,
      comment_id: report.comment_id,
      reason: report.reason,
      details: report.details,
      created_at: report.created_at
    },
    report_count: reportCount,
    auto_hidden: reportCount >= 2
  };
}

module.exports = {
  COMMUNITY_CATEGORIES,
  PUBLIC_COMMENT_COLUMNS,
  PUBLIC_IMAGE_COLUMNS,
  PUBLIC_POST_COLUMNS,
  createCommunityComment,
  createCommunityImageUpload,
  createCommunityPost,
  finalizeCommunityImage,
  getCommunityPostDetail,
  listCommunityPosts,
  reportCommunityComment,
  reportCommunityPost,
  serializePublicComment,
  serializePublicPost
};
