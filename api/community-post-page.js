const { getSupabaseAdmin } = require("./_lib/supabase");

const PUBLIC_POST_COLUMNS = [
  "id",
  "category",
  "title",
  "content",
  "status",
  "city",
  "area",
  "price",
  "expires_at",
  "published_at",
  "created_at"
].join(", ");

const CATEGORY_LABELS = {
  buddy: "找搭子",
  second_hand: "二手交易",
  sublet: "转租/短租",
  help: "求助/问答",
  official: "官方公告"
};

const SERVICE_LINKS = [
  { label: "接机", href: "/pickup" },
  { label: "寄存", href: "/storage" },
  { label: "订房咨询", href: "/service-center.html" },
  { label: "搬家", href: "/moving" },
  { label: "新生服务", href: "/service-center.html" }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value, maxLength = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function summarize(value) {
  const text = normalizeText(value, 1000);
  if (text.length <= 150) {
    return text;
  }
  return `${text.slice(0, 150).trim()}...`;
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function resolveBaseUrl(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "ngn.best").trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim() || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function serviceLinksHtml() {
  return SERVICE_LINKS
    .map(item => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
    .join("");
}

function sendHtml(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.end(html);
}

function renderNoindexPage({ baseUrl, id, title = "帖子不可查看" }) {
  const canonicalPath = id ? `/community-post/${encodeURIComponent(id)}` : "/community-post";
  const canonical = `${baseUrl}${canonicalPath}`;
  const safeTitle = escapeHtml(`${title}｜NGN 学生信息广场`);
  const description = "该内容不存在、已过期或暂不可查看。";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="robots" content="noindex, nofollow">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary">
  <link rel="stylesheet" href="/community.css?v=20260517-community-1">
</head>
<body class="community-page">
  <main class="community-shell">
    <h1>${escapeHtml(title)}</h1>
    <p>该内容不存在、已过期或暂不可查看。</p>
    <p><a href="/community.html">返回 NGN 学生信息广场</a></p>
  </main>
</body>
</html>`;
}

function renderPostPage({ baseUrl, post }) {
  const canonical = `${baseUrl}/community-post/${encodeURIComponent(post.id)}`;
  const title = `${post.title}｜NGN 学生信息广场`;
  const description = summarize(post.content);
  const category = CATEGORY_LABELS[post.category] || post.category;
  const price = post.price === null || post.price === undefined ? "" : `£${Number(post.price).toFixed(2)}`;
  const metaItems = [
    category,
    post.city,
    post.area,
    price,
    formatDate(post.published_at || post.created_at)
  ].filter(Boolean);
  const bodyContent = escapeHtml(post.content).replace(/\n/g, "<br>");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta name="twitter:card" content="summary">
  <link rel="stylesheet" href="/community.css?v=20260517-community-1">
</head>
<body class="community-page">
  <main class="community-shell community-layout">
    <section class="community-detail">
      <article class="community-panel community-detail-article" data-community-post-root>
        <p>NGN 学生信息广场</p>
        <h1>${escapeHtml(post.title)}</h1>
        <p>${metaItems.map(escapeHtml).join(" · ")}</p>
        <section>
          <h2>内容</h2>
          <p>${bodyContent}</p>
        </section>
        <section>
          <h2>免责声明</h2>
          <p>平台仅提供信息展示，不担保交易真实性、付款安全、商品质量、图片内容真实性、房源真实性、合同有效性或转租成功。用户需自行核实信息。请勿提前支付大额定金，不要公开个人隐私信息。</p>
        </section>
        <div id="community-post-app" data-post-id="${escapeHtml(post.id)}"></div>
      </article>
      <section class="community-panel">
        <h2>评论</h2>
        <p class="community-help">请保持评论友好、真实、合法。请勿发布联系方式、广告、攻击性内容、隐私信息或外部链接。</p>
        <form class="community-comment-box" data-comment-form>
          <textarea class="community-search" name="content" maxlength="300" placeholder="登录后可以评论，最多 300 字。"></textarea>
          <button class="community-button community-button-primary" type="submit">发表评论</button>
        </form>
        <p class="community-message" data-comment-message></p>
      </section>
    </section>
    <aside class="community-side">
      <section class="community-panel">
        <h2>联系提示</h2>
        <p>如需联系发布者，请通过页面指引联系 NGN 客服或等待后续联系功能开放。前台不会公开发布者联系方式。</p>
        <button class="community-button community-button-danger" type="button" data-report-post>举报帖子</button>
        <p class="community-message" data-report-message></p>
      </section>
      <section class="community-panel">
        <h2>NGN 服务入口</h2>
        <nav class="community-service-panel" data-category-services>${serviceLinksHtml()}</nav>
      </section>
    </aside>
  </main>
  <script src="/site-auth.js?v=20260517-community-1"></script>
  <script src="/community.js?v=20260517-community-1"></script>
</body>
</html>`;
}

async function getVisiblePost(supabase, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ""))) {
    return null;
  }
  const { data, error } = await supabase
    .from("community_posts")
    .select(PUBLIC_POST_COLUMNS)
    .eq("id", id)
    .eq("status", "published")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
}

module.exports = async function handler(req, res) {
  const baseUrl = resolveBaseUrl(req);
  const id = String(req.query?.id || "").trim();

  try {
    const supabase = getSupabaseAdmin();
    const post = await getVisiblePost(supabase, id);
    if (!post) {
      sendHtml(res, 404, renderNoindexPage({ baseUrl, id }));
      return;
    }
    sendHtml(res, 200, renderPostPage({ baseUrl, post }));
  } catch (error) {
    console.error("[community-post-page]", error);
    sendHtml(res, 500, renderNoindexPage({ baseUrl, id, title: "页面暂时不可用" }));
  }
};
