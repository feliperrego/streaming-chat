import { useId } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/i18n/messages";

type EmptyStateProps = {
  /** RATE_LIMIT_PER_HOUR from lib/rate-limit.ts, so the UI never states a wrong limit. */
  rateLimitPerHour: number;
  /** Sends the prompt immediately. */
  onPrompt: (text: string) => void;
};

type PromptGroupProps = {
  heading: string;
  prompts: readonly string[];
  onPrompt: (text: string) => void;
};

/** A labelled group of prompt buttons: one column below sm, two from sm up (delta spec §5). */
function PromptGroup({ heading, prompts, onPrompt }: PromptGroupProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-medium">
        {heading}
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {prompts.map((prompt) => (
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
    </section>
  );
}

/**
 * What a new chat shows (spec §2.1, D-S-02), in the selected language: the demo prompts,
 * then the about prompts (delta spec §5, T-07). A button sends the text it shows.
 */
export function EmptyState({ rateLimitPerHour, onPrompt }: EmptyStateProps) {
  const { t } = useLocale();

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-4 py-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t.empty.title}</h2>
        <p className="text-muted-foreground">{t.empty.tryIt}</p>
      </div>
      <PromptGroup heading={t.empty.groupDemo} prompts={t.prompts.demo} onPrompt={onPrompt} />
      <PromptGroup heading={t.empty.groupAbout} prompts={t.prompts.about} onPrompt={onPrompt} />
      <p className="text-sm text-muted-foreground">
        {format(t.empty.rateNote, { n: rateLimitPerHour })}
      </p>
    </div>
  );
}
