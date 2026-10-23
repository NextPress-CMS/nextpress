/**
 * In-memory sliding-window rate limiter.
 *
 * Protects the public submission endpoint against flooding / basic DDoS by
 * capping how many submissions a single client (keyed by IP) may make within
 * a rolling time window. It is dependency-free and works on a single Node
 * instance out of the box.
 *
 * For multi-instance / serverless deployments, swap `MemoryRateLimitStore`
 * for a shared store (Redis, Upstash, etc.) that implements `RateLimitStore`.
 */

export interface RateLimitResult {
  /** Whether the request is allowed through. */
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Unix ms timestamp when the window resets. */
  resetAt: number;
  /** Seconds the caller should wait before retrying (when blocked). */
  retryAfter: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, max: number): RateLimitResult;
}

interface Bucket {
  /** Timestamps (ms) of hits inside the current window. */
  hits: number[];
}

/**
 * Sliding-window counter kept in process memory. Old buckets are pruned
 * lazily on access plus by a periodic sweep so memory stays bounded even
 * under attack.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  hit(key: string, windowMs: number, max: number): RateLimitResult {
    const now = Date.now();
    this.maybeSweep(now, windowMs);

    const bucket = this.buckets.get(key) ?? { hits: [] };
    // Drop hits that fell out of the window.
    const windowStart = now - windowMs;
    bucket.hits = bucket.hits.filter((t) => t > windowStart);

    const count = bucket.hits.length;
    const oldest = bucket.hits[0] ?? now;
    const resetAt = oldest + windowMs;

    if (count >= max) {
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: Math.max(0, max - bucket.hits.length),
      resetAt: now + windowMs,
      retryAfter: 0,
    };
  }

  /** Periodically evict fully-expired buckets to bound memory. */
  private maybeSweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    const windowStart = now - windowMs;
    for (const [key, bucket] of this.buckets) {
      const live = bucket.hits.filter((t) => t > windowStart);
      if (live.length === 0) this.buckets.delete(key);
      else bucket.hits = live;
    }
  }
}

/** Shared singleton store for the plugin runtime. */
export const rateLimitStore: RateLimitStore = new MemoryRateLimitStore();

/**
 * Check a client against the configured limit.
 *
 * @param identifier Client key (typically the resolved IP).
 * @param max        Max requests allowed per window.
 * @param windowSeconds Window length in seconds.
 */
export function checkRateLimit(
  identifier: string,
  max: number,
  windowSeconds: number,
  store: RateLimitStore = rateLimitStore,
): RateLimitResult {
  const safeMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 5;
  const safeWindow =
    Number.isFinite(windowSeconds) && windowSeconds > 0
      ? Math.floor(windowSeconds)
      : 60;
  return store.hit(identifier || "unknown", safeWindow * 1000, safeMax);
}

/**
 * Best-effort client IP extraction from proxy headers. Never trust this for
 * authentication — it is only used for coarse abuse throttling.
 */
export function resolveClientIp(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}
