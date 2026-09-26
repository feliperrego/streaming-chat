import { streamText } from "ai";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOCK_TEXT,
  buildStreamParts,
  createMockModel,
  toWordChunks,
} from "./mock";

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
