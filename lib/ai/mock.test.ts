import { streamText } from "ai";
import type { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MOCK_TEXT,
  buildErrorStreamParts,
  buildStreamParts,
  createMockModel,
  createScenarioMockModel,
  toWordChunks,
} from "./mock";
import {
  ERROR_CHUNKS,
  MOCK_ERROR_MESSAGE,
  MOCK_SCENARIO_TIMING,
  SLOW_CHUNKS,
  lastUserText,
  resetMockScenarios,
  selectScenario,
  type MockPrompt,
} from "./mock-scenarios";

describe("toWordChunks", () => {
  it("splits into one word plus its trailing whitespace per chunk", () => {
    expect(toWordChunks("Hello  big world")).toEqual(["Hello  ", "big ", "world"]);
  });

  it("returns no chunks for empty or whitespace-only text", () => {
    expect(toWordChunks("")).toEqual([]);
    expect(toWordChunks("   ")).toEqual([]);
  });
});

describe("buildStreamParts", () => {
  it("wraps text deltas between text-start/text-end and ends with finish", () => {
    const parts = buildStreamParts(["a ", "b"]);
    expect(parts.map((p) => p.type)).toEqual([
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "finish",
    ]);
  });
});

describe("createMockModel", () => {
  it("streams the default ~120-word paragraph", async () => {
    const model = createMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0 });
    const result = streamText({ model, prompt: "hi", maxOutputTokens: 100 });
    expect(await result.text).toBe(DEFAULT_MOCK_TEXT);
    expect(toWordChunks(DEFAULT_MOCK_TEXT).length).toBeGreaterThanOrEqual(100);
  });

  it("streams custom chunks in order", async () => {
    const model = createMockModel({
      initialDelayInMs: 0,
      chunkDelayInMs: 0,
      chunks: ["one ", "two ", "three"],
    });
    const parts: string[] = [];
    const result = streamText({ model, prompt: "hi", maxOutputTokens: 100 });
    for await (const part of result.textStream) parts.push(part);
    expect(parts.join("")).toBe("one two three");
  });

  it("waits initialDelayInMs before the first text", async () => {
    const model = createMockModel({
      initialDelayInMs: 80,
      chunkDelayInMs: 0,
      chunks: ["x"],
    });
    const started = performance.now();
    const result = streamText({ model, prompt: "hi", maxOutputTokens: 100 });
    for await (const part of result.textStream) {
      expect(part).toBe("x");
      break;
    }
    expect(performance.now() - started).toBeGreaterThanOrEqual(75);
  });

  it("serves a fresh stream on every call and records call options", async () => {
    const model = createMockModel({ initialDelayInMs: 0, chunkDelayInMs: 0, chunks: ["ok"] });
    const controller = new AbortController();
    const first = streamText({
      model,
      prompt: "a",
      maxOutputTokens: 123,
      abortSignal: controller.signal,
    });
    const second = streamText({ model, prompt: "b", maxOutputTokens: 100 });
    expect(await first.text).toBe("ok");
    expect(await second.text).toBe("ok");
    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[0].maxOutputTokens).toBe(123);
    expect(model.doStreamCalls[0].abortSignal).toBe(controller.signal);
  });
});

// Scenario tests (streaming-chat spec §3.2). The Set of seen [[error]] prompts
// is module state, so every test starts from a clean one.
const FAST = { initialDelayInMs: 0, chunkDelayInMs: 0 };

function userPrompt(...texts: string[]): MockPrompt {
  return texts.map((text) => ({ role: "user" as const, content: [{ type: "text" as const, text }] }));
}

/** Streams one user message through streamText and collects text and error parts. */
async function streamOnce(model: MockLanguageModelV4, text: string) {
  const result = streamText({
    model,
    messages: [{ role: "user", content: text }],
    maxOutputTokens: 100,
  });
  const deltas: string[] = [];
  const errors: unknown[] = [];
  for await (const part of result.stream) {
    if (part.type === "text-delta") deltas.push(part.text);
    if (part.type === "error") errors.push(part.error);
  }
  return { text: deltas.join(""), deltas, errors };
}

describe("mock scenarios", () => {
  beforeEach(() => {
    resetMockScenarios();
    // streamText logs model stream errors with console.error by default.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("lastUserText", () => {
    it("reads the text parts of the last user message only", () => {
      const prompt: MockPrompt = [
        { role: "system", content: "[[error]] in the instructions" },
        { role: "user", content: [{ type: "text", text: "[[slow]] earlier" }] },
        { role: "assistant", content: [{ type: "text", text: "[[error]] in an answer" }] },
        {
          role: "user",
          content: [
            { type: "text", text: "last " },
            { type: "text", text: "message" },
          ],
        },
      ];
      expect(lastUserText(prompt)).toBe("last message");
    });

    it('returns "" when there is no user message', () => {
      expect(lastUserText([{ role: "system", content: "x" }])).toBe("");
    });
  });

  describe("selectScenario", () => {
    it("picks default without a trigger and slow for [[slow]]", () => {
      expect(selectScenario(userPrompt("Tell me a story"))).toBe("default");
      expect(selectScenario(userPrompt("[[slow]] please"))).toBe("slow");
      expect(selectScenario(userPrompt("[[slow]] please"))).toBe("slow");
    });

    it("picks error only the first time it sees the exact prompt text", () => {
      expect(selectScenario(userPrompt("[[error]] once"))).toBe("error");
      expect(selectScenario(userPrompt("[[error]] once"))).toBe("default");
      expect(selectScenario(userPrompt("[[error]] once again"))).toBe("error");
    });

    it("lets [[error]] win over [[slow]], then falls back to slow", () => {
      expect(selectScenario(userPrompt("[[slow]] [[error]]"))).toBe("error");
      expect(selectScenario(userPrompt("[[slow]] [[error]]"))).toBe("slow");
    });

    it("looks only at the last user message", () => {
      expect(selectScenario(userPrompt("[[error]] earlier", "[[slow]] now"))).toBe("slow");
      expect(selectScenario(userPrompt("[[slow]] earlier", "plain now"))).toBe("default");
    });
  });

  describe("scenario data", () => {
    it("uses the 600 ms calibration anchor and 30 ms between chunks", () => {
      expect(MOCK_SCENARIO_TIMING).toEqual({ initialDelayInMs: 600, chunkDelayInMs: 30 });
    });

    it("[[slow]] has 300 short lines, each ending in a newline", () => {
      expect(SLOW_CHUNKS).toHaveLength(300);
      for (const chunk of SLOW_CHUNKS) expect(chunk).toMatch(/^[^\n]+\n$/);
    });

    it("[[error]] streams 3 words, then an error part and nothing else", () => {
      expect(ERROR_CHUNKS).toHaveLength(3);
      const parts = buildErrorStreamParts(ERROR_CHUNKS);
      expect(parts.map((p) => p.type)).toEqual([
        "text-start",
        "text-delta",
        "text-delta",
        "text-delta",
        "error",
      ]);
    });
  });

  describe("createScenarioMockModel", () => {
    it("streams the default paragraph without a trigger", async () => {
      const run = await streamOnce(createScenarioMockModel(FAST), "Tell me something");
      expect(run.text).toBe(DEFAULT_MOCK_TEXT);
      expect(run.errors).toEqual([]);
    });

    it("streams the slow lines for [[slow]]", async () => {
      const run = await streamOnce(createScenarioMockModel(FAST), "[[slow]]");
      expect(run.deltas).toEqual(SLOW_CHUNKS);
      expect(run.text.split("\n")).toHaveLength(301);
    });

    it("fails after 3 words for [[error]], then streams the default answer on retry", async () => {
      const model = createScenarioMockModel(FAST);

      const first = await streamOnce(model, "[[error]] retry me");
      expect(first.deltas).toEqual(ERROR_CHUNKS);
      expect(first.errors).toHaveLength(1);
      expect((first.errors[0] as Error).message).toBe(MOCK_ERROR_MESSAGE);

      const retry = await streamOnce(model, "[[error]] retry me");
      expect(retry.text).toBe(DEFAULT_MOCK_TEXT);
      expect(retry.errors).toEqual([]);
      expect(model.doStreamCalls).toHaveLength(2);
    });
  });

  describe("createMockModel", () => {
    it("without options picks scenarios with the real 600 ms first-chunk delay", async () => {
      const model = createMockModel();
      const started = performance.now();
      const result = streamText({
        model,
        messages: [{ role: "user", content: "[[error]] real timing" }],
        maxOutputTokens: 100,
      });
      let firstTextAfterMs: number | undefined;
      const types: string[] = [];
      for await (const part of result.stream) {
        if (part.type === "text-delta" && firstTextAfterMs === undefined) {
          firstTextAfterMs = performance.now() - started;
        }
        types.push(part.type);
      }
      expect(firstTextAfterMs).toBeGreaterThanOrEqual(595);
      expect(types).toContain("error");
    });

    it("with options streams fixed chunks and ignores triggers", async () => {
      const fixed = createMockModel({ ...FAST, chunks: ["fixed"] });
      const run = await streamOnce(fixed, "[[error]] fixed");
      expect(run.text).toBe("fixed");
      expect(run.errors).toEqual([]);

      // The fixed model did not consume the prompt: the scenario model still fails on it.
      const scenario = await streamOnce(createScenarioMockModel(FAST), "[[error]] fixed");
      expect(scenario.errors).toHaveLength(1);
    });
  });
});
