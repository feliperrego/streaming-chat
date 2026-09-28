import { describe, expect, it } from "vitest";
import type { Locale } from "./locale";
import { format, messages } from "./messages";

const LOCALES: Locale[] = ["en", "pt-BR"];

// Today's English strings (delta spec §6), copied from the components, lib/rate-limit.ts
// and e2e/chat.spec.ts as literals, so a rewording fails here instead of moving with the
// dictionary. `{n}` stands where the component inserts a number. The new keys
// (empty.groupDemo, empty.groupAbout, prompts.about, header.language) are not listed.
const TODAY_EN = {
  empty: {
    title: "Watch an answer stream in",
    tryIt: "Try it: send a prompt → press Stop (or Esc) halfway → Regenerate",
    rateNote: "{n} messages/hour per visitor; regenerations count",
  },
  prompts: {
    demo: [
      "200-word story about a lighthouse keeper",
      "Explain how HTTPS works to a new developer",
      "5 interview questions for a senior frontend engineer",
      "Follow-up email after a job interview",
    ],
  },
  header: { mockBadge: "Mock model", newChat: "New chat" },
  composer: {
    label: "Message",
    placeholder: "Send a message",
    capPlaceholder: "Conversation limit reached. Start a new chat.",
    send: "Send message",
    stop: "Stop generating",
  },
  list: {
    label: "Conversation",
    ttft: "First token in {n} ms",
    stopped: "Stopped",
    cutOff: "Cut at demo length limit",
    regenerate: "Regenerate",
    stoppedBefore: "Stopped before a response ·",
  },
  chat: { jump: "Jump to latest", retry: "Retry" },
  errors: {
    generic: "Couldn't get a response. Check your connection and try again.",
    limit: "Demo limit reached: {n} messages per hour. Try again later.",
  },
  status: {
    complete: "Response complete",
    stopped: "Response stopped",
    failed: "Response failed",
  },
  footer: { builtBy: "Built by", source: "Source on GitHub" },
};

/** Every string of a dictionary, keyed by its path, e.g. "prompts.demo.0". */
function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  return Object.entries(value as object).flatMap(([key, child]) =>
    leaves(child, path === "" ? key : `${path}.${key}`),
  );
}

/** The distinct `{name}` placeholders of a string, sorted. */
function placeholders(text: string): string[] {
  return [...new Set(text.match(/\{\w+\}/g))].sort();
}

describe("messages", () => {
  it.each(LOCALES)("has no empty value in %s", (locale) => {
    for (const [path, text] of leaves(messages[locale])) {
      expect(text.trim(), path).not.toBe("");
    }
  });

  it("has the same keys in both locales", () => {
    const keys = (locale: Locale) => leaves(messages[locale]).map(([path]) => path);
    expect(keys("pt-BR")).toEqual(keys("en"));
  });

  it("uses the same placeholders in both locales", () => {
    const pt = new Map(leaves(messages["pt-BR"]));
    for (const [path, text] of leaves(messages.en)) {
      expect(placeholders(pt.get(path) ?? ""), path).toEqual(placeholders(text));
    }
  });

  it.each(LOCALES)("holds 4 prompts in each group in %s", (locale) => {
    expect(messages[locale].prompts.demo).toHaveLength(4);
    expect(messages[locale].prompts.about).toHaveLength(4);
  });

  it("keeps today's English strings verbatim", () => {
    expect(messages.en).toMatchObject(TODAY_EN);
  });
});

describe("format", () => {
  it("fills every {name} placeholder", () => {
    expect(format("First token in {n} ms", { n: 812 })).toBe("First token in 812 ms");
    expect(format("{a} and {b}, then {a}", { a: 1, b: "two" })).toBe("1 and two, then 1");
  });

  it("leaves other text alone", () => {
    expect(format("Stopped before a response ·", { n: 1 })).toBe("Stopped before a response ·");
    expect(format("{m} and { n } stay", { n: 1 })).toBe("{m} and { n } stay");
    // Values go in verbatim: no $ patterns, and no second pass over inserted text.
    expect(format("{n}", { n: "$& {n}" })).toBe("$& {n}");
  });
});
