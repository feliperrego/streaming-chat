import { Plus } from "lucide-react";
import { LanguageSwitch } from "@/components/chat/language-switch";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";

type ChatHeaderProps = {
  modelLabel: string;
  isMock: boolean;
  commit: string;
  onNewChat: () => void;
};

/**
 * The header carries the template attribute contract (template spec §5.6) that
 * the measurement script reads: data-model, data-commit, and data-mock only in mock mode.
 */
export function ChatHeader({ modelLabel, isMock, commit, onNewChat }: ChatHeaderProps) {
  const { t } = useLocale();

  return (
    <header
      className="flex shrink-0 items-center gap-2 border-b px-4 py-2"
      data-model={modelLabel}
      data-commit={commit}
      // Present only in mock mode. Never pass a boolean: React renders false as "false".
      data-mock={isMock ? "" : undefined}
    >
      <h1 className="sr-only">Streaming Chat</h1>
      <span className="min-w-0 truncate font-medium">{modelLabel}</span>
      {isMock && (
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
          {t.header.mockBadge}
        </span>
      )}
      <Button
        variant="outline"
        className="ml-auto pointer-coarse:h-11 max-sm:aspect-square max-sm:px-0"
        onClick={onNewChat}
      >
        <Plus />
        {/* Icon only below sm, so the header fits at 375 px; the accessible name stays (T-21). */}
        <span className="max-sm:sr-only">{t.header.newChat}</span>
      </Button>
      <LanguageSwitch />
    </header>
  );
}
