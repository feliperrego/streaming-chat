import type { LanguageModel } from "ai";
import { createMockModel } from "./mock";

/**
 * The only place that decides which model the app talks to (spec §5.1).
 * Real mode: an AI Gateway "provider/model" string from AI_MODEL.
 * Mock mode (AI_MOCK=1): a deterministic local model; no key, no cost.
 * Server-only: pass IS_MOCK / MODEL_LABEL to client components as props; importing this module in a "use client" file fails at runtime because AI_MODEL is not exposed to the browser.
 */
export const IS_MOCK = process.env.AI_MOCK === "1";

if (IS_MOCK && process.env.VERCEL_ENV === "production") {
  throw new Error(
    "AI_MOCK=1 is not allowed in production (VERCEL_ENV=production). " +
      "Remove AI_MOCK from the production environment variables.",
  );
}

const configuredModel = process.env.AI_MODEL?.trim();

if (!IS_MOCK && !configuredModel) {
  throw new Error(
    'AI_MODEL is not set. Set it to a "provider/model" string (see .env.example), ' +
      "or set AI_MOCK=1 to use the mock model.",
  );
}

export const MODEL_LABEL: string = IS_MOCK ? "mock" : (configuredModel as string);

export function getModel(): LanguageModel {
  return IS_MOCK ? createMockModel() : MODEL_LABEL;
}
