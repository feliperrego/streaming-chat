import type { ChatStatus, UIMessage } from "ai";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createTtftTracker } from "@/lib/chat/ttft";

export type UseTtft = {
  /** Call just before sendMessage() or regenerate(), with the current messages. */
  start: (messages: UIMessage[]) => void;
  /** New chat: forgets the tracker state and every recorded value. */
  reset: () => void;
  /** Time to first token per assistant message id, in ms. */
  ttftById: ReadonlyMap<string, number>;
};

const EMPTY: ReadonlyMap<string, number> = new Map();

/**
 * The tracker plus the recorded values, as an external store. A sample exists only
 * once a commit has happened (it reads the clock), so it cannot be derived during
 * render; publishing it through useSyncExternalStore avoids setState in an effect.
 */
function createTtftStore() {
  const tracker = createTtftTracker();
  let ttftById = EMPTY;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => ttftById,
    getServerSnapshot: () => EMPTY,
    start: (messages: UIMessage[]) => tracker.start(messages),
    observe: (input: { messages: UIMessage[]; status: ChatStatus }) => {
      const sample = tracker.observe(input);
      if (sample === null) return;
      ttftById = new Map(ttftById).set(sample.id, sample.ttftMs);
      emit();
    },
    reset: () => {
      tracker.reset();
      if (ttftById === EMPTY) return;
      ttftById = EMPTY;
      emit();
    },
  };
}

/**
 * Binds the TTFT tracker (spec §3.6) to useChat's `messages` and `status`: it observes
 * every commit that changes either one. useChat publishes both through
 * useSyncExternalStore (SyncLane), and React 19 flushes the passive effects of a
 * SyncLane commit synchronously at the end of that commit, so the clock is read
 * before the browser paints.
 */
export function useTtft(messages: UIMessage[], status: ChatStatus): UseTtft {
  const [store] = useState(createTtftStore);
  const ttftById = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    store.observe({ messages, status });
  }, [store, messages, status]);

  return { start: store.start, reset: store.reset, ttftById };
}
