import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/locale";

// The labels stay untranslated (delta spec §4.3).
const OPTIONS: readonly { locale: Locale; label: string }[] = [
  { locale: "en", label: "EN" },
  { locale: "pt-BR", label: "PT" },
];

/** The EN/PT switch at the right end of the header (delta spec §4.1, T-21). */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div role="group" aria-label={t.header.language} className="flex shrink-0 gap-1">
      {OPTIONS.map((option) => {
        const selected = option.locale === locale;
        return (
          <Button
            key={option.locale}
            variant={selected ? "secondary" : "ghost"}
            aria-pressed={selected}
            className="pointer-coarse:h-11 pointer-coarse:min-w-11"
            onClick={() => setLocale(option.locale)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
