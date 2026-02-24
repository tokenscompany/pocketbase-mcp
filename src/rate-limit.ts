const RPM = Number(process.env.RATE_LIMIT_RPM) || 60;
const BURST = Number(process.env.RATE_LIMIT_BURST) || 10;

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// Cleanup stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (now - bucket.lastRefill > 120_000) {
      buckets.delete(ip);
    }
  }
}, 60_000).unref();

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: BURST, lastRefill: now };
    buckets.set(ip, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const tokensPerMs = RPM / 60_000;
  const refill = elapsed * tokensPerMs;
  bucket.tokens = Math.min(BURST, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;
  return true;
}

/** Reset all buckets — for testing */
export function resetRateLimits(): void {
  buckets.clear();
}
