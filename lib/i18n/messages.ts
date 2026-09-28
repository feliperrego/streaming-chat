import type { Locale } from "./locale";

type Prompts = readonly [string, string, string, string];

/** One locale's strings (delta spec §4.3). `{n}` marks where format() inserts a number. */
export type Messages = {
  empty: { title: string; tryIt: string; groupDemo: string; groupAbout: string; rateNote: string };
  /** Each button sends its text as the prompt (D-S-02). */
  prompts: { demo: Prompts; about: Prompts };
  header: { mockBadge: string; newChat: string; language: string };
  composer: {
    label: string;
    placeholder: string;
    capPlaceholder: string;
    send: string;
    stop: string;
  };
  list: {
    label: string;
    ttft: string;
    stopped: string;
    cutOff: string;
    regenerate: string;
    /** Ends with the middle dot; the component adds a space before Regenerate. */
    stoppedBefore: string;
  };
  chat: { jump: string; retry: string };
  errors: { generic: string; limit: string };
  status: { complete: string; stopped: string; failed: string };
  footer: { builtBy: string; source: string };
};

/**
 * Every visible and accessible interface string, in English and pt-BR (delta spec §4.3).
 * Pure and client-safe. lib/chat/config.ts re-exports the English demo prompts from here
 * (SUGGESTED_PROMPTS), so this module must not import config.ts.
 */
export const messages: Record<Locale, Messages> = {
  en: {
    empty: {
      title: "Watch an answer stream in",
      tryIt: "Try it: send a prompt → press Stop (or Esc) halfway → Regenerate",
      groupDemo: "Try streaming",
      groupAbout: "Ask about this project",
      rateNote: "{n} messages/hour per visitor; regenerations count",
    },
    prompts: {
      demo: [
        "200-word story about a lighthouse keeper",
        "Explain how HTTPS works to a new developer",
        "5 interview questions for a senior frontend engineer",
        "Follow-up email after a job interview",
      ],
      about: [
        "How was this chat built?",
        "What tech stack does this project use?",
        "What is this project for?",
        "Who is Felipe, and what roles is he looking for?",
      ],
    },
    header: { mockBadge: "Mock model", newChat: "New chat", language: "Language" },
    composer: {
      label: "Message",
      placeholder: "Send a message",
      capPlaceholder: "Conversation limit reached. Start a new chat.",
      send: "Send message",
      stop: "Stop generating",
    },
    list: {
      label: "Conversation",
      ttft: "First token in {n} ms",
      stopped: "Stopped",
      cutOff: "Cut at demo length limit",
      regenerate: "Regenerate",
      stoppedBefore: "Stopped before a response ·",
    },
    chat: { jump: "Jump to latest", retry: "Retry" },
    errors: {
      generic: "Couldn't get a response. Check your connection and try again.",
      limit: "Demo limit reached: {n} messages per hour. Try again later.",
    },
    status: {
      complete: "Response complete",
      stopped: "Response stopped",
      failed: "Response failed",
    },
    footer: { builtBy: "Built by", source: "Source on GitHub" },
  },
  "pt-BR": {
    empty: {
      title: "Veja a resposta chegar em tempo real",
      tryIt: "Experimente: envie um prompt → aperte Parar (ou Esc) no meio → Gerar novamente",
      groupDemo: "Experimente o streaming",
      groupAbout: "Pergunte sobre o projeto",
      rateNote: "{n} mensagens/hora por visitante; regenerações contam",
    },
    prompts: {
      demo: [
        "História de 200 palavras sobre um faroleiro",
        "Explique como o HTTPS funciona para quem está começando",
        "5 perguntas de entrevista para dev front-end sênior",
        "E-mail de follow-up depois de uma entrevista",
      ],
      about: [
        "Como este chat foi construído?",
        "Qual é a stack deste projeto?",
        "Qual é o propósito deste projeto?",
        "Quem é o Felipe e que vagas ele procura?",
      ],
    },
    header: { mockBadge: "Modelo simulado", newChat: "Nova conversa", language: "Idioma" },
    composer: {
      label: "Mensagem",
      placeholder: "Envie uma mensagem",
      capPlaceholder: "Limite da conversa atingido. Comece uma nova conversa.",
      send: "Enviar mensagem",
      stop: "Parar geração",
    },
    list: {
      label: "Conversa",
      ttft: "Primeiro token em {n} ms",
      stopped: "Interrompida",
      cutOff: "Cortada no limite de tamanho da demo",
      regenerate: "Gerar novamente",
      stoppedBefore: "Interrompida antes da resposta ·",
    },
    chat: { jump: "Ir para o fim", retry: "Tentar de novo" },
    errors: {
      generic: "Não foi possível obter uma resposta. Verifique sua conexão e tente de novo.",
      limit: "Limite da demo atingido: {n} mensagens por hora. Tente mais tarde.",
    },
    status: {
      complete: "Resposta concluída",
      stopped: "Resposta interrompida",
      failed: "Falha na resposta",
    },
    footer: { builtBy: "Feito por", source: "Código no GitHub" },
  },
};

/**
 * Fills `{name}` placeholders from `values`, in one pass; values go in verbatim.
 * Other text, including a placeholder with no value, is left as it is.
 */
export function format(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
