/**
 * Strict parser for the UI message stream wire format that
 * createUIMessageStreamResponse writes: one `data: <JSON>\n\n` frame per chunk,
 * then `data: [DONE]\n\n` when the stream closes. Throws on anything else, so
 * a format change fails the route tests loudly.
 */
export type SseChunk = { type: string } & Record<string, unknown>;

export type ParsedSse = { chunks: SseChunk[]; done: boolean };

export function parseSse(raw: string): ParsedSse {
  const frames = raw.split("\n\n");
  const rest = frames.pop();
  if (rest !== "") {
    throw new Error(`SSE body does not end with a blank line: ${JSON.stringify(rest)}`);
  }

  const chunks: SseChunk[] = [];
  let done = false;
  for (const frame of frames) {
    if (!frame.startsWith("data: ")) {
      throw new Error(`Unexpected SSE frame: ${JSON.stringify(frame)}`);
    }
    if (done) throw new Error("SSE frame after [DONE]");
    const data = frame.slice("data: ".length);
    if (data === "[DONE]") {
      done = true;
      continue;
    }
    chunks.push(JSON.parse(data) as SseChunk);
  }
  return { chunks, done };
}

export function chunkTypes(parsed: ParsedSse): string[] {
  return parsed.chunks.map((chunk) => chunk.type);
}

export function textDeltas(parsed: ParsedSse): string[] {
  return parsed.chunks
    .filter((chunk) => chunk.type === "text-delta")
    .map((chunk) => String(chunk.delta));
}
