import { APICallError, type ChatOnFinishCallback, type ChatStatus, type UIMessage } from "ai";

/** The payload useChat passes to `onFinish` (ai 7: message, messages, isAbort, isDisconnect, isError, finishReason). */
export type ChatFinishEvent = Parameters<ChatOnFinishCallback<UIMessage>>[0];

export type FinishAnnotation = {
  /**
   * The finished message's id, or null when that message never reached `messages`
   * (Stop before `text-start`, a failed request, a timeout before any text).
   * The chat annotates only non-null ids.
   */
  id: string | null;
  /** The user pressed Stop or Esc. */
  stopped: boolean;
  /** The answer hit the output-token cap (`finishReason === 'length'`). */
  cutOff: boolean;
  /** The stream ended with no abort, no error and no finish reason: a server timeout (spec §2.3). */
  interrupted: boolean;
};

export type ChatErrorKind = "limit" | "generic";

export type RegenerateSlot = "after-answer" | "stopped-row" | null;

/** True while a request is in flight. */
export function isBusy(status: ChatStatus): boolean {
  return status === "submitted" || status === "streaming";
}

/** All text parts of a message, joined. Other part types (step-start, reasoning, ...) are ignored. */
export function messageText(message: UIMessage): string {
  let text = "";
  for (const part of message.parts) {
    if (part.type === "text") text += part.text;
  }
  return text;
}

/** True when the message has at least one non-whitespace text character. */
export function hasVisibleText(message: UIMessage): boolean {
  return messageText(message).trim() !== "";
}

/**
 * Turns useChat's `onFinish` payload into the chat's annotations (spec §3.5).
 * `message` is never undefined: when nothing was streamed it is a fresh assistant
 * message that is absent from `messages`, and `id` comes back null.
 */
export function annotateFinish({
  message,
  messages,
  isAbort,
  isError,
  finishReason,
}: Pick<
  ChatFinishEvent,
  "message" | "messages" | "isAbort" | "isError" | "finishReason"
>): FinishAnnotation {
  return {
    id: messages.some((m) => m.id === message.id) ? message.id : null,
    stopped: isAbort,
    cutOff: finishReason === "length",
    interrupted: !isAbort && !isError && finishReason == null,
  };
}

/** Enter sends; Shift+Enter inserts a newline; Enter during IME composition does nothing. */
export function shouldSubmitOnKey({
  key,
  shiftKey,
  isComposing,
}: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
}): boolean {
  return key === "Enter" && !shiftKey && !isComposing;
}

/**
 * Picks the error banner. A non-2xx response makes the default transport throw an
 * `APICallError` whose `statusCode` is the HTTP status; the message text is never inspected.
 */
export function describeChatError(error: unknown): ChatErrorKind {
  return APICallError.isInstance(error) && error.statusCode === 429 ? "limit" : "generic";
}

/**
 * Where the single Regenerate button goes (spec §2.2), or null for nowhere.
 * - "after-answer": under the final message, an assistant message with visible text.
 * - "stopped-row": in the "Stopped before a response" row, only after a user Stop,
 *   when the final message is a user message or an assistant message without visible text.
 */
export function regenerateSlot(
  messages: UIMessage[],
  status: ChatStatus,
  stoppedByUser: boolean,
): RegenerateSlot {
  if (isBusy(status)) return null;
  const last = messages.at(-1);
  if (last === undefined) return null;
  if (last.role === "assistant" && hasVisibleText(last)) return "after-answer";
  // The final message is a user message, or an assistant message with no visible text.
  return stoppedByUser && last.role !== "system" ? "stopped-row" : null;
}

/** Typing dots: while submitted, or while streaming before the new answer has visible text. */
export function showTypingIndicator(messages: UIMessage[], status: ChatStatus): boolean {
  if (status === "submitted") return true;
  if (status !== "streaming") return false;
  const last = messages.at(-1);
  return last === undefined || last.role !== "assistant" || !hasVisibleText(last);
}
