import type { ChatStatus, UIMessage } from "ai";
import { isBusy, messageText } from "./ui";

export type TtftSample = { id: string; ttftMs: number };

export type TtftTracker = {
  /** Call just before sendMessage() or regenerate(): stores t0 and the ids that already exist. */
  start(messages: UIMessage[]): void;
  /** Call on every commit. Returns a sample the first time a new assistant message holds a character. */
  observe(input: { messages: UIMessage[]; status: ChatStatus }): TtftSample | null;
  /** Forgets t0, the start ids and every sampled id (New chat). */
  reset(): void;
};

/**
 * Time to first token, as defined in spec §5.1: from `start()` to the first observed
 * commit in which an assistant message whose id was absent at `start()` holds at least
 * one text character. t0 is cleared only on a busy -> ready/error edge, because a commit
 * can land after `start()` while status is still `ready` (sendMessage awaits before it
 * pushes the user message).
 */
export function createTtftTracker(now: () => number = () => performance.now()): TtftTracker {
  let t0: number | null = null;
  let idsAtStart = new Set<string>();
  const sampledIds = new Set<string>();
  let wasBusy = false;

  return {
    start(messages) {
      t0 = now();
      idsAtStart = new Set(messages.map((message) => message.id));
    },

    observe({ messages, status }) {
      let sample: TtftSample | null = null;

      if (t0 !== null) {
        const first = messages.find(
          (message) =>
            message.role === "assistant" &&
            !idsAtStart.has(message.id) &&
            !sampledIds.has(message.id) &&
            messageText(message).length >= 1,
        );
        if (first !== undefined) {
          sampledIds.add(first.id);
          sample = { id: first.id, ttftMs: Math.round(now() - t0) };
        }
      }

      // Sample first, then reset: one commit can carry both the text and the final status.
      const busy = isBusy(status);
      if (wasBusy && !busy) t0 = null;
      wasBusy = busy;

      return sample;
    },

    reset() {
      t0 = null;
      idsAtStart = new Set();
      sampledIds.clear();
      wasBusy = false;
    },
  };
}
