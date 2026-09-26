import { APICallError, type ChatStatus, type UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  annotateFinish,
  describeChatError,
  hasVisibleText,
  isBusy,
  messageText,
  regenerateSlot,
  shouldSubmitOnKey,
  showTypingIndicator,
} from "./ui";

function user(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

/** Shaped like a streamed assistant message: a step-start part, then text. */
function assistant(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "step-start" }, { type: "text", text, state: "done" }],
  };
}

function apiCallError(statusCode: number, message = "Server says no."): APICallError {
  return new APICallError({
    message,
    url: "/api/chat",
    requestBodyValues: undefined,
    statusCode,
    responseBody: message,
  });
}

const BUSY: ChatStatus[] = ["submitted", "streaming"];
const IDLE: ChatStatus[] = ["ready", "error"];

describe("messageText / hasVisibleText", () => {
  it("joins only the text parts", () => {
    const message: UIMessage = {
      id: "a",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Hello " },
        { type: "reasoning", text: "hidden" },
        { type: "text", text: "world" },
      ],
    };
    expect(messageText(message)).toBe("Hello world");
  });

  it("treats empty, whitespace-only and text-less messages as not visible", () => {
    expect(hasVisibleText(assistant("a", ""))).toBe(false);
    expect(hasVisibleText(assistant("a", "  \n\t"))).toBe(false);
    expect(hasVisibleText({ id: "a", role: "assistant", parts: [] })).toBe(false);
    expect(hasVisibleText({ id: "a", role: "assistant", parts: [{ type: "step-start" }] })).toBe(
      false,
    );
    expect(hasVisibleText(assistant("a", " x "))).toBe(true);
  });
});

describe("isBusy", () => {
  it("is true only while submitted or streaming", () => {
    for (const status of BUSY) expect(isBusy(status)).toBe(true);
    for (const status of IDLE) expect(isBusy(status)).toBe(false);
  });
});

describe("annotateFinish", () => {
  const u = user("u1", "hi");

  it("marks a user Stop as stopped, not interrupted", () => {
    const message = assistant("a1", "partial");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: true,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: "a1", stopped: true, cutOff: false, interrupted: false });
  });

  it("marks finishReason 'length' as cut off", () => {
    const message = assistant("a1", "long answer");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: false,
        finishReason: "length",
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: true, interrupted: false });
  });

  it("marks no abort, no error and no finishReason as interrupted (timeout)", () => {
    const message = assistant("a1", "partial");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: false, interrupted: true });
  });

  it("is interrupted also when the message never reached messages (empty parts)", () => {
    expect(
      annotateFinish({
        message: { id: "fresh", role: "assistant", parts: [] },
        messages: [u],
        isAbort: false,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: null, stopped: false, cutOff: false, interrupted: true });
  });

  it("returns id null for a message absent from messages (Stop before text-start)", () => {
    expect(
      annotateFinish({
        message: { id: "fresh", role: "assistant", parts: [] },
        messages: [u],
        isAbort: true,
        isError: false,
        finishReason: undefined,
      }),
    ).toEqual({ id: null, stopped: true, cutOff: false, interrupted: false });
  });

  it("is neither stopped nor interrupted on an error or a normal finish", () => {
    const message = assistant("a1", "text");
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: true,
        finishReason: undefined,
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: false, interrupted: false });
    expect(
      annotateFinish({
        message,
        messages: [u, message],
        isAbort: false,
        isError: false,
        finishReason: "stop",
      }),
    ).toEqual({ id: "a1", stopped: false, cutOff: false, interrupted: false });
  });
});

describe("shouldSubmitOnKey", () => {
  it("submits on Enter only", () => {
    expect(shouldSubmitOnKey({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  });

  it("does not submit on Shift+Enter", () => {
    expect(shouldSubmitOnKey({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
  });

  it("does not submit while an IME composition is active", () => {
    expect(shouldSubmitOnKey({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });

  it("does not submit on other keys", () => {
    expect(shouldSubmitOnKey({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
  });
});

describe("describeChatError", () => {
  it("maps an APICallError with status 429 to the limit banner", () => {
    expect(describeChatError(apiCallError(429, "Demo limit reached."))).toBe("limit");
  });

  it("maps everything else to the generic banner", () => {
    expect(describeChatError(new TypeError("Failed to fetch"))).toBe("generic");
    expect(describeChatError(apiCallError(500, "<html>boom</html>"))).toBe("generic");
    expect(describeChatError(apiCallError(400, "Bad request."))).toBe("generic");
    expect(describeChatError(new Error("An error occurred."))).toBe("generic");
    expect(describeChatError(undefined)).toBe("generic");
  });

  it("never branches on message text", () => {
    expect(describeChatError(new Error("429 Too Many Requests"))).toBe("generic");
    expect(describeChatError(apiCallError(500, "429"))).toBe("generic");
  });
});

describe("regenerateSlot", () => {
  const u = user("u1", "hi");

  it("puts Regenerate after a final assistant answer with text", () => {
    expect(regenerateSlot([u, assistant("a1", "text")], "ready", false)).toBe("after-answer");
    expect(regenerateSlot([u, assistant("a1", "text")], "ready", true)).toBe("after-answer");
    expect(regenerateSlot([u, assistant("a1", "partial")], "error", false)).toBe("after-answer");
  });

  it("uses the stopped row when the user stopped before any visible text", () => {
    expect(regenerateSlot([u], "ready", true)).toBe("stopped-row");
    expect(regenerateSlot([u, assistant("a1", "")], "ready", true)).toBe("stopped-row");
    expect(regenerateSlot([u, assistant("a1", "  ")], "ready", true)).toBe("stopped-row");
  });

  it("shows nothing for those cases without a user Stop (timeout, error)", () => {
    expect(regenerateSlot([u], "ready", false)).toBeNull();
    expect(regenerateSlot([u, assistant("a1", "")], "ready", false)).toBeNull();
    expect(regenerateSlot([u, assistant("a1", "  ")], "ready", false)).toBeNull();
    expect(regenerateSlot([u], "error", false)).toBeNull();
  });

  it("shows nothing while busy", () => {
    for (const status of BUSY) {
      expect(regenerateSlot([u], status, true)).toBeNull();
      expect(regenerateSlot([u, assistant("a1", "text")], status, false)).toBeNull();
    }
  });

  it("shows nothing for an empty chat", () => {
    expect(regenerateSlot([], "ready", true)).toBeNull();
  });
});

describe("showTypingIndicator", () => {
  const u = user("u1", "hi");

  it("shows while submitted", () => {
    expect(showTypingIndicator([u], "submitted")).toBe(true);
    expect(showTypingIndicator([u, assistant("old", "old answer")], "submitted")).toBe(true);
  });

  it("shows while streaming until the new assistant message has visible text", () => {
    expect(showTypingIndicator([u, assistant("a1", "")], "streaming")).toBe(true);
    expect(showTypingIndicator([u, assistant("a1", " ")], "streaming")).toBe(true);
    expect(showTypingIndicator([u, assistant("a1", "Hi")], "streaming")).toBe(false);
  });

  it("hides when idle", () => {
    for (const status of IDLE) expect(showTypingIndicator([u], status)).toBe(false);
  });
});
