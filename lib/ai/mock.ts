import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

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

export function buildStreamParts(chunks: string[]): MockStreamPart[] {
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
 * A deterministic model for CI, local runs without a key, and tests.
 * Projects that need per-request behaviour choose it inside doStream(options)
 * by reading options.prompt, so getModel() never takes arguments (spec §5.2).
 */
export function createMockModel(options: MockModelOptions = {}): MockLanguageModelV4 {
  const {
    initialDelayInMs = 600,
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
