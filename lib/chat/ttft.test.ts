import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createTtftTracker } from "./ttft";

function user(id: string, text: string): UIMessage {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

/** Shaped like a streamed assistant message: a step-start part, then text. */
function assistant(id: string, text: string): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "step-start" }, { type: "text", text, state: "streaming" }],
  };
}

/** A tracker whose clock reads `clock.now`, set by each test. */
function setup(startAt = 1000) {
  const clock = { now: startAt };
  const tracker = createTtftTracker(() => clock.now);
  return { clock, tracker };
}

const u1 = user("u1", "hi");

describe("createTtftTracker", () => {
  it("records on the first character of a new assistant id", () => {
    const { clock, tracker } = setup(1000);
    tracker.start([]);
    clock.now = 1100;
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    clock.now = 1500;
    // text-start: the message exists but has no character yet
    expect(tracker.observe({ messages: [u1, assistant("a1", "")], status: "streaming" })).toBeNull();
    clock.now = 1600.4;
    expect(tracker.observe({ messages: [u1, assistant("a1", "H")], status: "streaming" })).toEqual(
      { id: "a1", ttftMs: 600 },
    );
  });

  it("counts any character, including whitespace", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    clock.now = 42;
    expect(tracker.observe({ messages: [u1, assistant("a1", " ")], status: "streaming" })).toEqual({
      id: "a1",
      ttftMs: 42,
    });
  });

  it("ignores stale text on pre-existing ids (regenerate)", () => {
    const { clock, tracker } = setup(0);
    const before = [u1, assistant("a-old", "old answer")];
    tracker.start(before);
    clock.now = 10;
    // a commit before regenerate() slices the old answer off
    expect(tracker.observe({ messages: before, status: "submitted" })).toBeNull();
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    clock.now = 700;
    expect(tracker.observe({ messages: [u1, assistant("a-new", "N")], status: "streaming" })).toEqual(
      { id: "a-new", ttftMs: 700 },
    );
  });

  it("ignores user messages", () => {
    const { tracker } = setup(0);
    tracker.start([]);
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
  });

  it("records when status jumps straight to ready with text in one commit", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    clock.now = 900;
    expect(
      tracker.observe({ messages: [u1, assistant("a1", "Whole answer.")], status: "ready" }),
    ).toEqual({ id: "a1", ttftMs: 900 });
  });

  it("records nothing when stopped before any character", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    clock.now = 100;
    expect(tracker.observe({ messages: [u1], status: "ready" })).toBeNull();
    // t0 is gone, so even a later new id with text is not sampled
    clock.now = 200;
    expect(tracker.observe({ messages: [u1, assistant("a1", "x")], status: "ready" })).toBeNull();
  });

  it("records nothing when stopped between text-start and the first character", () => {
    const { tracker } = setup(0);
    tracker.start([]);
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    expect(tracker.observe({ messages: [u1, assistant("a1", "")], status: "streaming" })).toBeNull();
    expect(tracker.observe({ messages: [u1, assistant("a1", "")], status: "ready" })).toBeNull();
  });

  it("does not clear t0 on a ready observation after start(); only a busy -> idle edge does", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    // sendMessage awaits before pushing the user message: a commit can land here
    clock.now = 1;
    expect(tracker.observe({ messages: [], status: "ready" })).toBeNull();
    expect(tracker.observe({ messages: [u1], status: "ready" })).toBeNull();
    clock.now = 5;
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    clock.now = 650;
    expect(tracker.observe({ messages: [u1, assistant("a1", "x")], status: "streaming" })).toEqual({
      id: "a1",
      ttftMs: 650,
    });
  });

  it("clears t0 on a busy -> error edge", () => {
    const { tracker } = setup(0);
    tracker.start([]);
    expect(tracker.observe({ messages: [u1], status: "submitted" })).toBeNull();
    expect(tracker.observe({ messages: [u1], status: "error" })).toBeNull();
    expect(tracker.observe({ messages: [u1, assistant("a1", "x")], status: "error" })).toBeNull();
  });

  it("records at most once per id", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    clock.now = 600;
    expect(tracker.observe({ messages: [u1, assistant("a1", "a")], status: "streaming" })).toEqual({
      id: "a1",
      ttftMs: 600,
    });
    clock.now = 700;
    expect(tracker.observe({ messages: [u1, assistant("a1", "ab")], status: "streaming" })).toBeNull();
    expect(tracker.observe({ messages: [u1, assistant("a1", "abc")], status: "ready" })).toBeNull();
  });

  it("measures each request from its own start()", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    clock.now = 600;
    tracker.observe({ messages: [u1, assistant("a1", "x")], status: "streaming" });
    tracker.observe({ messages: [u1, assistant("a1", "x")], status: "ready" });
    const history = [u1, assistant("a1", "x")];
    clock.now = 10_000;
    tracker.start(history);
    const u2 = user("u2", "again");
    expect(tracker.observe({ messages: [...history, u2], status: "submitted" })).toBeNull();
    clock.now = 10_750;
    expect(
      tracker.observe({ messages: [...history, u2, assistant("a2", "y")], status: "streaming" }),
    ).toEqual({ id: "a2", ttftMs: 750 });
  });

  it("reset() clears everything", () => {
    const { clock, tracker } = setup(0);
    tracker.start([]);
    clock.now = 600;
    expect(tracker.observe({ messages: [u1, assistant("a1", "x")], status: "streaming" })).toEqual({
      id: "a1",
      ttftMs: 600,
    });
    tracker.reset();
    // no t0: nothing is recorded
    expect(tracker.observe({ messages: [u1, assistant("a2", "y")], status: "streaming" })).toBeNull();
    // the per-id memory is gone too: a1 can be sampled again after a new start()
    clock.now = 1000;
    tracker.start([]);
    clock.now = 1300;
    expect(tracker.observe({ messages: [u1, assistant("a1", "x")], status: "streaming" })).toEqual({
      id: "a1",
      ttftMs: 300,
    });
  });

  it("uses performance.now() by default", () => {
    const tracker = createTtftTracker();
    tracker.start([]);
    const sample = tracker.observe({ messages: [u1, assistant("a1", "x")], status: "streaming" });
    expect(sample?.id).toBe("a1");
    expect(sample?.ttftMs).toBeGreaterThanOrEqual(0);
  });
});
