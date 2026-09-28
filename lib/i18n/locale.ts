/**
 * The interface language (delta spec §4.1). Pure and client-safe, so client components
 * and the chat route can both import it.
 */

export type Locale = "en" | "pt-BR";

export const DEFAULT_LOCALE: Locale = "en";

/** Holds a choice made with the language switch; a `?lang=` value alone is never stored (T-19). */
export const LOCALE_STORAGE_KEY = "streaming-chat:locale";

/** Exact match only, for the POST body's `locale` (delta spec §3.3, T-11). */
export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "pt-BR";
}

/** Reads a `lang` value (T-24): en, pt and pt-br in any case; anything else is null. */
export function parseLocaleParam(value: string | null): Locale | null {
  switch (value?.toLowerCase()) {
    case "en":
      return "en";
    case "pt":
    case "pt-br":
      return "pt-BR";
    default:
      return null;
  }
}

/**
 * The locale to show on load (delta spec §4.1): a valid `lang` parameter, then a valid
 * stored value, then English. `search` is location.search, with or without its leading
 * "?"; only the first `lang` parameter is read. The stored value is read with the same
 * rule as the parameter.
 */
export function resolveLocale({
  search,
  stored,
}: {
  search: string;
  stored: string | null;
}): Locale {
  return (
    parseLocaleParam(new URLSearchParams(search).get("lang")) ??
    parseLocaleParam(stored) ??
    DEFAULT_LOCALE
  );
}
