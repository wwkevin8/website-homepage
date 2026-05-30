const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number.parseInt(process.env.PORT || "3000", 10);

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function normalizeBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function getSupabaseUrlInfo() {
  const rawUrl = String(process.env.SUPABASE_URL || "").trim();
  let parsed = null;
  try {
    parsed = rawUrl ? new URL(rawUrl) : null;
  } catch (error) {
    parsed = null;
  }

  const hostname = parsed?.hostname?.toLowerCase() || "";
  const projectRef = hostname.endsWith(".supabase.co")
    ? hostname.split(".")[0]
    : hostname || "(missing)";
  const isLocalSupabase = Boolean(
    rawUrl &&
    (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      rawUrl === String(process.env.LOCAL_SUPABASE_URL || "").trim()
    )
  );
  const appEnv = String(process.env.APP_ENV || "").trim().toLowerCase();
  const isStaging = appEnv === "staging";
  const isProductionData = Boolean(rawUrl && !isLocalSupabase && !isStaging);

  return {
    appEnv: process.env.APP_ENV || "(unset)",
    runtimeMode: process.env.RUNTIME_MODE || "local_dev",
    projectRef,
    isProductionData,
    isLocalRuntime: true,
    allowProductionInDev: normalizeBoolean(process.env.ALLOW_PROD_IN_DEV)
  };
}

function logRuntimeEnvironment(info) {
  console.info("[dev-server] runtime environment:");
  console.info(`  APP_ENV / runtime mode: ${info.appEnv} / ${info.runtimeMode}`);
  console.info(`  Supabase project ref: ${info.projectRef}`);
  console.info(`  production data: ${info.isProductionData ? "yes" : "no"}`);
  console.info(`  local runtime: ${info.isLocalRuntime ? "yes" : "no"}`);
  console.info(`  allow production in dev: ${info.allowProductionInDev ? "yes" : "no"}`);
}

function enforceDevDatabaseSafety() {
  const info = getSupabaseUrlInfo();
  logRuntimeEnvironment(info);

  if (info.isLocalRuntime && info.isProductionData && !info.allowProductionInDev) {
    console.error(
      "Blocked: local dev server is trying to connect to production Supabase. Use npm run dev:local for local DB, or npm run dev:prod with ALLOW_PROD_IN_DEV=true only when intentionally testing production."
    );
    process.exit(1);
  }
}

enforceDevDatabaseSafety();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.end(text);
}

function withQueryObject(req, parsedUrl) {
  const query = {};
  parsedUrl.searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      const current = query[key];
      query[key] = Array.isArray(current) ? [...current, value] : [current, value];
    } else {
      query[key] = value;
    }
  });
  req.query = query;
}

function toApiModulePath(urlPathname) {
  if (
    urlPathname === "/api/admin/login" ||
    urlPathname === "/api/admin/logout" ||
    urlPathname === "/api/admin/session" ||
    urlPathname === "/api/admin/dashboard" ||
    urlPathname === "/api/admin/storage-orders"
  ) {
    return path.join(ROOT, "api", "admin", "[...action].js");
  }

  if (
    urlPathname.startsWith("/api/admin/managers") ||
    urlPathname.startsWith("/api/admin/users") ||
    urlPathname.startsWith("/api/admin/memberships") ||
    urlPathname.startsWith("/api/admin/membership-claims") ||
    urlPathname.startsWith("/api/admin/membership-birthdays") ||
    urlPathname.startsWith("/api/admin/membership-codes") ||
    urlPathname.startsWith("/api/admin/community-") ||
    urlPathname.startsWith("/api/admin/storage-orders") ||
    urlPathname.startsWith("/api/admin/orders")
  ) {
    return path.join(ROOT, "api", "admin", "[...action].js");
  }

  if (urlPathname.startsWith("/api/auth/")) {
    return path.join(ROOT, "api", "auth", "[action].js");
  }

  if (urlPathname.startsWith("/api/public/")) {
    return path.join(ROOT, "api", "public", "[...action].js");
  }

  if (urlPathname === "/api/community-post-page" || /^\/community-post\/[^/]+$/.test(urlPathname)) {
    return path.join(ROOT, "api", "community-post-page.js");
  }

  if (urlPathname === "/api/cron/close-expired-transport-requests") {
    return path.join(ROOT, "api", "cron", "close-expired-transport-requests.js");
  }

  if (urlPathname === "/api/transport-requests") {
    return path.join(ROOT, "api", "transport-requests", "index.js");
  }

  if (urlPathname === "/api/transport-requests/export") {
    return path.join(ROOT, "api", "transport-requests", "export.js");
  }

  if (urlPathname === "/api/transport-manual-import/preview") {
    return path.join(ROOT, "api", "transport-manual-import", "preview.js");
  }

  if (urlPathname === "/api/transport-manual-import/commit") {
    return path.join(ROOT, "api", "transport-manual-import", "commit.js");
  }

  if (urlPathname === "/api/transport-manual-import/manual") {
    return path.join(ROOT, "api", "transport-manual-import", "manual.js");
  }

  if (/^\/api\/transport-requests\/[^/]+$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-requests", "[id].js");
  }

  if (/^\/api\/transport-requests\/[^/]+\/time-adjust-candidate-groups$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-requests", "[id]", "time-adjust-candidate-groups.js");
  }

  if (/^\/api\/transport-requests\/[^/]+\/change-preview$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-requests", "[id]", "change-preview.js");
  }

  if (/^\/api\/transport-requests\/[^/]+\/change-confirm$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-requests", "[id]", "change-confirm.js");
  }

  if (/^\/api\/transport-requests\/[^/]+\/recreate$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-requests", "[id]", "recreate.js");
  }

  if (urlPathname === "/api/transport-groups") {
    return path.join(ROOT, "api", "transport-groups", "index.js");
  }

  if (urlPathname === "/api/transport-sync-audit-logs") {
    return path.join(ROOT, "api", "transport-sync-audit-logs.js");
  }

  if (urlPathname === "/api/storage-sync-audit-logs") {
    return path.join(ROOT, "api", "storage-sync-audit-logs.js");
  }

  if (urlPathname === "/api/run-storage-sync-audit") {
    return path.join(ROOT, "api", "run-storage-sync-audit.js");
  }

  if (urlPathname === "/api/cron/run-storage-sync-audit") {
    return path.join(ROOT, "api", "cron", "run-storage-sync-audit.js");
  }

  if (/^\/api\/transport-groups\/[^/]+$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-groups", "[id].js");
  }

  if (/^\/api\/transport-groups\/[^/]+\/members$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-groups", "[id]", "members.js");
  }

  if (/^\/api\/transport-group-members\/[^/]+$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-group-members", "[id].js");
  }

  return null;
}

function applyRouteParams(req, urlPathname) {
  const authActionMatch = urlPathname.match(/^\/api\/auth\/([^/]+)$/);
  if (authActionMatch) {
    req.query = { ...(req.query || {}), action: authActionMatch[1] };
  }

  const publicActionMatch = urlPathname.match(/^\/api\/public\/(.+)$/);
  if (publicActionMatch) {
    req.query = { ...(req.query || {}), action: publicActionMatch[1] };
  }

  const communityPostMatch = urlPathname.match(/^\/community-post\/([^/]+)$/);
  if (communityPostMatch) {
    req.query = { ...(req.query || {}), id: decodeURIComponent(communityPostMatch[1]) };
  }

  if (/^\/api\/transport-requests\/[^/]+$/.test(urlPathname)) {
    req.query = { ...(req.query || {}), id: urlPathname.split("/").pop() };
  }

  const timeAdjustCandidateMatch = urlPathname.match(/^\/api\/transport-requests\/([^/]+)\/time-adjust-candidate-groups$/);
  if (timeAdjustCandidateMatch) {
    req.query = { ...(req.query || {}), id: timeAdjustCandidateMatch[1] };
  }

  const changePreviewMatch = urlPathname.match(/^\/api\/transport-requests\/([^/]+)\/change-preview$/);
  if (changePreviewMatch) {
    req.query = { ...(req.query || {}), id: changePreviewMatch[1] };
  }

  const changeConfirmMatch = urlPathname.match(/^\/api\/transport-requests\/([^/]+)\/change-confirm$/);
  if (changeConfirmMatch) {
    req.query = { ...(req.query || {}), id: changeConfirmMatch[1] };
  }

  const recreateMatch = urlPathname.match(/^\/api\/transport-requests\/([^/]+)\/recreate$/);
  if (recreateMatch) {
    req.query = { ...(req.query || {}), id: recreateMatch[1] };
  }

  const groupMembersMatch = urlPathname.match(/^\/api\/transport-groups\/([^/]+)\/members$/);
  if (groupMembersMatch) {
    req.query = { ...(req.query || {}), id: groupMembersMatch[1] };
  }

  const groupMatch = urlPathname.match(/^\/api\/transport-groups\/([^/]+)$/);
  if (groupMatch) {
    req.query = { ...(req.query || {}), id: groupMatch[1] };
  }

  const memberMatch = urlPathname.match(/^\/api\/transport-group-members\/([^/]+)$/);
  if (memberMatch) {
    req.query = { ...(req.query || {}), id: memberMatch[1] };
  }
}

async function handleApi(req, res, parsedUrl) {
  const modulePath = toApiModulePath(parsedUrl.pathname);
  if (!modulePath || !fs.existsSync(modulePath)) {
    sendText(res, 404, "API route not found");
    return;
  }

  const hotReloadRoots = [
    path.join(ROOT, "api") + path.sep,
    path.join(ROOT, "public-api-handlers") + path.sep
  ];
  for (const cacheKey of Object.keys(require.cache)) {
    if (hotReloadRoots.some(rootPath => cacheKey.startsWith(rootPath))) {
      delete require.cache[cacheKey];
    }
  }
  const handler = require(modulePath);
  withQueryObject(req, parsedUrl);
  applyRouteParams(req, parsedUrl.pathname);

  try {
    await handler(req, res);
    if (!res.writableEnded) {
      sendText(res, 500, "API handler did not send a response");
    }
  } catch (error) {
    console.error("[dev-server] API error:", error);
    if (!res.writableEnded) {
      sendText(res, 500, error && error.message ? error.message : "Unexpected API error");
    }
  }
}

function safeJoin(root, targetPath) {
  const fullPath = path.normalize(path.join(root, targetPath));
  if (!fullPath.startsWith(root)) {
    return null;
  }
  return fullPath;
}

function isBlockedStaticPath(urlPathname) {
  const normalized = String(urlPathname || "").replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some(segment => segment.startsWith("."))) {
    return true;
  }

  const blockedRoots = new Set([
    "api",
    "public-api-handlers",
    "supabase",
    "node_modules",
    ".git",
    ".vercel"
  ]);

  return segments.some((segment, index) => index === 0 && blockedRoots.has(segment));
}

function resolveStaticPath(urlPathname) {
  let relativePath = decodeURIComponent(urlPathname);
  if (relativePath === "/") {
    relativePath = "/index.html";
  }

  const localRewrites = new Map([
    ["/postage", "/postage.html"],
    ["/postage/submit", "/postage-submit.html"]
  ]);
  relativePath = localRewrites.get(relativePath) || relativePath;

  if (isBlockedStaticPath(relativePath)) {
    return null;
  }

  const fullPath = safeJoin(ROOT, relativePath);
  if (!fullPath) {
    return null;
  }

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return fullPath;
  }

  const normalizedRelative = relativePath.replace(/\\/g, "/");
  if ((normalizedRelative === "/admin" || normalizedRelative.startsWith("/admin/")) && !path.extname(fullPath)) {
    const adminVueIndex = path.join(ROOT, "admin", "index.html");
    if (fs.existsSync(adminVueIndex) && fs.statSync(adminVueIndex).isFile()) {
      return adminVueIndex;
    }
  }

  if (!path.extname(fullPath)) {
    const htmlPath = `${fullPath}.html`;
    if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
      return htmlPath;
    }
  }

  return null;
}

function handleStatic(req, res, parsedUrl) {
  if (parsedUrl.pathname === "/admin-vue" || parsedUrl.pathname.startsWith("/admin-vue/")) {
    const targetPath = parsedUrl.pathname === "/admin-vue"
      ? "/admin/"
      : parsedUrl.pathname.replace(/^\/admin-vue(?=\/|$)/, "/admin");
    res.statusCode = 302;
    res.setHeader("Location", `${targetPath}${parsedUrl.search || ""}`);
    res.end();
    return;
  }

  const filePath = resolveStaticPath(parsedUrl.pathname);
  if (!filePath) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  if (parsedUrl.pathname.startsWith("/api/") || /^\/community-post\/[^/]+$/.test(parsedUrl.pathname)) {
    await handleApi(req, res, parsedUrl);
    return;
  }

  handleStatic(req, res, parsedUrl);
});

server.listen(PORT, () => {
  console.log(`[dev-server] local helper only, running at http://localhost:${PORT}`);
});
