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

  if (urlPathname.startsWith("/api/admin/managers") || urlPathname.startsWith("/api/admin/users")) {
    return path.join(ROOT, "api", "admin", "[...action].js");
  }

  if (urlPathname.startsWith("/api/auth/")) {
    return path.join(ROOT, "api", "auth", "[action].js");
  }

  if (urlPathname === "/api/public/auth-config") {
    return path.join(ROOT, "api", "public", "auth-config.js");
  }

  if (urlPathname === "/api/public/transport-groups") {
    return path.join(ROOT, "api", "public", "transport-groups.js");
  }

  if (urlPathname === "/api/public/transport-request-submit") {
    return path.join(ROOT, "api", "public", "transport-request-submit.js");
  }

  if (urlPathname === "/api/public/storage-order-submit") {
    return path.join(ROOT, "api", "public", "storage-order-submit.js");
  }

  if (urlPathname === "/api/transport-requests") {
    return path.join(ROOT, "api", "transport-requests", "index.js");
  }

  if (/^\/api\/transport-requests\/[^/]+$/.test(urlPathname)) {
    return path.join(ROOT, "api", "transport-requests", "[id].js");
  }

  if (urlPathname === "/api/transport-groups") {
    return path.join(ROOT, "api", "transport-groups", "index.js");
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
  if (/^\/api\/transport-requests\/[^/]+$/.test(urlPathname)) {
    req.query = { ...(req.query || {}), id: urlPathname.split("/").pop() };
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

  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(path.join(ROOT, "api") + path.sep)) {
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

function resolveStaticPath(urlPathname) {
  let relativePath = decodeURIComponent(urlPathname);
  if (relativePath === "/") {
    relativePath = "/index.html";
  }

  const fullPath = safeJoin(ROOT, relativePath);
  if (!fullPath) {
    return null;
  }

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return fullPath;
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

  if (parsedUrl.pathname.startsWith("/api/")) {
    await handleApi(req, res, parsedUrl);
    return;
  }

  handleStatic(req, res, parsedUrl);
});

server.listen(PORT, () => {
  console.log(`[dev-server] running at http://localhost:${PORT}`);
});
