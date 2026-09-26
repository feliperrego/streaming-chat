import type { MockLanguageModelV4 } from "ai/test";
import { MOCK_FIRST_TOKEN_DELAY_MS } from "@/lib/chat/config";

/**
 * Per-request behaviour of the mock model (spec §3.2, D-S-16, C-08, C-17).
 * The mock's doStream reads the last user message of the prompt and picks a
 * scenario by a magic token, so getModel() never takes arguments.
 */

/** The prompt a V4 model receives in doStream(options).prompt. */
export type MockPrompt = Parameters<MockLanguageModelV4["doStream"]>[0]["prompt"];

export type MockScenarioName = "default" | "slow" | "error";

export type MockTiming = { initialDelayInMs: number; chunkDelayInMs: number };

export const SLOW_TRIGGER = "[[slow]]";
export const ERROR_TRIGGER = "[[error]]";

/** Timing shared by every scenario: the first chunk is the TTFT calibration anchor (D-S-12). */
export const MOCK_SCENARIO_TIMING: MockTiming = {
  initialDelayInMs: MOCK_FIRST_TOKEN_DELAY_MS,
  chunkDelayInMs: 30,
};

/** [[slow]]: 300 short lines, far taller than an 800 px viewport (~9 s at 30 ms per chunk). */
export const SLOW_CHUNKS: readonly string[] = Array.from(
  { length: 300 },
  (_, i) => `Line ${i + 1} of the slow mock answer.\n`,
);

/** [[error]]: the text streamed before the mock fails. */
export const ERROR_CHUNKS: readonly string[] = ["This ", "answer ", "fails "];

/** The raw error the [[error]] scenario emits; the route must never send it to the client. */
export const MOCK_ERROR_MESSAGE = "Mock model failure ([[error]] scenario)";

// Prompt texts that already produced the [[error]] scenario in this server
// process. The first request with a given text fails; Retry (same text) streams
// the default answer.
const seenErrorPrompts = new Set<string>();

/** Text of the last user message in the prompt, or "" when there is none. */
export function lastUserText(prompt: MockPrompt): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message.role === "user") {
      return message.content.map((part) => (part.type === "text" ? part.text : "")).join("");
    }
  }
  return "";
}

/**
 * Picks the scenario for one doStream call. [[error]] wins over [[slow]], but
 * only the first time this process sees that exact last-user-message text.
 * Records the text as seen when it returns "error".
 */
export function selectScenario(prompt: MockPrompt): MockScenarioName {
  const text = lastUserText(prompt);
  if (text.includes(ERROR_TRIGGER) && !seenErrorPrompts.has(text)) {
    seenErrorPrompts.add(text);
    return "error";
  }
  if (text.includes(SLOW_TRIGGER)) return "slow";
  return "default";
}

/** Test helper: forget which [[error]] prompts were already seen. */
export function resetMockScenarios(): void {
  seenErrorPrompts.clear();
}
