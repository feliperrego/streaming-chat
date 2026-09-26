import type { ChatStatus, UIMessage } from "ai";
import { Button } from "@/components/ui/button";
import {
  hasVisibleText,
  isBusy,
  messageText,
  showTypingIndicator,
  type RegenerateSlot,
} from "@/lib/chat/ui";

/** What onFinish recorded for a message id (spec §3.4). */
export type MessageAnnotation = { stopped: boolean; cutOff: boolean };

type MessageListProps = {
  /** The element that grows while streaming; useStickToBottom observes it. */
  contentRef: (element: HTMLElement | null) => void;
  messages: UIMessage[];
  status: ChatStatus;
  annotations: ReadonlyMap<string, MessageAnnotation>;
  ttftById: ReadonlyMap<string, number>;
  /** Where the single Regenerate button goes: regenerateSlot() in lib/chat/ui.ts. */
  slot: RegenerateSlot;
  onRegenerate: () => void;
};

const REGENERATE_CLASS = "h-auto px-0 py-1 pointer-coarse:min-h-11";

/** The conversation (spec §2.2, §2.4): plain-text messages, captions and labels. */
export function MessageList({
  contentRef,
  messages,
  status,
  annotations,
  ttftById,
  slot,
  onRegenerate,
}: MessageListProps) {
  const lastId = messages.at(-1)?.id;

  return (
    <div
      ref={contentRef}
      role="log"
      aria-label="Conversation"
      aria-busy={isBusy(status)}
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6"
    >
      {messages.map((message) => {
        if (message.role === "user") {
          return (
            <div
              key={message.id}
              data-message-role="user"
              className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2 whitespace-pre-wrap wrap-anywhere"
            >
              {messageText(message)}
            </div>
          );
        }
        // An assistant message with no visible text (Stop before the first token) is not shown.
        if (message.role !== "assistant" || !hasVisibleText(message)) return null;

        const ttftMs = ttftById.get(message.id);
        const annotation = annotations.get(message.id);
        const showRegenerate = message.id === lastId && slot === "after-answer";
        const hasMeta =
          ttftMs !== undefined || annotation?.stopped || annotation?.cutOff || showRegenerate;

        return (
          <div
            key={message.id}
            data-message-role="assistant"
            data-ttft-ms={ttftMs}
            className="flex flex-col gap-2"
          >
            <div className="whitespace-pre-wrap wrap-anywhere">{messageText(message)}</div>
            {hasMeta && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {ttftMs !== undefined && <span>First token in {ttftMs} ms</span>}
                {annotation?.stopped && <span>Stopped</span>}
                {annotation?.cutOff && <span>Cut at demo length limit</span>}
                {showRegenerate && (
                  <Button variant="link" size="sm" className={REGENERATE_CLASS} onClick={onRegenerate}>
                    Regenerate
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {showTypingIndicator(messages, status) && (
        <div data-testid="typing-indicator" aria-hidden="true" className="flex h-6 items-center gap-1">
          <span className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce motion-safe:[animation-delay:-0.3s]" />
          <span className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce motion-safe:[animation-delay:-0.15s]" />
          <span className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce" />
        </div>
      )}

      {slot === "stopped-row" && (
        <div data-testid="stopped-row" className="text-sm text-muted-foreground">
          Stopped before a response ·{" "}
          <Button variant="link" size="sm" className={REGENERATE_CLASS} onClick={onRegenerate}>
            Regenerate
          </Button>
        </div>
      )}
    </div>
  );
}
