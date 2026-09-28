import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { getModel, MODEL_LABEL } from "@/lib/ai/model";
import { CHUNK_TIMEOUT_MS, FIRST_CHUNK_TIMEOUT_MS, MAX_OUTPUT_TOKENS } from "@/lib/chat/config";
import { toSafeErrorMessage } from "@/lib/chat/errors";
import { buildSystemInstructions } from "@/lib/chat/profile";
import { validateAndClean } from "@/lib/chat/validate";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { RATE_LIMIT_PER_HOUR, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Node.js runtime (the Next.js default; no `runtime` export). Vercel request
// cancellation needs it and `supportsCancellation` in vercel.json (spec §3.1).
export const maxDuration = 60;

function badRequest(text: string): Response {
  return new Response(text, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function unsupportedMediaType(text: string): Response {
  return new Response(text, {
    status: 415,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** The Content-Type media type, lower-cased and stripped of parameters (e.g. `; charset=utf-8`). */
function mediaType(req: Request): string {
  return (req.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
}

/**
 * The interface language a client may send in the body (delta spec §3.3, T-11): exactly "en"
 * or "pt-BR". Any other value, or none, is ignored and never causes a 400, so older clients
 * keep working.
 */
function requestLocale(body: unknown): Locale | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const { locale } = body as { locale?: unknown };
  return isLocale(locale) ? locale : undefined;
}

export async function POST(req: Request): Promise<Response> {
  // 1. Rate limit, before reading the body.
  const limited = await rateLimit(req);
  if (!limited.ok) return rateLimitResponse(limited);

  // 2. Reject non-JSON content types before parsing. A JSON content type forces a
  // CORS preflight, so this blocks cross-site "simple requests" (e.g. a text/plain
  // form post) from spending the rate-limit budget.
  if (mediaType(req) !== "application/json") {
    return unsupportedMediaType("Invalid request: Content-Type must be application/json.");
  }

  // 3. Parse.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request: the body must be JSON.");
  }

  // 4. Validate and clean.
  const validated = await validateAndClean(body);
  if (!validated.ok) return badRequest(validated.text);
  const locale = requestLocale(body);

  // 5. Stream.
  const result = streamText({
    model: getModel(),
    instructions: buildSystemInstructions({
      model: MODEL_LABEL,
      ratePerHour: RATE_LIMIT_PER_HOUR,
      locale,
    }),
    messages: await convertToModelMessages(validated.messages),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoning: "none",
    abortSignal: req.signal,
    timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS, chunkMs: CHUNK_TIMEOUT_MS },
    // Suppresses streamText's own console.error(error) default: the error is already
    // logged once by toSafeErrorMessage in toUIMessageStream's onError below.
    onError: () => {},
  });

  // 6. Respond with the UI message stream as SSE.
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: toSafeErrorMessage,
      sendReasoning: false,
    }),
  });
}
