const buckets = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function enforceRateLimit(req, options = {}) {
  const limit = Number(options.limit || 5);
  const windowMs = Number(options.windowMs || 10 * 60 * 1000);
  const keyPrefix = options.keyPrefix || "global";
  const ip = getClientIp(req);
  const now = Date.now();
  const key = `${keyPrefix}:${ip}`;
  const current = buckets.get(key);

  if (!current || current.expiresAt <= now) {
    buckets.set(key, {
      count: 1,
      expiresAt: now + windowMs
    });
    return {
      allowed: true,
      remaining: limit - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000)
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
    };
  }

  current.count += 1;
  buckets.set(key, current);

  return {
    allowed: true,
    remaining: limit - current.count,
    retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
  };
}

module.exports = {
  enforceRateLimit,
  getClientIp
};
