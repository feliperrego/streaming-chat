import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { ipAddress } from "@vercel/functions";

/**
 * Per-IP limit for public demos (spec §5.3). Off when the Upstash env vars
 * are missing or empty (local dev, CI). Fails open on Redis errors: the
 * AI Gateway spend cap is the backstop.
 */
const DEFAULT_LIMIT_PER_HOUR = 20;

function readLimitPerHour(): number {
  const raw = process.env.RATE_LIMIT_PER_HOUR?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_LIMIT_PER_HOUR;
  const value = Number(raw);
  return value > 0 ? value : DEFAULT_LIMIT_PER_HOUR;
}

export const RATE_LIMIT_PER_HOUR = readLimitPerHour();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const RATE_LIMIT_ENABLED = Boolean(redisUrl && redisToken);

// Each project sets its own prefix (spec §9) so demos sharing one Upstash
// database keep separate counters.
export const RATE_LIMIT_PREFIX = "ai-portfolio-template";

const limiter = RATE_LIMIT_ENABLED
  ? new Ratelimit({
      redis: new Redis({ url: redisUrl, token: redisToken }),
      limiter: Ratelimit.slidingWindow(RATE_LIMIT_PER_HOUR, "1 h"),
      prefix: RATE_LIMIT_PREFIX,
    })
  : null;

if (!limiter) {
  console.info("[rate-limit] Upstash env vars are not set; rate limiting is off.");
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds?: number };

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ipAddress(req) || forwarded || "unknown";
}

/**
 * Call first in every route that calls a model:
 *
 *   const limited = await rateLimit(req);
 *   if (!limited.ok) return rateLimitResponse(limited);
 */
export async function rateLimit(req: Request): Promise<RateLimitResult> {
  if (!limiter) return { ok: true };

  try {
    // analytics is off, so `pending` is an already-resolved promise.
    const { success, reset } = await limiter.limit(clientIp(req));
    if (success) return { ok: true };

    const seconds = Math.ceil((reset - Date.now()) / 1000);
    return Number.isFinite(seconds)
      ? { ok: false, retryAfterSeconds: Math.max(1, seconds) }
      : { ok: false };
  } catch (error) {
    console.error("[rate-limit] Upstash request failed; allowing the request.", error);
    return { ok: true };
  }
}

export function rateLimitResponse(result: {
  ok: false;
  retryAfterSeconds?: number;
}): Response {
  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8" });
  if (result.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }
  return new Response(
    `Demo limit reached: ${RATE_LIMIT_PER_HOUR} messages per hour. Try again later.`,
    { status: 429, headers },
  );
}
