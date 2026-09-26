/** The only error text the chat route ever sends to the browser (spec §3.8). */
export const SAFE_ERROR_MESSAGE = "The model could not finish this response. Please try again.";

/**
 * onError handler for toUIMessageStream: logs the raw error on the server and
 * returns a fixed string, so provider or Gateway details never reach the client.
 */
export function toSafeErrorMessage(error: unknown): string {
  console.error("[api/chat] Model stream failed:", error);
  return SAFE_ERROR_MESSAGE;
}
