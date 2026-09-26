import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// model.ts reads the environment when it is first imported, so every test
// sets the env and then imports a fresh copy of the module.
async function loadModel(env: Record<string, string | undefined>) {
  vi.stubEnv("AI_MOCK", undefined);
  vi.stubEnv("AI_MODEL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return import("./model");
}

describe("lib/ai/model", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the mock model when AI_MOCK=1", async () => {
    const m = await loadModel({ AI_MOCK: "1" });
    expect(m.IS_MOCK).toBe(true);
    expect(m.MODEL_LABEL).toBe("mock");
    const model = m.getModel();
    expect(typeof model).toBe("object");
    expect((model as { provider: string }).provider).toBe("mock-provider");
  });

  it("returns the trimmed AI_MODEL string in real mode", async () => {
    const m = await loadModel({ AI_MODEL: "  anthropic/test-model \n" });
    expect(m.IS_MOCK).toBe(false);
    expect(m.MODEL_LABEL).toBe("anthropic/test-model");
    expect(m.getModel()).toBe("anthropic/test-model");
  });

  it('only "1" enables mock mode', async () => {
    for (const value of ["true", "0", "", "yes"]) {
      vi.resetModules();
      const m = await loadModel({ AI_MOCK: value, AI_MODEL: "openai/test" });
      expect(m.IS_MOCK).toBe(false);
      expect(m.getModel()).toBe("openai/test");
    }
  });

  it("allows mock mode on preview deployments", async () => {
    const m = await loadModel({ AI_MOCK: "1", VERCEL_ENV: "preview" });
    expect(m.IS_MOCK).toBe(true);
  });

  it("throws at load when AI_MOCK=1 in production", async () => {
    await expect(
      loadModel({ AI_MOCK: "1", VERCEL_ENV: "production" }),
    ).rejects.toThrow(/AI_MOCK=1 is not allowed in production/);
  });

  it("throws at load when AI_MODEL is missing in real mode", async () => {
    await expect(loadModel({})).rejects.toThrow(/AI_MODEL is not set/);
  });

  it("treats a whitespace-only AI_MODEL as missing", async () => {
    await expect(loadModel({ AI_MODEL: "   " })).rejects.toThrow(/AI_MODEL is not set/);
  });
});
