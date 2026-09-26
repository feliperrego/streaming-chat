import { ArrowUp, Square } from "lucide-react";
import { useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_USER_CHARS } from "@/lib/chat/config";
import { shouldSubmitOnKey } from "@/lib/chat/ui";

export const COMPOSER_PLACEHOLDER = "Send a message";
export const CAP_PLACEHOLDER = "Conversation limit reached. Start a new chat.";

type ComposerProps = {
  inputRef: Ref<HTMLTextAreaElement>;
  /** A request is in flight (submitted or streaming): the button is Stop. */
  busy: boolean;
  /** The conversation holds MAX_MESSAGES messages: the composer is disabled. */
  atCap: boolean;
  /** Returns true when the text was sent, so the composer clears it. */
  onSend: (text: string) => boolean;
  onStop: () => void;
};

/** Textarea plus one button that swaps Send and Stop (spec §2.2). */
export function Composer({ inputRef, busy, atCap, onSend, onStop }: ComposerProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (onSend(value)) setValue("");
  };

  return (
    <div className="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
        <Textarea
          ref={inputRef}
          aria-label="Message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            const submitKey = shouldSubmitOnKey({
              key: event.key,
              shiftKey: event.shiftKey,
              isComposing: event.nativeEvent.isComposing,
            });
            if (!submitKey) return;
            // Enter never inserts a newline; it sends only when the chat can take a request.
            event.preventDefault();
            submit();
          }}
          maxLength={MAX_USER_CHARS}
          rows={1}
          disabled={atCap}
          placeholder={atCap ? CAP_PLACEHOLDER : COMPOSER_PLACEHOLDER}
          className="max-h-40 min-h-11 min-w-0 resize-none"
        />
        {busy ? (
          <Button
            size="icon-lg"
            className="pointer-coarse:size-11"
            aria-label="Stop generating"
            onClick={(event) => {
              // The second click of a double-click on Send lands here once the button
              // has swapped; it must not stop the request the first click started.
              if (event.detail > 1) return;
              onStop();
            }}
          >
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button
            size="icon-lg"
            className="pointer-coarse:size-11"
            aria-label="Send message"
            disabled={value.trim() === "" || atCap}
            onClick={submit}
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  );
}
