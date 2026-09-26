/**
 * Chat configuration shared by the client and the server (spec §3.7).
 * Keep this module free of server-only imports: client components import it.
 */

/**
 * System instructions sent with every request (spec §2.2). The UI renders
 * answers as plain text (whitespace-pre-wrap), so the model must never use
 * Markdown. The default length leaves time to press Stop; an explicit length
 * request is honoured up to what MAX_OUTPUT_TOKENS allows.
 */
export const SYSTEM_INSTRUCTIONS = [
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
].join("\n");

/** Longest user message, in characters (D-S-03). The composer's maxLength matches it. */
export const MAX_USER_CHARS = 2000;

/** Longest assistant message accepted back from the client, in characters (spec §3.3, C-09). */
export const MAX_ASSISTANT_CHARS = 6000;

/** Most messages in one conversation, counted as the raw messages.length (D-S-03). */
export const MAX_MESSAGES = 20;

/** Output cap passed to every streamText call (D-S-03). */
export const MAX_OUTPUT_TOKENS = 1024;

/** streamText timeout until the first content chunk of the step (D-S-04). */
export const FIRST_CHUNK_TIMEOUT_MS = 20_000;

/** streamText timeout between content chunks (D-S-04). */
export const CHUNK_TIMEOUT_MS = 15_000;

/** Empty-state buttons; each sends immediately (D-S-02). */
export const SUGGESTED_PROMPTS = [
  "200-word story about a lighthouse keeper",
  "Explain how HTTPS works to a new developer",
  "5 interview questions for a senior frontend engineer",
  "Follow-up email after a job interview",
] as const;

/** Autoscroll keeps following while the view is at most this far from the bottom (D-S-08). */
export const SCROLL_THRESHOLD_PX = 80;

/** Delay before the mock model's first chunk: the TTFT calibration anchor (D-S-12). */
export const MOCK_FIRST_TOKEN_DELAY_MS = 600;
