import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { getModel } from "@/lib/ai/model";
import {
  CHUNK_TIMEOUT_MS,
  FIRST_CHUNK_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  SYSTEM_INSTRUCTIONS,
} from "@/lib/chat/config";
import { toSafeErrorMessage } from "@/lib/chat/errors";
import { validateAndClean } from "@/lib/chat/validate";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Node.js runtime (the Next.js default; no `runtime` export). Vercel request
// cancellation needs it and `supportsCancellation` in vercel.json (spec §3.1).
export const maxDuration = 60;

function badRequest(text: string): Response {
  return new Response(text, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(req: Request): Promise<Response> {
  // 1. Rate limit, before reading the body.
  const limited = await rateLimit(req);
  if (!limited.ok) return rateLimitResponse(limited);

  // 2. Parse.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request: the body must be JSON.");
  }

  // 3. Validate and clean.
  const validated = await validateAndClean(body);
  if (!validated.ok) return badRequest(validated.text);

  // 4. Stream.
  const result = streamText({
    model: getModel(),
    instructions: SYSTEM_INSTRUCTIONS,
    messages: await convertToModelMessages(validated.messages),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    reasoning: "none",
    abortSignal: req.signal,
    timeout: { firstChunkMs: FIRST_CHUNK_TIMEOUT_MS, chunkMs: CHUNK_TIMEOUT_MS },
    // Suppresses streamText's own console.error(error) default: the error is already
    // logged once by toSafeErrorMessage in toUIMessageStream's onError below.
    onError: () => {},
  });

  // 5. Respond with the UI message stream as SSE.
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: toSafeErrorMessage,
      sendReasoning: false,
    }),
  });
}
