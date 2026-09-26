import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadHealth(env: Record<string, string | undefined>) {
  for (const name of [
    "AI_MOCK",
    "AI_MODEL",
    "VERCEL_ENV",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    vi.stubEnv(name, "");
  }
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import("@/app/api/health/route");
}

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/health", () => {
  it("reports mock mode with the limiter off", async () => {
    const { GET } = await loadHealth({ AI_MOCK: "1" });
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: "mock", mock: true, rateLimit: "off" });
  });

  it("reports the real model and an active limiter", async () => {
    const { GET } = await loadHealth({
      AI_MODEL: "anthropic/test-model",
      KV_REST_API_URL: "https://kv.upstash.io",
      KV_REST_API_TOKEN: "kv-token",
    });
    expect(await GET().json()).toEqual({
      ok: true,
      model: "anthropic/test-model",
      mock: false,
      rateLimit: "upstash",
    });
  });
});
