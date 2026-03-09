const toPositiveInt = (rawValue, fallback) => {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const WINDOW_MS = toPositiveInt(process.env.AI_RATE_LIMIT_WINDOW_MS, 60_000);
const MAX_REQUESTS = toPositiveInt(process.env.AI_RATE_LIMIT_MAX_REQUESTS, 10);

const requestBuckets = new Map();
let lastCleanupAt = 0;

const getBucketKey = (req) => {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || req.ip || 'unknown').split(',')[0].trim();

  return `ip:${ip}`;
};

const cleanupExpiredBuckets = (now) => {
  if (now - lastCleanupAt < WINDOW_MS) {
    return;
  }

  for (const [key, bucket] of requestBuckets.entries()) {
    if (now - bucket.windowStart >= WINDOW_MS) {
      requestBuckets.delete(key);
    }
  }

  lastCleanupAt = now;
};

const aiRateLimitMiddleware = (req, res, next) => {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const bucketKey = getBucketKey(req);
  const currentBucket = requestBuckets.get(bucketKey);

  if (!currentBucket || now - currentBucket.windowStart >= WINDOW_MS) {
    requestBuckets.set(bucketKey, {
      count: 1,
      windowStart: now,
    });
    return next();
  }

  if (currentBucket.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - currentBucket.windowStart)) / 1000)
    );

    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      message: `Too many Claude requests. Try again in ${retryAfterSeconds} second(s).`,
    });
  }

  currentBucket.count += 1;
  requestBuckets.set(bucketKey, currentBucket);
  return next();
};

export default aiRateLimitMiddleware;
