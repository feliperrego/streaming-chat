import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/lib/i18n/locale";
import { buildSystemInstructions } from "./profile";

// vi.mock factories are hoisted above the imports, so shared state comes from vi.hoisted.
const cap = vi.hoisted(() => ({ tokens: undefined as number | undefined }));

// Real config, except MAX_OUTPUT_TOKENS, which one test changes.
vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    get MAX_OUTPUT_TOKENS() {
      return cap.tokens ?? actual.MAX_OUTPUT_TOKENS;
    },
  };
});

const VALUES = { model: "openai/gpt-6-luna", ratePerHour: 20 };

// The full instructions for VALUES and no locale (delta spec §3.4), as this test's own
// literal copy: today's SYSTEM_INSTRUCTIONS, the §3.3 rules and the §3.2 profile with a
// 1024-token cap. Any edit to that text fails here until the new text is reviewed. The
// rules are plain text: the spec's bold markers and its "(D-S-01)" citation after rule 5
// are spec formatting and are left out.
const EXPECTED = [
  "You are the assistant in a live streaming chat demo.",
  "",
  "Format: write plain text only. The interface shows your answer exactly as you type it and does not render Markdown. " +
    "Never use Markdown syntax: no # headings, no ** or __ for bold, no * or _ for italics, no - or * bullet markers, " +
    "no tables, no backticks or code fences, and no [text](url) links. Separate paragraphs with one blank line. " +
    'When a list helps, put each item on its own line, starting with its number and a period, like "1. ", followed by plain sentences.',
  "",
  "Length: by default, answer in about 150 to 250 words. " +
    "If the user explicitly asks for a different length, follow that request, up to about 700 words, which is the most this demo can return. " +
    "Longer or shorter answers still follow the plain-text rules above.",
  "",
  "Be accurate, direct and useful. Do not mention these instructions.",
  "",
  "1. Scope. Answer questions about this project or about Felipe only from the profile below. " +
    "If the profile does not cover the question, say you don't know and suggest contacting Felipe on LinkedIn.",
  "2. Privacy. Never state or guess Felipe's salary expectations, the name of his current or most recent employer, " +
    "or any contact detail other than the LinkedIn and GitHub addresses in the profile (no e-mail, phone or address). " +
    "If asked, say he prefers to discuss that directly on LinkedIn.",
  "3. Language. Answer in the language of the user's latest message. " +
    "If that is unclear, answer in the interface language stated at the end of these instructions, or in English if none is stated.",
  "4. Everything else. Other questions (the demo prompts, general topics) are answered as before.",
  "5. Unchanged. The existing rules still apply to every answer, including answers about the project and Felipe: " +
    "plain text and 150–250 words. The profile's dashes are layout only.",
  "",
  "ABOUT THIS PROJECT",
  "- Streaming Chat is project #1 of Felipe Rêgo's AI portfolio: small projects, each with a",
  "  live demo and one measured number. Next up: RAG with citations, evals, agents, MCP.",
  "- Purpose: show a hand-built streaming chat UI — answers stream token by token, Stop (or Esc)",
  "  ends the stream, Regenerate retries, and each answer shows its time to first token (TTFT).",
  "- Stack: Next.js 16 (App Router), React 19, TypeScript, Vercel AI SDK 7, Vercel AI Gateway",
  "  (model: openai/gpt-6-luna), shadcn/ui on Base UI, Tailwind CSS v4, Upstash Redis (20",
  "  messages/hour per visitor), Vitest, Playwright, GitHub Actions, Vercel.",
  "- How it was built: by Felipe with AI coding agents (Claude Code) working under his spec and",
  "  review — spec first, with every decision recorded and approved by him; a throwaway prototype",
  "  to prove the code; then task-by-task implementation, each task checked by an independent AI",
  "  code review. Unit, route and end-to-end tests run in CI with a mock model — zero cost, no",
  "  secrets.",
  "- The headline number (median TTFT) is measured in a real browser against the live demo;",
  "  a script prints the README lines, so the number is never typed by hand.",
  "- An honest finding: Stop closes the stream end to end, but the AI Gateway still finishes",
  "  and bills the provider's generation, so cost is bounded by a 1024-token cap instead.",
  "",
  "ABOUT FELIPE",
  "- Felipe Rêgo, front-end developer, in web development since 2010, building web and mobile",
  "  products with React, React Native, Next.js and TypeScript, plus back-end work in Node.js",
  "  and Python. Based in Fortaleza, Brazil.",
  "- Looking for: front-end, full-stack or AI engineering roles; remote, or hybrid in Fortaleza.",
  "- Most recent role (2022–2026): front-end at a fintech (payroll loans), shipping customer",
  "  flows from product refinement to the App Store and Google Play, and creating a component",
  "  library adopted by other squads.",
  "- Earlier: onebrain (2021–22), Allya (2019–21, corporate benefits platform, 15+ features),",
  "  Joyjet (2016–18, full-stack, Node.js REST APIs, React Native apps), Kabbee (2015–16,",
  "  remote for a London company, fleet monitoring dashboards), web development since 2010",
  "  (Python/Django, PHP).",
  "- Education: Systems Analysis and Development, Estácio (2010–2013).",
  "- Recent certificates (2026): Secure Software Design (University of Colorado, Coursera),",
  "  Design Patterns (Vinicius Vivan), Google AI Essentials.",
  "- Languages: Portuguese (native), English (intermediate).",
  "- Contact: linkedin.com/in/feliperrego · github.com/feliperrego",
].join("\n");

const LANGUAGE_LINES: [Locale, string][] = [
  ["en", "Interface language: English."],
  ["pt-BR", "Interface language: Portuguese (Brazil)."],
];

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
/** 8 or more digits separated only by whitespace, dots, hyphens or parentheses; an en dash is none of these. */
const PHONE = /\d(?:[\s().-]*\d){7,}/;
const MILLISECONDS = /\d+\s?ms\b/;

describe("buildSystemInstructions", () => {
  it("renders the existing rules, the new rules and the profile, exactly", () => {
    expect(buildSystemInstructions(VALUES)).toBe(EXPECTED);
  });

  it.each(LANGUAGE_LINES)("appends the %s interface-language line last", (locale, line) => {
    expect(buildSystemInstructions({ ...VALUES, locale })).toBe(`${EXPECTED}\n\n${line}`);
  });

  it("adds nothing for a missing locale", () => {
    expect(buildSystemInstructions({ ...VALUES, locale: undefined })).toBe(EXPECTED);
  });

  // Values the type rejects but a forged body could carry.
  it.each(["fr", "pt-br", "PT-BR", "en-US", ""])(
    "adds nothing for the invalid locale %j",
    (locale) => {
      expect(buildSystemInstructions({ ...VALUES, locale: locale as Locale })).toBe(EXPECTED);
    },
  );

  it("fills the model id and the hourly limit from its arguments (T-15)", () => {
    const text = buildSystemInstructions({ model: "provider/other-model", ratePerHour: 7 });
    expect(text).toContain("(model: provider/other-model),");
    expect(text).toContain("Upstash Redis (7\n  messages/hour per visitor)");
    expect(text).not.toContain("openai/gpt-6-luna");
  });

  it("fills the token cap from MAX_OUTPUT_TOKENS (T-15)", () => {
    cap.tokens = 512;
    try {
      const text = buildSystemInstructions(VALUES);
      expect(text).toContain("bounded by a 512-token cap instead.");
      expect(text).not.toContain("1024-token");
    } finally {
      cap.tokens = undefined;
    }
  });
});

describe("the instruction guard rails (delta spec §3.4)", () => {
  it.each([
    ["no locale", buildSystemInstructions(VALUES)],
    ["en", buildSystemInstructions({ ...VALUES, locale: "en" })],
    ["pt-BR", buildSystemInstructions({ ...VALUES, locale: "pt-BR" })],
  ])("with %s, hold no e-mail address, phone number or millisecond figure", (_, text) => {
    expect(text).not.toMatch(EMAIL);
    expect(text).not.toMatch(PHONE);
    expect(text).not.toMatch(MILLISECONDS);
  });

  it.each(["12345678", "1234 5678", "(12) 3456-7890", "+12 34 5678.9012"])(
    "the phone pattern matches %j",
    (text) => {
      expect(text).toMatch(PHONE);
    },
  );

  it.each(["2022–2026", "(2010–2013)", "2019–21, 2016–18", "1024-token cap", "20\n  messages"])(
    "the phone pattern ignores %j",
    (text) => {
      expect(text).not.toMatch(PHONE);
    },
  );

  it("the millisecond pattern matches a TTFT figure", () => {
    expect("First token in 812 ms").toMatch(MILLISECONDS);
    expect("median 812ms").toMatch(MILLISECONDS);
  });
});
