import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { MOCK_FIRST_TOKEN_DELAY_MS } from "@/lib/chat/config";
import {
  ERROR_CHUNKS,
  MOCK_ERROR_MESSAGE,
  MOCK_SCENARIO_TIMING,
  SLOW_CHUNKS,
  selectScenario,
  type MockScenarioName,
  type MockTiming,
} from "./mock-scenarios";

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;

/** One part of a V4 model stream (text-start, text-delta, text-end, finish, error, ...). */
export type MockStreamPart =
  MockStreamResult["stream"] extends ReadableStream<infer T> ? T : never;

export type MockModelOptions = {
  initialDelayInMs?: number;
  chunkDelayInMs?: number;
  chunks?: string[];
};

export const DEFAULT_MOCK_TEXT =
  "Streaming lets an answer appear while it is still being written. " +
  "Instead of waiting for the whole response, the interface shows each word " +
  "as soon as the model produces it. That makes a slow answer feel fast, and " +
  "it gives the reader a chance to stop early when the answer is already good " +
  "enough, or clearly going in the wrong direction. This paragraph comes from " +
  "the mock model in the portfolio template. It is split into one chunk per " +
  "word, with a short delay before the first chunk and a small gap between the " +
  "rest, so tests and demos can exercise streaming, stopping, and time to " +
  "first token without calling a real model or spending any money. Nothing " +
  "here was generated; it is the same text every time, which keeps every test " +
  "run predictable.";

/** Splits text into one word plus its trailing whitespace per chunk. */
export function toWordChunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

export function buildStreamParts(chunks: readonly string[]): MockStreamPart[] {
  const id = "text-1";
  return [
    { type: "text-start", id },
    ...chunks.map((delta): MockStreamPart => ({ type: "text-delta", id, delta })),
    { type: "text-end", id },
    {
      type: "finish",
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: chunks.length, text: chunks.length, reasoning: undefined },
      },
    },
  ];
}

/**
 * Text deltas followed by a V4 `error` stream part. streamText turns that part
 * into a UI `error` chunk (errorText from the route's onError). A stream that
 * throws instead (controller.error) would abort the HTTP body with no `error`
 * chunk, so the mock uses the stream part.
 */
export function buildErrorStreamParts(chunks: readonly string[]): MockStreamPart[] {
  const id = "text-1";
  return [
    { type: "text-start", id },
    ...chunks.map((delta): MockStreamPart => ({ type: "text-delta", id, delta })),
    { type: "error", error: new Error(MOCK_ERROR_MESSAGE) },
  ];
}

export function scenarioStreamParts(scenario: MockScenarioName): MockStreamPart[] {
  switch (scenario) {
    case "slow":
      return buildStreamParts(SLOW_CHUNKS);
    case "error":
      return buildErrorStreamParts(ERROR_CHUNKS);
    default:
      return buildStreamParts(toWordChunks(DEFAULT_MOCK_TEXT));
  }
}

/**
 * The mock that getModel() returns in mock mode: every doStream call picks
 * default, [[slow]] or [[error]] from the last user message (spec §3.2).
 * Tests may pass a faster timing; the scenario choice stays the same.
 */
export function createScenarioMockModel(
  timing: MockTiming = MOCK_SCENARIO_TIMING,
): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({
        chunks: scenarioStreamParts(selectScenario(prompt)),
        initialDelayInMs: timing.initialDelayInMs,
        chunkDelayInMs: timing.chunkDelayInMs,
      }),
    }),
  });
}

/**
 * A deterministic model for CI, local runs without a key, and tests.
 * Without options (how lib/ai/model.ts calls it) it picks a scenario per
 * request from the prompt, so getModel() never takes arguments (template
 * spec §5.2). With options, every call streams the same fixed chunks.
 */
export function createMockModel(options?: MockModelOptions): MockLanguageModelV4 {
  if (options === undefined) return createScenarioMockModel();

  const {
    initialDelayInMs = MOCK_FIRST_TOKEN_DELAY_MS,
    chunkDelayInMs = 30,
    chunks = toWordChunks(DEFAULT_MOCK_TEXT),
  } = options;

  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: buildStreamParts(chunks),
        initialDelayInMs,
        chunkDelayInMs,
      }),
    }),
  });
}
