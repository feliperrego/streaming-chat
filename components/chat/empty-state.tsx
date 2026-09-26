import { Button } from "@/components/ui/button";
import { SUGGESTED_PROMPTS } from "@/lib/chat/config";

type EmptyStateProps = {
  /** RATE_LIMIT_PER_HOUR from lib/rate-limit.ts, so the UI never states a wrong limit. */
  rateLimitPerHour: number;
  /** Sends the prompt immediately. */
  onPrompt: (text: string) => void;
};

/** What a new chat shows (spec §2.1, D-S-02). */
export function EmptyState({ rateLimitPerHour, onPrompt }: EmptyStateProps) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-4 py-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Watch an answer stream in</h2>
        <p className="text-muted-foreground">
          Try it: send a prompt → press Stop (or Esc) halfway → Regenerate
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <Button
            key={prompt}
            variant="outline"
            className="h-auto min-h-11 justify-start px-3 py-2 text-left whitespace-normal"
            onClick={() => onPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {rateLimitPerHour} messages/hour per visitor; regenerations count
      </p>
    </div>
  );
}
