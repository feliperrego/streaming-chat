"use client";

import { useLocale } from "@/components/i18n/locale-provider";

// Each project generated from the template sets its own repo URL here (spec §9).
const REPO_URL = "https://github.com/feliperrego/streaming-chat";

export function Footer() {
  const { t } = useLocale();

  return (
    <footer className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
      {t.footer.builtBy}{" "}
      <a
        href="https://feliperrego.com"
        className="underline underline-offset-4 pointer-coarse:inline-block pointer-coarse:py-3"
      >
        Felipe Rêgo
      </a>
      {" · "}
      <a
        href={REPO_URL}
        className="underline underline-offset-4 pointer-coarse:inline-block pointer-coarse:py-3"
      >
        {t.footer.source}
      </a>
    </footer>
  );
}
