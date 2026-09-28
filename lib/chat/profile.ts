import { isLocale, type Locale } from "@/lib/i18n/locale";
import { MAX_OUTPUT_TOKENS, SYSTEM_INSTRUCTIONS } from "./config";

/**
 * Rules for questions about the project and about Felipe (delta spec §3.3), as plain text: the
 * spec's bold markers and its "(D-S-01)" citation after rule 5 are spec formatting and are
 * left out.
 */
const RULES = [
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
].join("\n");

/**
 * The only facts the model may state about the project and Felipe (delta spec §3.2), verbatim:
 * the line breaks and two-space continuation indents are part of the text. The model id, the
 * hourly limit and the token cap come from code, so the profile never contradicts the header
 * or the rate note (T-15).
 */
function profile(model: string, ratePerHour: number): string {
  return [
    "ABOUT THIS PROJECT",
    "- Streaming Chat is project #1 of Felipe Rêgo's AI portfolio: small projects, each with a",
    "  live demo and one measured number. Next up: RAG with citations, evals, agents, MCP.",
    "- Purpose: show a hand-built streaming chat UI — answers stream token by token, Stop (or Esc)",
    "  ends the stream, Regenerate retries, and each answer shows its time to first token (TTFT).",
    "- Stack: Next.js 16 (App Router), React 19, TypeScript, Vercel AI SDK 7, Vercel AI Gateway",
    `  (model: ${model}), shadcn/ui on Base UI, Tailwind CSS v4, Upstash Redis (${ratePerHour}`,
    "  messages/hour per visitor), Vitest, Playwright, GitHub Actions, Vercel.",
    "- How it was built: by Felipe with AI coding agents (Claude Code) working under his spec and",
    "  review — spec first, with every decision recorded and approved by him; a throwaway prototype",
    "  to prove the code; then task-by-task implementation, each task checked by an independent AI",
    "  code review. Unit, route and end-to-end tests run in CI with a mock model — zero cost, no",
    "  secrets.",
    "- The headline number (median TTFT) is measured in a real browser against the live demo;",
    "  a script prints the README lines, so the number is never typed by hand.",
    "- An honest finding: Stop closes the stream end to end, but the AI Gateway still finishes",
    `  and bills the provider's generation, so cost is bounded by a ${MAX_OUTPUT_TOKENS}-token cap instead.`,
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
}

/** The last line of the instructions, which rule 3 falls back to (delta spec §3.3, T-11). */
const INTERFACE_LANGUAGE: Record<Locale, string> = {
  en: "Interface language: English.",
  "pt-BR": "Interface language: Portuguese (Brazil).",
};

/**
 * The system instructions for one request (delta spec §3.1): SYSTEM_INSTRUCTIONS, the rules,
 * the profile and, for a valid locale, the interface-language line, separated by blank lines.
 * Pure: the route passes in MODEL_LABEL and RATE_LIMIT_PER_HOUR, which live in server-only
 * modules.
 */
export function buildSystemInstructions({
  model,
  ratePerHour,
  locale,
}: {
  model: string;
  ratePerHour: number;
  locale?: Locale;
}): string {
  const blocks = [SYSTEM_INSTRUCTIONS, RULES, profile(model, ratePerHour)];
  // Checked again at runtime, so a value that bypassed the type adds nothing.
  if (isLocale(locale)) blocks.push(INTERFACE_LANGUAGE[locale]);
  return blocks.join("\n\n");
}
