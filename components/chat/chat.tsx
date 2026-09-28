"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatHeader } from "@/components/chat/chat-header";
import { Composer } from "@/components/chat/composer";
import { EmptyState } from "@/components/chat/empty-state";
import { MessageList, type MessageAnnotation } from "@/components/chat/message-list";
import { useLocale } from "@/components/i18n/locale-provider";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { useTtft } from "@/hooks/use-ttft";
import { MAX_MESSAGES } from "@/lib/chat/config";
import {
  annotateFinish,
  describeChatError,
  hasVisibleText,
  isBusy,
  regenerateSlot,
  type ChatErrorKind,
} from "@/lib/chat/ui";
import { format } from "@/lib/i18n/messages";

type ChatProps = {
  modelLabel: string;
  isMock: boolean;
  /** VERCEL_GIT_COMMIT_SHA, or "local". */
  commit: string;
  rateLimitPerHour: number;
};

/**
 * Moves focus to the composer, except on touch devices, where focusing a
 * textarea opens the on-screen keyboard (spec §2.2, §2.5).
 */
function focusUnlessTouch(element: HTMLTextAreaElement | null): void {
  if (element === null || window.matchMedia("(pointer: coarse)").matches) return;
  element.focus();
}

/** The streaming chat (spec §3.4): owns useChat and every piece of chat-level state. */
export function Chat({ modelLabel, isMock, commit, rateLimitPerHour }: ChatProps) {
  const { locale, t } = useLocale();
  const [annotations, setAnnotations] = useState<ReadonlyMap<string, MessageAnnotation>>(
    () => new Map(),
  );
  // The stream ended with no abort, no error and no finish reason: a server timeout (spec §2.3).
  const [interrupted, setInterrupted] = useState(false);
  // The user pressed Stop or Esc during the last request (D-S-22).
  const [stoppedByUser, setStoppedByUser] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, status, error, sendMessage, regenerate, stop, setMessages, clearError } =
    useChat({
      onFinish: (event) => {
        const result = annotateFinish(event);
        setInterrupted(result.interrupted);
        const id = result.id;
        if (id !== null && (result.stopped || result.cutOff)) {
          setAnnotations((previous) =>
            new Map(previous).set(id, { stopped: result.stopped, cutOff: result.cutOff }),
          );
        }
      },
    });
  const ttft = useTtft(messages, status);
  const { scrollRef, contentRef, isFollowing, scrollToBottom } = useStickToBottom();
  // The hook takes the scroll container through a callback ref; Chat keeps its own handle
  // so that New chat can scroll back to the top (T-22).
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollElementRef.current = element;
      scrollRef(element);
    },
    [scrollRef],
  );

  const busy = isBusy(status);
  // Send, Enter, Regenerate and Retry act only when the chat is idle.
  const canRequest = status === "ready" || status === "error";
  const atCap = messages.length >= MAX_MESSAGES;
  const slot = regenerateSlot(messages, status, stoppedByUser);
  const errorKind: ChatErrorKind | null =
    status === "error" ? describeChatError(error) : interrupted ? "generic" : null;

  const send = (text: string): boolean => {
    if (!canRequest || atCap || text.trim() === "") return false;
    setStoppedByUser(false);
    setInterrupted(false);
    scrollToBottom();
    ttft.start(messages);
    // The route adds the interface language to the instructions (delta spec §3.3, T-11).
    void sendMessage({ text }, { body: { locale } });
    focusUnlessTouch(inputRef.current);
    return true;
  };

  // Regenerate and Retry: replaces a trailing assistant message, or re-sends a trailing user message.
  const regen = () => {
    if (!canRequest || messages.length === 0) return;
    setStoppedByUser(false);
    setInterrupted(false);
    scrollToBottom();
    ttft.start(messages);
    void regenerate({ body: { locale } });
    focusUnlessTouch(inputRef.current);
  };

  const handleStop = useCallback(() => {
    setStoppedByUser(true);
    void stop();
    focusUnlessTouch(inputRef.current);
  }, [stop]);

  const newChat = async () => {
    if (busy) await stop();
    setMessages([]);
    // setMessages leaves status and error alone; without this an old error banner would stay.
    clearError();
    setAnnotations(new Map());
    ttft.reset();
    setInterrupted(false);
    setStoppedByUser(false);
    // The empty state opens at its title, not at the old scroll position (T-22). The list
    // unmounts in the next commit, which disconnects the observers that pin to the bottom.
    scrollElementRef.current?.scrollTo({ top: 0, behavior: "instant" });
    focusUnlessTouch(inputRef.current);
  };

  // Esc stops from anywhere on the page, but only while busy (D-S-06).
  useEffect(() => {
    if (!busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) handleStop();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, handleStop]);

  // Focus the composer on load, except on touch devices (spec §2.5).
  useEffect(() => {
    focusUnlessTouch(inputRef.current);
  }, []);

  // Polite announcements for screen readers; tokens are never read aloud (spec §2.4).
  const lastMessage = messages.at(-1);
  const announcement = busy
    ? ""
    : errorKind !== null
      ? t.status.failed
      : stoppedByUser
        ? t.status.stopped
        : lastMessage?.role === "assistant" && hasVisibleText(lastMessage)
          ? t.status.complete
          : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader
        modelLabel={modelLabel}
        isMock={isMock}
        commit={commit}
        onNewChat={() => void newChat()}
      />

      <main className="relative min-h-0 flex-1">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overscroll-contain">
          {messages.length === 0 ? (
            <EmptyState rateLimitPerHour={rateLimitPerHour} onPrompt={send} />
          ) : (
            <MessageList
              contentRef={contentRef}
              messages={messages}
              status={status}
              annotations={annotations}
              ttftById={ttft.ttftById}
              slot={slot}
              onRegenerate={regen}
            />
          )}
        </div>
        {messages.length > 0 && !isFollowing && (
          <Button
            variant="outline"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm pointer-coarse:h-11"
            onClick={() => scrollToBottom({ smooth: true })}
          >
            <ArrowDown />
            {t.chat.jump}
          </Button>
        )}
      </main>

      {errorKind !== null && (
        <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pb-2">
          {errorKind === "limit" ? (
            // Demo limit: the client's text in the selected language, not the 429 body; no
            // Retry (delta spec §4.4).
            <Alert variant="destructive">
              <AlertDescription>{format(t.errors.limit, { n: rateLimitPerHour })}</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>{t.errors.generic}</AlertDescription>
              <AlertAction>
                <Button variant="outline" size="sm" className="pointer-coarse:h-11" onClick={regen}>
                  {t.chat.retry}
                </Button>
              </AlertAction>
            </Alert>
          )}
        </div>
      )}

      <Composer
        inputRef={inputRef}
        busy={busy}
        atCap={atCap}
        onSend={send}
        onStop={handleStop}
      />

      {/* A language switch remounts the region instead of changing its text, which a screen
          reader would announce as a new status. */}
      <div key={locale} role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
