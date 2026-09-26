import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports, so shared state comes from
// vi.hoisted. Vitest 5 clears mock call history before each test
// (clearMocks: true), so constructor arguments are recorded here instead of
// being read from mock.calls.
const h = vi.hoisted(() => ({
  limit: vi.fn(),
  ratelimitConfig: undefined as unknown,
  slidingArgs: undefined as unknown[] | undefined,
  redisConfig: undefined as unknown,
}));

vi.mock("@upstash/redis", () => {
  function Redis(this: unknown, config: unknown) {
    h.redisConfig = config;
  }
  return { Redis };
});

vi.mock("@upstash/ratelimit", () => {
  function Ratelimit(this: { limit: unknown }, config: unknown) {
    h.ratelimitConfig = config;
    this.limit = h.limit;
  }
  Ratelimit.slidingWindow = (...args: unknown[]) => {
    h.slidingArgs = args;
    return "sliding-window";
  };
  return { Ratelimit };
});

const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

async function loadRateLimit(env: Record<string, string | undefined> = {}) {
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "RATE_LIMIT_PER_HOUR",
  ]) {
    vi.stubEnv(name, "");
  }
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import("./rate-limit");
}

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", { method: "POST", headers });
}

beforeEach(() => {
  vi.resetModules();
  h.limit.mockReset();
  h.ratelimitConfig = undefined;
  h.slidingArgs = undefined;
  h.redisConfig = undefined;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("when Upstash is not configured", () => {
  it("is off when the env vars are empty strings, allows every request and logs once", async () => {
    const m = await loadRateLimit();
    expect(m.RATE_LIMIT_ENABLED).toBe(false);
    expect(await m.rateLimit(request())).toEqual({ ok: true });
    expect(await m.rateLimit(request())).toEqual({ ok: true });
    expect(h.limit).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it("is off when only the URL is set", async () => {
    const m = await loadRateLimit({ UPSTASH_REDIS_REST_URL: "https://example.upstash.io" });
    expect(m.RATE_LIMIT_ENABLED).toBe(false);
    expect(h.ratelimitConfig).toBeUndefined();
  });
});

describe("when Upstash is configured", () => {
  it("builds a 20-per-hour sliding window with the UPSTASH_* names", async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    expect(m.RATE_LIMIT_ENABLED).toBe(true);
    expect(m.RATE_LIMIT_PER_HOUR).toBe(20);
    expect(h.slidingArgs).toEqual([20, "1 h"]);
    expect(h.ratelimitConfig).toMatchObject({
      limiter: "sliding-window",
      prefix: "ai-portfolio-template",
    });
    expect(h.redisConfig).toEqual({ url: "https://example.upstash.io", token: "token" });
  });

  it("also accepts the KV_REST_API_* names the Vercel integration injects", async () => {
    const m = await loadRateLimit({
      KV_REST_API_URL: "https://kv.upstash.io",
      KV_REST_API_TOKEN: "kv-token",
    });
    expect(m.RATE_LIMIT_ENABLED).toBe(true);
    expect(h.redisConfig).toEqual({ url: "https://kv.upstash.io", token: "kv-token" });
  });

  it("uses RATE_LIMIT_PER_HOUR when it is a positive integer", async () => {
    const m = await loadRateLimit({ ...UPSTASH_ENV, RATE_LIMIT_PER_HOUR: "5" });
    expect(m.RATE_LIMIT_PER_HOUR).toBe(5);
    expect(h.slidingArgs).toEqual([5, "1 h"]);
  });

  it("falls back to 20 for an invalid RATE_LIMIT_PER_HOUR", async () => {
    for (const value of ["abc", "0", "-3", "2.5"]) {
      vi.resetModules();
      const m = await loadRateLimit({ ...UPSTASH_ENV, RATE_LIMIT_PER_HOUR: value });
      expect(m.RATE_LIMIT_PER_HOUR).toBe(20);
    }
  });

  it('keys by x-real-ip, then the first x-forwarded-for entry, then "unknown"', async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    expect(m.clientIp(request({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe(
      "1.1.1.1",
    );
    expect(m.clientIp(request({ "x-forwarded-for": " 3.3.3.3 , 4.4.4.4" }))).toBe("3.3.3.3");
    expect(m.clientIp(request())).toBe("unknown");
  });

  it("allows the request when Upstash says success", async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    h.limit.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 3_600_000,
      pending: Promise.resolve(),
    });
    expect(await m.rateLimit(request({ "x-real-ip": "1.1.1.1" }))).toEqual({ ok: true });
    expect(h.limit).toHaveBeenCalledWith("1.1.1.1");
  });

  it("denies with retryAfterSeconds rounded up from reset", async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    h.limit.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 1_059_500,
      pending: Promise.resolve(),
    });
    expect(await m.rateLimit(request())).toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it("clamps Retry-After to at least 1 second", async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    h.limit.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: 900_000,
      pending: Promise.resolve(),
    });
    expect(await m.rateLimit(request())).toEqual({ ok: false, retryAfterSeconds: 1 });
  });

  it("omits Retry-After when reset is not a finite number", async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    h.limit.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Number.NaN,
      pending: Promise.resolve(),
    });
    expect(await m.rateLimit(request())).toEqual({ ok: false });
  });

  it("allows the request and logs when Upstash throws", async () => {
    const m = await loadRateLimit(UPSTASH_ENV);
    h.limit.mockRejectedValue(new Error("connection refused"));
    expect(await m.rateLimit(request())).toEqual({ ok: true });
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe("rateLimitResponse", () => {
  it("returns a 429 with the demo-limit text and Retry-After", async () => {
    const m = await loadRateLimit({ RATE_LIMIT_PER_HOUR: "20" });
    const res = m.rateLimitResponse({ ok: false, retryAfterSeconds: 42 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe(
      "Demo limit reached: 20 messages per hour. Try again later.",
    );
  });

  it("omits Retry-After when it is unknown", async () => {
    const m = await loadRateLimit();
    const res = m.rateLimitResponse({ ok: false });
    expect(res.headers.has("Retry-After")).toBe(false);
  });
});
