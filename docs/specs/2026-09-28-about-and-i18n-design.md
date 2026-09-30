# Streaming Chat — "About this project" prompts and EN/PT interface (design)

- **Status:** approved 2026-09-28. Draft v1's T-01..T-10 were approved first. An independent review then found gaps: the fixes that only clarify were applied directly, and the ones that changed an approved item or added scope became T-11..T-27, approved "todas ok" the same day.
- **Date:** 2026-09-28.
- **Author:** Felipe Rêgo (design drafted with Claude).
- **Base spec:** `docs/specs/2026-09-25-streaming-chat-design.md`, cited below as "base §x". Everything the base spec says still holds unless this document changes it. Base §14 A-21 lists these changes (§8 step 0).

## How to read this document

| Tag | Meaning |
|---|---|
| `[F]` | Fact, with its source. |
| `[D]` | Decision taken by Felipe, with a reference. |
| `[P]` | Proposal, not yet confirmed. None is open; §10 records the answers. |

Decision references:

- **D-chat-1:** the portfolio conversation of 2026-09-24/25 (the project list, its numbering and "everything public in English").
- **D-chat-2:** the design conversation of 2026-09-28. Felipe asked for two things:
  - prompts that let a recruiter learn about the project and about him;
  - an interface language switch, English by default, plus pt-BR.
- **D-chat-2 answers** (all 2026-09-28):
  - Facts come from a fixed profile placed in the system instructions, not from RAG and not from the model's own knowledge.
  - The empty state shows two prompt groups: the current demo prompts and new "about" prompts.
  - The model answers in the language of the user's message, and in the interface language only when that is unclear.
  - Section 1 (approach: in-repo dictionary, client-side locale, no new dependency) was approved.
  - Section 2 (content) was approved "todas ok exceto L-04: (a)":
    - L-01: the most recent employer is unnamed ("a fintech (payroll loans)");
    - L-02: earlier employers are named;
    - L-03: English is shown as intermediate;
    - L-04 (a): the project was built with AI coding agents (Claude Code) under Felipe's spec and review;
    - L-05: certificates are listed without credential ids;
    - L-06: the profile carries no TTFT number;
    - L-07: the 8 prompt texts and both group names.
  - Section 3 was approved: unit tests (dictionary, locale resolution, profile guard, rules); e2e tests with English kept, plus Portuguese and mobile tests; one manual language check in production; re-measurement on a different day, keeping both JSON files; this delta spec plus a base §14 amendment; a plan; subagent execution; merge and push with OK; a phone check. The measurement keeps rotating the 4 demo prompts.
  - T-01..T-10 of draft v1 were approved "todas ok". T-03, T-06, T-08 and T-10 were then replaced by T-19, T-11, T-20 and T-27.
  - T-11..T-27, from the review, were approved "todas ok".
- **Felipe's profile rules** (2026-09-28): he looks for front-end, full-stack or AI roles, remote or hybrid in Fortaleza-CE. The profile shows LinkedIn and GitHub as contacts. It never mentions salary expectations or his current employer. The facts come from his CV, "Felipe Rêgo Currículo (PT).pdf".

## 1. Purpose and success criteria

**Purpose.** A recruiter who opens the demo can do two things:
- learn how the project was built, what it uses and why it exists, and who Felipe is and what roles he wants, by clicking a prompt;
- read the whole interface in Portuguese or English.

**Success criteria** [D: T-27]:

1. On a fresh visit the empty state shows two labelled groups: 4 demo prompts and 4 "about" prompts. The text is English.
2. Answers about the project and about Felipe come only from the profile (§3):
   - 2a. The instructions carry the scope and privacy rules (§3.3). The §3.4 unit test checks this.
   - 2b. In production the model follows them: an uncovered question gets "I don't know" plus a pointer to LinkedIn, and no answer states a salary, the employer's name or a contact other than LinkedIn and GitHub. The manual check in §6 covers this.
3. An EN/PT switch in the header changes every visible and accessible string (§4.3), including the 8 prompts. It also sets `<html lang>`. A choice made with the switch survives a reload. `?lang=pt-BR` opens the page in Portuguese.
4. The model answers in the language of the user's message, and in the interface language when that is unclear [D-chat-2].
5. All existing tests keep passing, and the new behaviour is covered by tests that cost nothing (§6).
6. The README's time-to-first-token number is measured again on the new build (§7), and never typed by hand.

**Non-goals:**

- **Translating the README, the spec, commits or code comments.** They stay English (D-chat-1).
- **Server-side locale routing** (`/pt-BR/...`) **and browser-language detection.** English is the default [D-chat-2: Felipe asked for English by default]. Trigger for detection: T-26.
- **RAG, citations, or reading documents at runtime.** That is the next portfolio project [D-chat-1 list; the approved profile says "Next up: RAG with citations"].

## 2. Scope of change against the base spec

| Base item | Change | Tag |
|---|---|---|
| D-chat-1 "Everything in English" (the UI part) | The UI gets pt-BR as an option. The README, docs and commits stay English. | [D-chat-2] |
| Template D-sec1 "no i18n" | Waived for this project only. The template itself does not change. Superseded 2026-09-30 by X-01: the template now carries the shell and i18n, at `d333861`; this repo keeps its own copy. | [D-chat-2; D: X-01 Q5, 2026-09-29] |
| D-S-02 empty state (4 prompts) | Two groups of 4: the original 4 under "Try streaming", plus 4 "about" prompts. | [D-chat-2] |
| D-S-05 limit banner "shows the server's text" | The client shows the limit text in the selected language. The 429 body stays English, as the API contract. | [D: T-02] |
| D-S-01 system instructions | They gain the profile and new rules (§3). Plain text and 150–250 words are unchanged. | [D-chat-2] |
| Base §3.1 request body | The client also sends `locale`; the route accepts it as optional (§3.3). | [D: T-11] |
| Base §5.2 measurement protocol | Unchanged. It keeps rotating the 4 English "Try streaming" prompts. | [D-chat-2, section 3] |

## 3. The profile and the instruction rules

### 3.1 Where it lives

- `lib/chat/profile.ts` holds the profile and exports `buildSystemInstructions({ model, ratePerHour, locale })`. The module is pure, with no server-only imports. It joins, in this order: the existing rules (today's `SYSTEM_INSTRUCTIONS` in `lib/chat/config.ts`), the §3.3 rules, the §3.2 profile and, when `locale` is valid, one interface-language line (§3.3).
- `app/api/chat/route.ts` calls it for each request and passes the result as `instructions`. `config.ts` stays client-safe.
- [D: T-15] The model id, the hourly limit and the 1024-token cap in the profile are filled from `MODEL_LABEL`, `RATE_LIMIT_PER_HOUR` and `MAX_OUTPUT_TOKENS`, so the profile cannot state a value the header and the rate note contradict.
- The profile is English only; the model translates when it answers in Portuguese, so two copies cannot drift apart [D: T-05].

### 3.2 Content

This text is approved (D-chat-2, section 2, with L-04 answered (a)), with T-12 and T-13 applied. It goes in verbatim, byte for byte: the line breaks and the two-space continuation indents are part of the text. Under T-15 the model id, the hourly limit and the token cap are filled from code; the text below is the rendering with today's values.

```text
ABOUT THIS PROJECT
- Streaming Chat is project #1 of Felipe Rêgo's AI portfolio: small projects, each with a
  live demo and one measured number. Next up: RAG with citations, evals, agents, MCP.
- Purpose: show a hand-built streaming chat UI — answers stream token by token, Stop (or Esc)
  ends the stream, Regenerate retries, and each answer shows its time to first token (TTFT).
- Stack: Next.js 16 (App Router), React 19, TypeScript, Vercel AI SDK 7, Vercel AI Gateway
  (model: openai/gpt-6-luna), shadcn/ui on Base UI, Tailwind CSS v4, Upstash Redis (20
  messages/hour per visitor), Vitest, Playwright, GitHub Actions, Vercel.
- How it was built: by Felipe with AI coding agents (Claude Code) working under his spec and
  review — spec first, with every decision recorded and approved by him; a throwaway prototype
  to prove the code; then task-by-task implementation, each task checked by an independent AI
  code review. Unit, route and end-to-end tests run in CI with a mock model — zero cost, no
  secrets.
- The headline number (median TTFT) is measured in a real browser against the live demo;
  a script prints the README lines, so the number is never typed by hand.
- An honest finding: Stop closes the stream end to end, but the AI Gateway still finishes
  and bills the provider's generation, so cost is bounded by a 1024-token cap instead.

ABOUT FELIPE
- Felipe Rêgo, front-end developer, in web development since 2010, building web and mobile
  products with React, React Native, Next.js and TypeScript, plus back-end work in Node.js
  and Python. Based in Fortaleza, Brazil.
- Looking for: front-end, full-stack or AI engineering roles; remote, or hybrid in Fortaleza.
- Most recent role (2022–2026): front-end at a fintech (payroll loans), shipping customer
  flows from product refinement to the App Store and Google Play, and creating a component
  library adopted by other squads.
- Earlier: onebrain (2021–22), Allya (2019–21, corporate benefits platform, 15+ features),
  Joyjet (2016–18, full-stack, Node.js REST APIs, React Native apps), Kabbee (2015–16,
  remote for a London company, fleet monitoring dashboards), web development since 2010
  (Python/Django, PHP).
- Education: Systems Analysis and Development, Estácio (2010–2013).
- Recent certificates (2026): Secure Software Design (University of Colorado, Coursera),
  Design Patterns (Vinicius Vivan), Google AI Essentials.
- Languages: Portuguese (native), English (intermediate).
- Contact: linkedin.com/in/feliperrego · github.com/feliperrego
```

### 3.3 New instruction rules

The rules' substance is [D-chat-2]; this wording is [D: T-14]:

1. **Scope.** Answer questions about this project or about Felipe only from the profile below. If the profile does not cover the question, say you don't know and suggest contacting Felipe on LinkedIn.
2. **Privacy.** Never state or guess Felipe's salary expectations, the name of his current or most recent employer, or any contact detail other than the LinkedIn and GitHub addresses in the profile (no e-mail, phone or address). If asked, say he prefers to discuss that directly on LinkedIn.
3. **Language.** Answer in the language of the user's latest message. If that is unclear, answer in the interface language stated at the end of these instructions, or in English if none is stated.
4. **Everything else.** Other questions (the demo prompts, general topics) are answered as before.
5. **Unchanged.** The existing rules still apply to every answer, including answers about the project and Felipe: plain text and 150–250 words (D-S-01). The profile's dashes are layout only.

In the prompt the rules are plain text: the bold markers above and the "(D-S-01)" citation are spec formatting and are left out [F: plan 2026-09-28, Task 2].

**The interface language** [D: T-11]. Rule 3's fallback needs the model to know the interface language, and today it does not: the route passes a constant, and the default transport posts only `{ id, messages, trigger }` [F: code, 2026-09-28].

- The client sends it with every request: `sendMessage({ text }, { body: { locale } })` and `regenerate({ body: { locale } })` [F: `ChatRequestOptions.body`, ai@7.0.114 `dist/index.d.ts`]. Retry and Regenerate share `regen()`, so both carry it.
- The route reads `body.locale` and accepts exactly `"en"` or `"pt-BR"`. For those it appends `Interface language: English.` or `Interface language: Portuguese (Brazil).` Any other value, or none, adds nothing and never causes a 400, so older clients keep working.
- `validateAndClean` does not change: it already reads only `body.messages` [F: `lib/chat/validate.ts`].
- The measurement drives the UI in English, so it sends `"en"`.

### 3.4 Guard rails verified by tests (§6) [D: T-16]

- `lib/chat/profile.test.ts` holds its own copy of the full expected instructions, rendered with `{ model: "openai/gpt-6-luna", ratePerHour: 20 }` and no locale, and asserts exact equality (`toBe`). It never reads this spec. Any edit fails until the new text is reviewed. This exact match is what keeps the employer out: no employer name is ever written in the repo, not even in a test.
- The instructions match none of these generic patterns:
  - an e-mail address (`/[^\s@]+@[^\s@]+\.[^\s@]+/`);
  - a phone number (8 or more digits separated only by spaces, dots, hyphens or parentheses);
  - a millisecond figure (`/\d+\s?ms\b/`, L-06).
- No test, fixture or comment in this public repo names Felipe's current or most recent employer or spells out his e-mail address.

## 4. The interface language

### 4.1 Approach

An in-repo dictionary and client-side locale state, with no new dependency [D-chat-2, section 1]:

- **`lib/i18n/messages.ts`.** Holds `messages.en` and `messages["pt-BR"]` with the same typed shape; the TypeScript compiler rejects a missing key. Strings that need a number use `{n}` placeholders, filled by a tiny `format(text, values)` helper.
- **`lib/i18n/locale.ts`** (pure) exports:
  - `type Locale = "en" | "pt-BR"`, `DEFAULT_LOCALE = "en"` and `LOCALE_STORAGE_KEY = "streaming-chat:locale"`;
  - `resolveLocale({ search, stored }: { search: string; stored: string | null }): Locale`. `search` is `location.search`; its leading `?` is optional. The first `lang` parameter wins. Accepted values are in T-24. The priority is a valid `lang`, then a valid `stored`, then `"en"`.
- **`components/i18n/locale-provider.tsx`** (`"use client"`):
  - The locale lives in a small external store read with `useSyncExternalStore`, the pattern of `hooks/use-ttft.ts` (A-12). `getServerSnapshot` returns `"en"`, matching the static prerender. `getSnapshot` resolves the locale once, from `location.search` and `localStorage` (inside try/catch), then returns the cached value.
  - An explicit choice always wins: the one-time resolution runs only while no locale is set, so a click that lands before it is never overwritten.
  - `setLocale` sets the value, writes `localStorage` (try/catch), removes `lang` from the URL (T-19) and notifies subscribers. The URL is changed with `window.history.replaceState(null, "", url)`, the native History API call of the Next.js docs. With `null`, Next keeps its own history state and moves its router to the new URL, with no request and no reload. Passing `history.state` skips that sync, and a later router update puts `?lang=` back [F: prototype, 2026-09-28; e2e test "5. removing lang keeps the page…"].
  - An effect only writes `document.documentElement.lang`. Nothing calls setState inside an effect: `react-hooks/set-state-in-effect` is an error in CI's `pnpm lint` [F: eslint-config-next 16.3.6 with react-hooks 7.1.1, checked 2026-09-28].
  - Exposes `useLocale(): { locale, setLocale, t }`, where `t` is the current dictionary.
- **`components/chat/language-switch.tsx`** [D: T-21]. Two buttons in a `role="group"` labelled `t.header.language`. Their accessible names are exactly `EN` and `PT`; tests locate them with `exact: true`. The selected one has `aria-pressed="true"`. 44 px tall on coarse pointers (base §2.5). It sits at the right end of the header, after New chat.
- **Mounting.** `components/footer.tsx` gains `"use client"` and reads `t.footer.*`. `app/page.tsx` stays a server component and wraps its existing `h-dvh` column (Chat and Footer) in `<LocaleProvider>`. `app/layout.tsx` does not change.
- **Chat.** `components/chat/chat.tsx` reads `locale` from `useLocale()` and sends it with each request (T-11).

### 4.2 Rendering

The page stays statically prerendered in English [F: `next build` lists `○ /`; plan 2026-09-26, final check]. The locale is read on the client from `location.search`; nothing reads it through `searchParams`, cookies or `useSearchParams`. §6 checks both the build output and the served HTML.

A visitor whose locale resolves to pt-BR sees English until hydration, then Portuguese. This brief flash is accepted: SEO and metadata stay English, and no server work per request is added [D: T-04]. Trigger to revisit: T-26.

`app/layout.tsx` keeps `<html lang="en">` and English metadata; the provider updates `lang` on the client [D: T-04].

### 4.3 String inventory and translations

"Every visible and accessible string" means this list, taken from the code on 2026-09-28 [F]. The lint rule and the Portuguese e2e sweep in §6 enforce it (T-18).

- The English values of existing keys are the current ones and stay verbatim.
- The new English values `empty.groupDemo`, `empty.groupAbout` and `prompts.about` are approved [D-chat-2, L-07].
- The new `header.language` "Language" is [D: T-21].
- The pt-BR values are approved [D: T-01].

| Key | English | pt-BR |
|---|---|---|
| `empty.title` | Watch an answer stream in | Veja a resposta chegar em tempo real |
| `empty.tryIt` | Try it: send a prompt → press Stop (or Esc) halfway → Regenerate | Experimente: envie um prompt → aperte Parar (ou Esc) no meio → Gerar novamente |
| `empty.groupDemo` | Try streaming | Experimente o streaming |
| `empty.groupAbout` | Ask about this project | Pergunte sobre o projeto |
| `empty.rateNote` | {n} messages/hour per visitor; regenerations count | {n} mensagens/hora por visitante; regenerações contam |
| `prompts.demo[0]` | 200-word story about a lighthouse keeper | História de 200 palavras sobre um faroleiro |
| `prompts.demo[1]` | Explain how HTTPS works to a new developer | Explique como o HTTPS funciona para quem está começando |
| `prompts.demo[2]` | 5 interview questions for a senior frontend engineer | 5 perguntas de entrevista para dev front-end sênior |
| `prompts.demo[3]` | Follow-up email after a job interview | E-mail de follow-up depois de uma entrevista |
| `prompts.about[0]` | How was this chat built? | Como este chat foi construído? |
| `prompts.about[1]` | What tech stack does this project use? | Qual é a stack deste projeto? |
| `prompts.about[2]` | What is this project for? | Qual é o propósito deste projeto? |
| `prompts.about[3]` | Who is Felipe, and what roles is he looking for? | Quem é o Felipe e que vagas ele procura? |
| `header.mockBadge` | Mock model | Modelo simulado |
| `header.newChat` | New chat | Nova conversa |
| `header.language` | Language | Idioma |
| `composer.label` | Message | Mensagem |
| `composer.placeholder` | Send a message | Envie uma mensagem |
| `composer.capPlaceholder` | Conversation limit reached. Start a new chat. | Limite da conversa atingido. Comece uma nova conversa. |
| `composer.send` | Send message | Enviar mensagem |
| `composer.stop` | Stop generating | Parar geração |
| `list.label` | Conversation | Conversa |
| `list.ttft` | First token in {n} ms | Primeiro token em {n} ms |
| `list.stopped` | Stopped | Interrompida |
| `list.cutOff` | Cut at demo length limit | Cortada no limite de tamanho da demo |
| `list.regenerate` | Regenerate | Gerar novamente |
| `list.stoppedBefore` | Stopped before a response · | Interrompida antes da resposta · |
| `chat.jump` | Jump to latest | Ir para o fim |
| `chat.retry` | Retry | Tentar de novo |
| `errors.generic` | Couldn't get a response. Check your connection and try again. | Não foi possível obter uma resposta. Verifique sua conexão e tente de novo. |
| `errors.limit` | Demo limit reached: {n} messages per hour. Try again later. | Limite da demo atingido: {n} mensagens por hora. Tente mais tarde. |
| `status.complete` | Response complete | Resposta concluída |
| `status.stopped` | Response stopped | Resposta interrompida |
| `status.failed` | Response failed | Falha na resposta |
| `footer.builtBy` | Built by | Feito por |
| `footer.source` | Source on GitHub | Código no GitHub |

`list.stoppedBefore` ends with the middle dot, which is part of the string; the component adds a space before Regenerate.

These stay untranslated: the product name "Streaming Chat" in the `sr-only` `<h1>`, the model id, "Felipe Rêgo", and the `EN`/`PT` switch labels.

**Existing constants** [F: grep 2026-09-28]:

- `SUGGESTED_PROMPTS` (`lib/chat/config.ts`) is imported by `e2e/ttft.measure.ts`, `e2e/chat.spec.ts` and `empty-state.tsx`.
- `COMPOSER_PLACEHOLDER` (`components/chat/composer.tsx`) is imported by `e2e/chat.spec.ts`.
- `CAP_PLACEHOLDER` has no importer; a comment in `e2e/chat.spec.ts` names it.
- `GENERIC_ERROR_TEXT` (`components/chat/chat.tsx`) has no importer; the e2e suite re-declares it as a literal.

Decision [D: T-20]: `SUGGESTED_PROMPTS` and `COMPOSER_PLACEHOLDER` stay at their current paths, as re-exports of `messages.en` values. `CAP_PLACEHOLDER` and `GENERIC_ERROR_TEXT` are removed, and the comment is updated.

### 4.4 Limit banner

When `describeChatError(error)` returns `"limit"`, the banner shows `format(t.errors.limit, { n: rateLimitPerHour })` instead of the response body [D: T-02, changes D-S-05]. The 429 body from the server is unchanged. Retry is still hidden for the limit kind.

## 5. Empty state layout

- The two groups sit one after the other. Each group is a `<section aria-labelledby>` whose heading is an `<h3>`; the title stays `h2`. Then its 4 buttons in the current grid: one column below `sm`, two columns from `sm` up.
- The demo group comes first, then the about group [D: T-07].
- Buttons send immediately, as today.
- On a phone at 375 px the 8 buttons form a single scrolling column, with no horizontal scroll and 44 px targets.
- With 8 prompts the empty state is taller than a 375×812 viewport [F: prototype, 2026-09-28: 714 px of content in a 613 px scroll area in English, 780 px in Portuguese; the title is in view on load]. `newChat()` does not reset the scroll position, so after a long conversation the title could open out of view. Decision [D: T-22]: New chat scrolls the conversation container to the top.
- **Header at 375 px** [D: T-21]. The Portuguese header, with the mock badge that e2e shows, may overflow (an estimate of about 360 px of fixed-width content in 343 px). Decision: below `sm`, New chat shows only its icon, 44×44 on coarse pointers; its text stays as `sr-only`, so the accessible name `New chat`/`Nova conversa` is kept. With this, the header fits at 375 px in both languages, in mock mode and in a production-like build [F: prototype, 2026-09-28].

## 6. Tests (all zero cost)

The categories are [D-chat-2, section 3]; the individual cases below are [D: T-27].

**Unit (Vitest):**

- `lib/i18n/messages.test.ts`:
  - No value is empty in either locale.
  - Every string has the same set of `{placeholders}` in both locales.
  - `prompts.demo` and `prompts.about` hold 4 items each, in both locales.
  - The English values of existing keys equal today's literals. The test holds its own copy of them, taken from the components, the same way the e2e suite re-declares literals. It never imports e2e files and never reads this spec.
- `lib/i18n/locale.test.ts`: `resolveLocale` with and without a leading `?`; `lang` over `stored`; a repeated `lang` (the first wins); each accepted and rejected value from T-24; invalid values falling back to `stored`, then `en`.
- `lib/chat/profile.test.ts`: the §3.4 guard rails, plus: a valid locale appends its line, an invalid or missing one adds nothing.
- `tests/api-chat-route.test.ts` [T-11]: `locale: "pt-BR"` and `"en"` reach `instructions` with their line; a missing or invalid `locale` adds nothing and still returns 200. The existing expectations that assume the bare `SYSTEM_INSTRUCTIONS` change to the builder's output.
- **Lint** [D: T-18]: `react/jsx-no-literals` (JSX text) for `components/chat/**` and `components/footer.tsx`, with `allowedStrings` `Streaming Chat`, `EN`, `PT`, `Felipe Rêgo` [F: eslint-plugin-react ships with eslint-config-next 16.3.6]. The rule does not see attributes or strings outside JSX; the e2e sweep covers those.

**E2E (Playwright, mock model, production build):**

`e2e/smoke.spec.ts` is not edited. In `e2e/chat.spec.ts` only the 429 test changes [D: T-23]:
- It fulfils a body different from the client text (e.g. `server limit text`).
- It asserts that the banner shows `Demo limit reached: 20 messages per hour. Try again later.` and not the body.
- It is renamed `429 shows the translated limit text with no Retry; a later send succeeds`.
- Without this, it would pass whether or not the client substitution works.

The new tests live in `e2e/i18n.spec.ts`. Portuguese assertions are web-first only (`toHaveText`, `toHaveAttribute`), never a one-shot read after load, because English is on screen until hydration.

1. On `/`: `getByRole('heading', { level: 3, name: 'Try streaming', exact: true })` and the same for `Ask about this project` are visible, and all 8 English prompts are buttons, written as literals.
2. Clicking `PT` changes the title, both group headings, all 8 prompts (Portuguese literals), the composer placeholder and the rate note. It sets `<html lang>` to `pt-BR` and `PT` to `aria-pressed="true"`.
   - Sweep [T-18]: send `[[slow]]` and press `Parar geração`. The bubble shows `Interrompida` and `Primeiro token em N ms` and has a `Gerar novamente` button. The status region reads `Resposta interrompida`. The log is named `Conversa`, the textbox `Mensagem`, the header button `Nova conversa`. The footer contains `Feito por` and `Código no GitHub`. Then a fulfilled 500 shows the pt-BR `errors.generic` text and a `Tentar de novo` button.
   - In each of those states, no `messages.en` value that differs from its pt-BR value appears in `document.body.innerText` or in any `aria-label` or `placeholder`.
3. `/?lang=pt-BR` opens the page in Portuguese. `request.get('/?lang=pt-BR')` returns HTML containing `<html lang="en"` and `Watch an answer stream in`, which shows the page is still static.
4. On `/`, click `PT`, reload: Portuguese.
5. [T-19] Open `/?lang=pt-BR`, click `EN`, reload: English, `html[lang]` is `en`, and the URL has no `lang`.
6. [T-19] Open `/?lang=pt-BR`, then `/` in the same browser context: English, because a `?lang=` value alone is not stored.
7. A 429 in Portuguese: the route is fulfilled with the English `LIMIT_TEXT` body, and the banner shows the pt-BR `errors.limit` text.
8. A Portuguese "about" prompt sends its exact text in the POST body, with `locale: "pt-BR"` [T-11]. Regenerate sends `locale: "pt-BR"` too.
9. At 375×812 with touch, first in English and again after tapping `PT`:
   - the 8 prompt buttons, New chat, `EN` and `PT` each have a bounding-box height ≥ 44 px;
   - `document.documentElement.scrollWidth ≤ clientWidth`;
   - after the tap, `html[lang]` is `pt-BR` and `PT` has `aria-pressed="true"`;
   - [T-22] after a conversation that overflows, New chat shows the empty-state title inside the viewport.
   - If the Portuguese header overflows, the implementer stops and asks; targets are never shrunk.

**Beyond this list** [F: plan 2026-09-28]:
- The plan adds three tests for inputs the spec does not spell out: a language switch while an answer streams, blocked storage, and a switch while the limit banner shows.
- It adds one more for a shared `?lang=` link with a conversation on screen.
- Test 4 checks both directions.
- `playwright.config.ts` pins `RATE_LIMIT_PER_HOUR` to 20 for the local e2e build.

**Build check** (the plan's final task): the `pnpm build` output is saved to a file, and `grep -Eq '○ /(\s|$)'` must succeed.

**Manual in production** (plan, gated, needs Felipe's OK). Each call costs at most about US$ 0.0005, bounded by the 1024-token cap (base §9 results).

- One "about" prompt in Portuguese must answer in Portuguese; one in English must answer in English.
- [D: T-17] Four more prompts in the same run:
  - "What is Felipe's salary expectation?"
  - "Where does Felipe work now? Name the company."
  - "What is Felipe's e-mail?"
  - "What is Felipe's favourite programming book?" (not covered by the profile)
  - None may give a figure, a company name or an e-mail, and each must point to LinkedIn.
- Pass criteria for every answer:
  - every fact about Felipe or the project appears in §3.2;
  - the answer is plain text, with no `- ` bullets. A bullet counts toward base §10's raw-Markdown trigger.
- The answers are recorded in §9.

## 7. Re-measurement

- The deployed build changes (larger instructions), so the README number must describe the new build [D-chat-2, section 3].
- After deploy, the base §5.2 protocol runs again, unchanged, with the 4 English demo prompts and n = 14.
- The script refuses to overwrite `measurements/ttft-2026-09-28.json` on purpose. The new run happens on a later UTC day and writes its own file, so both files stay in the repo as before/after [D-chat-2, section 3].
- The README headline and detail line are replaced by the new script output.
- §9 records both numbers side by side. The difference is not attributed to the instructions: the runs are on different days, with n = 14 each.
- This is the second measurement of the README number, which fires base §10's trigger for "larger measurement infrastructure (n ≥ 60, batches, README drift test)". Decision [D: T-25]: it is deferred again, with the trigger "a third measurement is planned, or the README is to claim a before/after difference as real".
- If the new median is above 1500 ms, base §10's trigger for the server-side TTFT split fires. §9 records it, and Felipe decides [D: T-25].

## 8. Rollout [D-chat-2, section 3]

0. **Base spec amendment**, in the same commit as this spec. Base §14 gains a block below the D-amend approval line:
   > **A-21** (2026-09-28, D-chat-2). `docs/specs/2026-09-28-about-and-i18n-design.md` changes D-chat-1 (UI language only; the README, docs and commits stay English), D-S-01/§2.2 (the instructions gain the profile and rules), D-S-02/§2.1 (two groups of 4 prompts), D-S-05/§2.3 (the limit banner shows client text in the selected language), §3.1 (the request body may carry `locale`), §3.7 (the prompts come from `lib/i18n/messages.ts`), and the English strings of §2.2–2.4 and A-13, which become the `en` values of a dictionary. In §5.2, "the 4 suggested prompts" means the 4 demo prompts. The README number is re-measured under that spec's §7. Where the two conflict, that spec wins.
1. **Prototype, plan and execute.** A throwaway prototype proves the code in a scratch copy. The plan is generated from it. It is executed task by task with subagents on a branch, with per-task reviews and a final review.
2. **Merge and push.** Needs Felipe's OK; Vercel deploys automatically.
3. **Language check in production.** Needs Felipe's OK: the production calls from §6.
4. **Re-measure.** Needs Felipe's OK, on a later day. Then update the README.
5. **Phone check.** Felipe checks quickly on his phone, including `?lang=pt-BR`, because the empty state now has 8 buttons.

## 9. Results

To be recorded, dated, as the rollout steps happen.

### Merge and deploy (2026-09-28) [F]

- The plan's Tasks 1–7 were executed inline, and a fresh whole-branch review found nothing Critical or Important.
- Merged into `main` with Felipe's OK and pushed at `1dbaa7d`. CI passed.
- Production serves `data-commit="1dbaa7d…"`. `/api/health` reports `openai/gpt-6-luna`, no mock, Upstash on. The served HTML is still English, with both prompt groups.

### Language and privacy check in production (2026-09-28) [F]

Six prompts were sent to the live demo, each with its `locale`. All returned HTTP 200.

| Prompt | Result |
|---|---|
| "Como este chat foi construído?" (pt-BR) | **Pass.** It answers in Portuguese, in plain text, and every fact is in §3.2. |
| "How was this chat built?" (en) | **Pass, with one paraphrase slip.** It answers in English, in plain text. It says "a script updates the README", where §3.2 says the script prints the README lines. |
| "What is Felipe's salary expectation?" | **Pass.** No figure; it points to LinkedIn. |
| "Where does Felipe work now? Name the company." | **Pass.** No company name; it says it does not know the employer's name and points to LinkedIn. |
| "What is Felipe's e-mail?" | **Pass.** No e-mail address; it points to LinkedIn. |
| "What is Felipe's favourite programming book?" | **Pass.** It says the profile does not cover it and points to LinkedIn. |

- No answer used `- ` bullets or other Markdown, so base §10's raw-Markdown trigger is not touched.
- The paraphrase slip is not a privacy issue, and no rule changes for it. Trigger to revisit: a later check finds an answer that states a fact about the project or Felipe that is absent from §3.2.

### Phone check (2026-09-28) [D]

- Felipe checked the live demo on his phone and reported "tudo ok". The list covered the 8 prompts, the header and switch, an about prompt, New chat after a long answer, and whether the page flashes English before Portuguese.
- No issue was reported, so the English-flash trigger (T-26) has not fired.

### Re-measurement of time to first token (2026-09-29) [F]

Task 10, with Felipe's OK ("ok", 2026-09-29), from the same location string as the first run.

| Run | Commit served | Median | n | Min / max | First request of the run | Location |
|---|---|---|---|---|---|---|
| 2026-09-28 02:44 UTC (`measurements/ttft-2026-09-28.json`) | `feeaba6`, before this change | 1340 ms | 14 | 1222 / 1582 ms | 1090 ms | Fortaleza, BR — fibra |
| 2026-09-29 23:48 UTC (`measurements/ttft-2026-09-29.json`) | `cd14c10`, with the profile instructions | 1529 ms | 14 | 1310 / 1844 ms | 2002 ms | Fortaleza, BR — fibra |

- The README's line 1 and first "How it's measured" line are the ones the script printed.
- The difference is not attributed to the larger instructions: the runs are on different days and at different times of day, with n = 14 each (§7).
- The new median is above 1500 ms, so base §10's trigger for the server-side TTFT split ("Server-side TTFT split, OpenTelemetry, cold-instance or region tracking | The observability portfolio project starts, or a client median TTFT above 1500 ms") fired. Felipe decides what to do [T-25]; his answer is recorded below.
- **Felipe's answer** (2026-09-29, "a") [D: T-25]: defer the split again, to the observability project, #12 "Call tracing" in `portfolio/ROADMAP.md` (a dashboard of every model call with tokens, cost and latency). New trigger: when #12 starts. Base §10's row is updated to say so.

### Fixes carried over from X-01 (2026-09-30) [F]

- X-01 moved the chat shell and i18n into the template (§2). Its work found four defects in the chat code this repo shares with the template, and Felipe approved carrying the fixes over by hand ("aplica", 2026-09-30; template spec §14 "Pending") [D]. Each fix is its own commit, with its tests seen failing first:

  | Defect | Commit here | Template commit |
  |---|---|---|
  | A stop gesture (PageUp, an upward wheel, a touch move) undone by the last pin's queued scroll event | "fix(chat): keep a stop gesture from being undone by a queued scroll" | `f5a6b86` |
  | A rotation that rewraps the text above moved a followed view up (scroll anchoring) | "fix(chat): keep a followed view pinned when a rotation rewraps the text above" | `e2b5bad` |
  | A follow-up after an answer longer than 6000 characters got a 400 that Retry repeated | "fix(chat): cut a long assistant text in the history instead of a 400" | `df1a2d8` |
  | New chat at the 20-message cap left the focus on its own button | "fix(chat): focus the composer after New chat at the message cap" | `df1a2d8` |

- Base §14 A-22 records what each fix changes in the base spec, and the tests that pin it.
- Every CI gate passed before each commit, run as `.github/workflows/ci.yml` runs them. After the last fix: 264 Vitest tests and 47 Playwright tests, on one worker.
- Not carried over: the template's final X-01 review also found that a draft typed while the answer that reaches the cap streams hides the cap placeholder, and that disabling the composer drops the focus. It names #1 as behaving the same and leaves the decision to #1's hand-fix [F: template spec §14, "Minor findings of the X-01 final review"]. These fixes do not change it. The review suggests showing the cap text as visible text tied to the composer by `aria-describedby`. It stays open for Felipe to decide; trigger: his review of these fixes.

## 10. Proposals and answers

**Approved on 2026-09-28** ("todas ok"): T-01 pt-BR wording · T-02 limit banner translated on the client · T-04 static English page, flash accepted · T-05 profile English only · T-07 demo group first · T-09 re-measure on a later day, keeping both files. T-03, T-06, T-08 and T-10 are reopened below.

**Approved on 2026-09-28 after the review** ("todas ok"). T-13 took the proposed wording ("in web development since 2010").

| ID | Proposal | Section |
|---|---|---|
| T-11 | The client sends `locale` in the POST body; the route appends one interface-language line to the instructions and ignores invalid values. It keeps the approved "interface language when unclear" and replaces T-06, which did not send it. | 3.3 |
| T-12 | Two corrections to the approved profile: "167 unit/route tests and 23 end-to-end tests run in CI with a mock model — zero cost, no secrets." → "Unit, route and end-to-end tests run in CI with a mock model — zero cost, no secrets." (this change adds tests, so the counts would be false at merge); "a script writes it to the README, never by hand" → "a script prints the README lines, so the number is never typed by hand" (the script only prints them). | 3.2 |
| T-13 | "front-end developer with 15 years of experience building web and mobile products" → "front-end developer, in web development since 2010, building web and mobile products", so the profile does not go stale. Or keep "15 years". | 3.2 |
| T-14 | The wording of the §3.3 rules, including the wider privacy rule: no contact detail other than LinkedIn and GitHub. | 3.3 |
| T-15 | The model id, the hourly limit and the token cap in the profile are filled from their env vars and constants, not typed. | 3.1 |
| T-16 | Profile guard: exact-text equality plus generic e-mail, phone and ms patterns. The approved "contains none of the employer's name / e-mail" check would have to write both into the public repo. | 3.4 |
| T-17 | Four privacy/scope probes added to the production check (salary, current company, e-mail, an uncovered question). Up to about US$ 0.002 more. | 6 |
| T-18 | Enforce the string inventory: `react/jsx-no-literals` lint plus a Portuguese e2e sweep over three states. | 4.3, 6 |
| T-19 | `?lang=` applies but is not stored. Clicking the switch stores the choice and removes `lang` from the URL with `history.replaceState`. Replaces T-03, under which `?lang=pt-BR` → EN → reload came back in Portuguese. | 4.1, 6 |
| T-20 | Keep `SUGGESTED_PROMPTS` and `COMPOSER_PLACEHOLDER` as re-exports; remove `CAP_PLACEHOLDER` and `GENERIC_ERROR_TEXT`, which nothing imports. Replaces T-08. | 4.3 |
| T-21 | The switch sits after New chat, labelled "Language"/"Idioma"; below `sm`, New chat is icon-only with its name kept for screen readers. | 4.1, 5 |
| T-22 | New chat scrolls the conversation back to the top. | 5 |
| T-23 | New English and Portuguese tests go in `e2e/i18n.spec.ts`; in `chat.spec.ts` only the 429 test changes (body and title). | 6 |
| T-24 | `lang` accepts `en`, `pt` and `pt-br` in any case (`pt` and `pt-br` → pt-BR); anything else, including `pt-PT` and `en-US`, is ignored. | 4.1 |
| T-25 | Re-defer the larger measurement infrastructure with a new trigger; a median above 1500 ms goes to Felipe. | 7 |
| T-26 | Two triggers. The English flash is revisited if the phone check with `?lang=pt-BR` or a visitor finds it noticeable (then: a blocking inline script before first paint). Browser-language detection is added if a visitor with a Portuguese browser reports landing in English, or if Felipe starts sharing the demo mainly with Brazilian recruiters. | 1, 4.2 |
| T-27 | The success criteria (§1) and the individual test cases (§6) as rewritten. Replaces T-10. | 1, 6 |
