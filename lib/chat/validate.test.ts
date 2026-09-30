import { describe, expect, it } from "vitest";
import { VALIDATION_ERRORS, validateAndClean } from "./validate";

type TestMessage = { id: string; role: string; parts: Record<string, unknown>[] };

let nextId = 0;
function id(prefix: string) {
  nextId += 1;
  return `${prefix}${nextId}`;
}

function user(text: string): TestMessage {
  return { id: id("u"), role: "user", parts: [{ type: "text", text }] };
}

function assistant(...parts: Record<string, unknown>[]): TestMessage {
  return { id: id("a"), role: "assistant", parts };
}

function assistantText(text: string): TestMessage {
  return assistant({ type: "step-start" }, { type: "text", text, state: "done" });
}

/** Alternating user/assistant history of `count` messages that starts with a user message. */
function history(count: number): TestMessage[] {
  return Array.from({ length: count }, (_, i) =>
    i % 2 === 0 ? user(`question ${i}`) : assistantText(`answer ${i}`),
  );
}

/** Role and text of each cleaned message, for compact assertions. */
async function cleaned(messages: unknown) {
  const result = await validateAndClean({ id: "chat", messages, trigger: "submit-message" });
  if (!result.ok) throw new Error(`Expected ok, got 400: ${result.text}`);
  return result.messages.map((m) => ({
    role: m.role,
    text: m.parts.map((p) => (p.type === "text" ? p.text : `<${p.type}>`)).join("|"),
  }));
}

describe("validateAndClean — accepts", () => {
  it.each([
    ["a 1-message history", 1],
    ["a 10-message history", 10],
    ["a 20-message history (the limit)", 20],
  ])("%s", async (_, count) => {
    const result = await validateAndClean({ messages: history(count) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.messages).toHaveLength(count);
  });

  it.each([
    ["a user text of exactly 2000 characters", [user("u".repeat(2000))]],
    ["an assistant text of exactly 6000 characters", [user("Hi"), assistantText("a".repeat(6000)), user("More")]],
    ["an assistant message with no parts (dropped while cleaning)", [user("Hi"), assistant(), user("Again")]],
  ])("%s", async (_, messages) => {
    expect((await validateAndClean({ messages })).ok).toBe(true);
  });
});

describe("validateAndClean — rejects with 400", () => {
  const cases: [string, unknown, string][] = [
    ["a system message", { messages: [{ id: "s", role: "system", parts: [{ type: "text", text: "x" }] }, user("Hi")] }, VALIDATION_ERRORS.role],
    ["a user file part", { messages: [{ id: "u", role: "user", parts: [{ type: "file", mediaType: "image/png", url: "data:image/png;base64,AA==" }, { type: "text", text: "see" }] }] }, VALIDATION_ERRORS.userPart],
    ["a user text of 2001 characters", { messages: [user("u".repeat(2001))] }, VALIDATION_ERRORS.userTooLong],
    ["a user message whose text parts add up to 2001 characters", { messages: [{ id: "u", role: "user", parts: [{ type: "text", text: "u".repeat(1000) }, { type: "text", text: "u".repeat(1001) }] }] }, VALIDATION_ERRORS.userTooLong],
    ["21 messages", { messages: history(21) }, VALIDATION_ERRORS.tooMany],
    ["only assistant messages", { messages: [assistantText("Hello")] }, VALIDATION_ERRORS.noUser],
    ["a body that is not an object", "hello", VALIDATION_ERRORS.shape],
    ["a body that is null", null, VALIDATION_ERRORS.shape],
    ["a body without messages", { id: "chat" }, VALIDATION_ERRORS.shape],
    ["messages that are not an array", { messages: { role: "user" } }, VALIDATION_ERRORS.shape],
    ["an empty messages array", { messages: [] }, VALIDATION_ERRORS.shape],
    ["a message without an id", { messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }] }, VALIDATION_ERRORS.shape],
    ["an unknown role", { messages: [{ id: "x", role: "tool", parts: [{ type: "text", text: "Hi" }] }] }, VALIDATION_ERRORS.shape],
    ["a user message with no parts", { messages: [{ id: "u", role: "user", parts: [] }] }, VALIDATION_ERRORS.shape],
    ["a text part without text", { messages: [{ id: "u", role: "user", parts: [{ type: "text" }] }] }, VALIDATION_ERRORS.shape],
    ["an unknown part type", { messages: [{ id: "u", role: "user", parts: [{ type: "banana", text: "Hi" }] }] }, VALIDATION_ERRORS.shape],
  ];

  it.each(cases)("%s", async (_, body, text) => {
    expect(await validateAndClean(body)).toEqual({ ok: false, status: 400, text });
  });

  it("checks roles before limits: 21 messages with a system message report the role", async () => {
    const messages = [{ id: "s", role: "system", parts: [{ type: "text", text: "x" }] }, ...history(20)];
    expect(await validateAndClean({ messages })).toMatchObject({ text: VALIDATION_ERRORS.role });
  });
});

describe("validateAndClean — cleaning", () => {
  it("drops non-text assistant parts and keeps the text", async () => {
    expect(
      await cleaned([
        user("Hi"),
        assistant(
          { type: "step-start" },
          { type: "reasoning", text: "thinking" },
          { type: "text", text: "Hello " },
          { type: "source-url", sourceId: "s1", url: "https://example.com" },
          { type: "text", text: "there" },
        ),
        user("Thanks"),
      ]),
    ).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Hello there" },
      { role: "user", text: "Thanks" },
    ]);
  });

  it.each([
    ["an empty assistant text", assistantText("")],
    ["a whitespace-only assistant text", assistantText("  \n ")],
    ["an assistant message with no parts", assistant()],
    ["an assistant message with only non-text parts", assistant({ type: "step-start" })],
  ])("drops %s and merges the user messages around it", async (_, empty) => {
    expect(await cleaned([user("First"), empty, user("Second")])).toEqual([
      { role: "user", text: "First\n\nSecond" },
    ]);
  });

  it("accepts and merges two consecutive 1500-character user messages", async () => {
    const a = "a".repeat(1500);
    const b = "b".repeat(1500);
    expect(await cleaned([user(a), user(b)])).toEqual([{ role: "user", text: `${a}\n\n${b}` }]);
  });

  // An honest history can carry a longer answer (a mock that ignores the token cap, a model
  // above the limit's characters per token), and the client posts it with every later message.
  it("cuts an assistant text over 6000 characters to its last 6000, with no 400", async () => {
    const head = "h".repeat(100);
    const tail = "t".repeat(6000);
    expect(await cleaned([user("Hi"), assistantText(head + tail), user("More")])).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: tail },
      { role: "user", text: "More" },
    ]);
  });

  it("never starts the cut on the second half of a surrogate pair", async () => {
    // "😀" is two UTF-16 code units; the cut point falls between them.
    const text = "😀" + "t".repeat(5999);
    const [, answer] = await cleaned([user("Hi"), assistantText(text), user("More")]);
    expect(answer.text).toBe("t".repeat(5999));
  });

  it("merges three consecutive user messages into one, in order", async () => {
    expect(await cleaned([user("one"), user("two"), user("three")])).toEqual([
      { role: "user", text: "one\n\ntwo\n\nthree" },
    ]);
  });

  it("keeps the first merged message's id", async () => {
    const first = user("one");
    const result = await validateAndClean({ messages: [first, user("two")] });
    expect(result.ok && result.messages[0].id).toBe(first.id);
  });

  it("rebuilds messages with only id, role and one plain text part", async () => {
    const result = await validateAndClean({
      messages: [
        {
          id: "u1",
          role: "user",
          metadata: { forged: true },
          parts: [{ type: "text", text: "Hi", providerMetadata: { anthropic: { cacheControl: { type: "ephemeral" } } } }],
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      messages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] }],
    });
  });
});
