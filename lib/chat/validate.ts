import { safeValidateUIMessages, type UIMessage } from "ai";
import { MAX_ASSISTANT_CHARS, MAX_MESSAGES, MAX_USER_CHARS } from "./config";

export type ValidateResult =
  | { ok: true; messages: UIMessage[] }
  | { ok: false; status: 400; text: string };

/** Plain-text bodies of the 400 responses. Honest clients never see them. */
export const VALIDATION_ERRORS = {
  shape: "Invalid request: expected a JSON body with a non-empty messages array of UI messages.",
  role: "Invalid request: only user and assistant messages are allowed.",
  userPart: "Invalid request: user messages may contain text parts only.",
  tooMany: `Invalid request: a conversation may have at most ${MAX_MESSAGES} messages.`,
  userTooLong: `Invalid request: a user message may have at most ${MAX_USER_CHARS} characters.`,
  noUser: "Invalid request: the conversation needs at least one user message.",
} as const;

function reject(text: string): ValidateResult {
  return { ok: false, status: 400, text };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** All text parts of a message, concatenated; non-text parts are ignored. */
function textOf(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

type Turn = { id: string; role: "user" | "assistant"; text: string };

/**
 * The last MAX_ASSISTANT_CHARS characters of an assistant text (spec §14 A-22). An honest answer
 * can be longer: a model above the limit's characters per token at the token cap, or the mock's
 * [[slow]] answer, which ignores the cap. The client posts it again with every later message, so
 * a 400 would fail each one, Retry included. The end is kept because "continue" is the natural
 * follow-up to a cut answer. The cut never starts on the second half of a surrogate pair.
 */
function clipAssistantText(text: string): string {
  if (text.length <= MAX_ASSISTANT_CHARS) return text;
  let start = text.length - MAX_ASSISTANT_CHARS;
  const code = text.charCodeAt(start);
  if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  return text.slice(start);
}

/**
 * Validates the body the chat transport posts and cleans its messages for the
 * model (spec §3.3). Pure; async only because safeValidateUIMessages is.
 *
 * Order: shape and role checks, then limits on the messages as received,
 * then cleaning. Limits are not re-checked after merging, so a stopped and
 * re-sent prompt never produces a 400 (C-15). An assistant text over
 * MAX_ASSISTANT_CHARS is not rejected but cut to its end while cleaning, so the
 * model's input stays bounded and an honest history never gets a 400 (spec §14 A-22).
 *
 * The cleaned messages are rebuilt as { id, role, parts: [one text part] }:
 * every other field a client sent (metadata, providerMetadata, state) is
 * dropped, so a forged body cannot pass provider options to the model.
 */
export async function validateAndClean(body: unknown): Promise<ValidateResult> {
  // 1. Shape and role.
  const parsed = await safeValidateUIMessages({
    messages: isRecord(body) ? body.messages : undefined,
  });
  if (!parsed.success) return reject(VALIDATION_ERRORS.shape);
  const received = parsed.data;

  for (const message of received) {
    if (message.role !== "user" && message.role !== "assistant") {
      return reject(VALIDATION_ERRORS.role);
    }
    if (message.role === "user" && message.parts.some((part) => part.type !== "text")) {
      return reject(VALIDATION_ERRORS.userPart);
    }
  }

  // 2. Limits, on the messages as received.
  if (received.length > MAX_MESSAGES) return reject(VALIDATION_ERRORS.tooMany);

  for (const message of received) {
    if (message.role === "user" && textOf(message).length > MAX_USER_CHARS) {
      return reject(VALIDATION_ERRORS.userTooLong);
    }
  }

  // 3. Cleaning: keep only assistant text, cut to MAX_ASSISTANT_CHARS, drop
  // assistant turns with no non-whitespace text (left by an early Stop), and
  // merge consecutive user messages with a blank line (D-S-21).
  const turns: Turn[] = [];
  for (const message of received) {
    const text = textOf(message);

    if (message.role === "assistant") {
      const kept = clipAssistantText(text);
      if (kept.trim() !== "") turns.push({ id: message.id, role: "assistant", text: kept });
      continue;
    }

    const previous = turns[turns.length - 1];
    if (previous?.role === "user") {
      previous.text = `${previous.text}\n\n${text}`;
    } else {
      turns.push({ id: message.id, role: "user", text });
    }
  }

  if (!turns.some((turn) => turn.role === "user")) return reject(VALIDATION_ERRORS.noUser);

  return {
    ok: true,
    messages: turns.map(({ id, role, text }) => ({ id, role, parts: [{ type: "text", text }] })),
  };
}
