import { expect, test, type Page, type Request } from "@playwright/test";
import { messages } from "@/lib/i18n/messages";

// E2E for the interface language (delta spec §6): the production build in mock mode.
// The page is prerendered in English and switches after hydration (delta spec §4.2), so
// Portuguese is asserted web-first only, and English only once the page has hydrated.
// The expected strings are literals, re-declared as in chat.spec.ts. Only the negative
// sweep of item 2 reads the dictionary, to find every English string.

const SLOW_PROMPT = "[[slow]]";
// What rateLimitResponse() sends with the default RATE_LIMIT_PER_HOUR, as in chat.spec.ts.
const LIMIT_TEXT = "Demo limit reached: 20 messages per hour. Try again later.";

// The eight prompts in both languages (delta spec §4.3).
const DEMO_PROMPTS_EN = [
  "200-word story about a lighthouse keeper",
  "Explain how HTTPS works to a new developer",
  "5 interview questions for a senior frontend engineer",
  "Follow-up email after a job interview",
] as const;
const ABOUT_PROMPTS_EN = [
  "How was this chat built?",
  "What tech stack does this project use?",
  "What is this project for?",
  "Who is Felipe, and what roles is he looking for?",
] as const;
const DEMO_PROMPTS_PT = [
  "História de 200 palavras sobre um faroleiro",
  "Explique como o HTTPS funciona para quem está começando",
  "5 perguntas de entrevista para dev front-end sênior",
  "E-mail de follow-up depois de uma entrevista",
] as const;
const ABOUT_PROMPTS_PT = [
  "Como este chat foi construído?",
  "Qual é a stack deste projeto?",
  "Qual é o propósito deste projeto?",
  "Quem é o Felipe e que vagas ele procura?",
] as const;

// What item 9 taps and reads on a phone, in each language (delta spec §4.3).
type PhoneStrings = {
  prompts: readonly string[];
  newChat: string;
  send: string;
  stop: string;
  title: string;
};
const PHONE_EN: PhoneStrings = {
  prompts: [...DEMO_PROMPTS_EN, ...ABOUT_PROMPTS_EN],
  newChat: "New chat",
  send: "Send message",
  stop: "Stop generating",
  title: "Watch an answer stream in",
};
const PHONE_PT: PhoneStrings = {
  prompts: [...DEMO_PROMPTS_PT, ...ABOUT_PROMPTS_PT],
  newChat: "Nova conversa",
  send: "Enviar mensagem",
  stop: "Parar geração",
  title: "Veja a resposta chegar em tempo real",
};

// The fields of a POST /api/chat body that item 8 reads (delta spec §3.3).
type ChatRequestBody = {
  messages: { role: string; parts: { type: string; text?: string }[] }[];
  trigger: string;
  locale?: unknown;
};

const header = (page: Page) => page.locator("header[data-model]");
const footer = (page: Page) => page.locator("footer");
// exact: a non-exact "EN" also matches "Send message".
const switchButton = (page: Page, name: "EN" | "PT") =>
  page.getByRole("button", { name, exact: true });
const newChatButton = (page: Page, name: string) =>
  header(page).getByRole("button", { name, exact: true });
const composer = (page: Page) => page.getByRole("textbox");
const conversation = (page: Page) => page.getByRole("log");
// The scroll container is the parent of the role="log" list, as in chat.spec.ts.
const scroller = (page: Page) => conversation(page).locator("xpath=..");
const userBubbles = (page: Page) => page.locator('[data-message-role="user"]');
const assistantBubbles = (page: Page) => page.locator('[data-message-role="assistant"]');
// The error banner. Next.js's route announcer also has role="alert", so the banner is
// located by its data-slot, as in chat.spec.ts.
const banner = (page: Page) => page.locator('[data-slot="alert"]');
// The sr-only live region Chat announces the end of a response through.
const statusRegion = (page: Page) => page.locator('div[role="status"].sr-only');

async function sendPortuguese(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
}

function isChatPost(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname === "/api/chat";
}

/** Runs `action` and returns the body of the POST /api/chat it sends. */
async function postedBody(page: Page, action: () => Promise<void>): Promise<ChatRequestBody> {
  const posted = page.waitForRequest(isChatPost);
  await action();
  return (await posted).postDataJSON() as ChatRequestBody;
}

/**
 * The fixed text of every English value that differs from its pt-BR value (delta spec §6,
 * item 2): the parts between {placeholders} that the pt-BR value does not also contain.
 * So list.ttft gives "First token in " but not " ms", and a value equal in both gives nothing.
 */
function englishOnly(en: unknown, pt: unknown): string[] {
  if (typeof en === "string" && typeof pt === "string") {
    return en.split(/\{\w+\}/).filter((fragment) => !pt.includes(fragment));
  }
  const ptValues = pt as Record<string, unknown>;
  return Object.entries(en as Record<string, unknown>).flatMap(([key, value]) =>
    englishOnly(value, ptValues[key]),
  );
}

const ENGLISH_ONLY = englishOnly(messages.en, messages["pt-BR"]);

/** The English-only strings found in the page's text or in any aria-label or placeholder. */
async function englishLeftovers(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const attributes = (name: string) =>
      Array.from(document.querySelectorAll(`[${name}]`), (element) => element.getAttribute(name));
    return [document.body.innerText, ...attributes("aria-label"), ...attributes("placeholder")];
  });
  return ENGLISH_ONLY.filter((fragment) => texts.some((text) => text?.includes(fragment)));
}

async function expectNoEnglish(page: Page): Promise<void> {
  await expect.poll(() => englishLeftovers(page)).toEqual([]);
}

/**
 * Waits until the page has hydrated: Chat focuses the composer from an effect on load
 * (fine pointers only, spec §2.5). The locale store is checked in the same flush of
 * effects and a change re-renders synchronously, so after this an English assertion can
 * no longer pass on the prerendered HTML alone.
 */
async function waitForHydration(page: Page): Promise<void> {
  await expect(page.getByRole("textbox")).toBeFocused();
}

async function expectPortuguese(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await expect(switchButton(page, "PT")).toHaveAttribute("aria-pressed", "true");
  await expect(switchButton(page, "EN")).toHaveAttribute("aria-pressed", "false");
  await expect(newChatButton(page, "Nova conversa")).toBeVisible();
}

async function expectEnglish(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(switchButton(page, "EN")).toHaveAttribute("aria-pressed", "true");
  await expect(switchButton(page, "PT")).toHaveAttribute("aria-pressed", "false");
  await expect(newChatButton(page, "New chat")).toBeVisible();
}

/**
 * One prompt group of the empty state (delta spec §5): its <h3> is visible and names the
 * <section>, which holds exactly its 4 prompt buttons, in order.
 */
async function expectPromptGroup(
  page: Page,
  heading: string,
  prompts: readonly string[],
): Promise<void> {
  await expect(page.getByRole("heading", { level: 3, name: heading, exact: true })).toBeVisible();
  const group = page.getByRole("region", { name: heading, exact: true });
  await expect(group.getByRole("button")).toHaveText(prompts);
  for (const name of prompts) {
    await expect(group.getByRole("button", { name, exact: true })).toBeVisible();
  }
}

/**
 * Item 9 on a phone: the 8 prompts, New chat, EN and PT are at least 44 px tall (base §2.5),
 * and the page does not scroll sideways. The sizes come from CSS, so they are the same
 * before and after hydration.
 */
async function expectPhoneLayout(page: Page, strings: PhoneStrings): Promise<void> {
  for (const name of [...strings.prompts, strings.newChat, "EN", "PT"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.height, `height of "${name}"`).toBeGreaterThanOrEqual(44);
  }
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

/**
 * Item 9, T-22: after a conversation more than a view taller than the screen, New chat shows
 * the empty state from its title. The mock's [[slow]] answer is stopped once it is that tall.
 */
async function expectNewChatOpensAtTitle(page: Page, strings: PhoneStrings): Promise<void> {
  await composer(page).tap();
  await composer(page).fill(SLOW_PROMPT);
  await page.getByRole("button", { name: strings.send, exact: true }).tap();
  // The view follows the stream, so this waits until it is more than a full view down.
  await expect
    .poll(() => scroller(page).evaluate((element) => element.scrollTop - element.clientHeight), {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: strings.stop, exact: true }).tap();

  await newChatButton(page, strings.newChat).tap();
  await expect(conversation(page)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: strings.title, exact: true }),
  ).toBeInViewport({ ratio: 1 });
}

test("1. / shows the demo group, then the about group, with the 8 English prompts", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  await expectPromptGroup(page, "Try streaming", DEMO_PROMPTS_EN);
  await expectPromptGroup(page, "Ask about this project", ABOUT_PROMPTS_EN);
  // Demo first, then about (T-07).
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    "Try streaming",
    "Ask about this project",
  ]);
  await expect(
    page.getByText("20 messages/hour per visitor; regenerations count", { exact: true }),
  ).toBeVisible();
});

test("2. PT translates the empty state: title, both groups, the 8 prompts, the rate note and the placeholder", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  await switchButton(page, "PT").click();
  await expectPortuguese(page);

  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Veja a resposta chegar em tempo real",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Experimente: envie um prompt → aperte Parar (ou Esc) no meio → Gerar novamente",
      { exact: true },
    ),
  ).toBeVisible();
  await expectPromptGroup(page, "Experimente o streaming", DEMO_PROMPTS_PT);
  await expectPromptGroup(page, "Pergunte sobre o projeto", ABOUT_PROMPTS_PT);
  await expect(page.getByRole("heading", { level: 3 })).toHaveText([
    "Experimente o streaming",
    "Pergunte sobre o projeto",
  ]);
  // {n} is RATE_LIMIT_PER_HOUR, 20 by default.
  await expect(
    page.getByText("20 mensagens/hora por visitante; regenerações contam", { exact: true }),
  ).toBeVisible();
  await expect(composer(page)).toHaveAttribute("placeholder", "Envie uma mensagem");
});

test("2. PT sweep: no English string on the empty state, after a Stop or under the error banner", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  // Control: in English the sweep finds the dictionary's text, placeholders and aria-labels.
  await expect
    .poll(() => englishLeftovers(page))
    .toEqual(expect.arrayContaining(["Watch an answer stream in", "Send a message", "Language"]));

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await expectNoEnglish(page);

  // A stopped answer: its captions, Regenerate and the stopped announcement.
  await sendPortuguese(page, SLOW_PROMPT);
  const bubble = assistantBubbles(page);
  await expect(bubble).toHaveCount(1);
  await page.getByRole("button", { name: "Parar geração", exact: true }).click();
  await expect(bubble.getByText("Interrompida", { exact: true })).toBeVisible();
  await expect(bubble.getByText(/^Primeiro token em \d+ ms$/)).toBeVisible();
  await expect(bubble.getByRole("button", { name: "Gerar novamente", exact: true })).toBeVisible();
  await expect(statusRegion(page)).toHaveText("Resposta interrompida");
  await expect(conversation(page)).toHaveAccessibleName("Conversa");
  await expect(composer(page)).toHaveAccessibleName("Mensagem");
  await expect(newChatButton(page, "Nova conversa")).toBeVisible();
  await expect(footer(page)).toContainText("Feito por");
  await expect(footer(page)).toContainText("Código no GitHub");
  await expectNoEnglish(page);

  // A failed request: the generic banner, its Retry and the failed announcement.
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 500,
      contentType: "text/plain; charset=utf-8",
      body: "Internal Server Error",
    }),
  );
  await sendPortuguese(page, "Olá");
  await expect(banner(page)).toContainText(
    "Não foi possível obter uma resposta. Verifique sua conexão e tente de novo.",
  );
  await expect(
    banner(page).getByRole("button", { name: "Tentar de novo", exact: true }),
  ).toBeVisible();
  await expect(statusRegion(page)).toHaveText("Falha na resposta");
  await expectNoEnglish(page);
});

test("PT translates the header and the footer; EN switches back", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await expectEnglish(page);

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await expect(page.getByRole("group", { name: "Idioma", exact: true })).toBeVisible();
  // e2e runs in mock mode, so the badge is on screen.
  await expect(header(page).getByText("Modelo simulado", { exact: true })).toBeVisible();
  await expect(footer(page)).toHaveText("Feito por Felipe Rêgo · Código no GitHub");

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page.getByRole("group", { name: "Language", exact: true })).toBeVisible();
  await expect(header(page).getByText("Mock model", { exact: true })).toBeVisible();
  await expect(footer(page)).toHaveText("Built by Felipe Rêgo · Source on GitHub");
});

test("3. ?lang=pt-BR opens the page in Portuguese; the served HTML stays static English", async ({
  page,
  request,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);

  const response = await request.get("/?lang=pt-BR");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  expect(html).toContain('<html lang="en"');
  expect(html).toContain("Watch an answer stream in");
});

test("4. a choice made with the switch survives a reload, in both directions", async ({ page }) => {
  await page.goto("/");
  await waitForHydration(page);
  await switchButton(page, "PT").click();
  await expectPortuguese(page);

  await page.reload();
  await expectPortuguese(page);

  // EN replaces the stored pt-BR.
  await waitForHydration(page);
  await switchButton(page, "EN").click();
  await expectEnglish(page);

  await page.reload();
  await waitForHydration(page);
  await expectEnglish(page);
});

test("with localStorage blocked the switch still works until a reload, and ?lang=pt-BR still applies", async ({
  page,
}) => {
  // Safari's private mode, or site data disabled: every access to localStorage throws.
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await waitForHydration(page);
  await expectEnglish(page);
  await switchButton(page, "PT").click();
  await expectPortuguese(page);

  // Nothing was stored: the choice lasts until the page is reloaded.
  await page.reload();
  await waitForHydration(page);
  await expectEnglish(page);

  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  expect(errors).toEqual([]);
});

test("5. EN after ?lang=pt-BR removes lang from the URL and stays English on reload", async ({
  page,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page).toHaveURL("/");

  await page.reload();
  await waitForHydration(page);
  await expectEnglish(page);
  await expect(page).toHaveURL("/");
});

test("5. the switch removes only lang: other parameters and the hash stay", async ({ page }) => {
  await page.goto("/?utm_source=e2e&lang=pt-BR#top");
  await expectPortuguese(page);
  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page).toHaveURL("/?utm_source=e2e#top");
});

test("5. removing lang keeps the page: no reload, no router request; Back then Forward reopens / in English", async ({
  page,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  await composer(page).fill("Hello");
  await composer(page).press("Enter");
  await expect(assistantBubbles(page)).toHaveCount(1);
  // aria-busy turns false once the answer has finished streaming.
  await expect(conversation(page)).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  const answerText = assistantBubbles(page).locator(":scope > div").first();
  const answer = await answerText.innerText();

  // A reload, or any other document load, would drop this marker.
  await page.evaluate(() => Object.assign(window, { e2eSameDocument: true }));
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(page).toHaveURL("/");
  await expect(userBubbles(page)).toHaveText(["Hello"]);
  await expect(answerText).toHaveText(answer);

  // A second answer: the chat still works, and a request the switch started has had time to
  // show up.
  await composer(page).fill("Again");
  await composer(page).press("Enter");
  await expect(assistantBubbles(page)).toHaveCount(2);
  await expect(conversation(page)).toHaveAttribute("aria-busy", "false", { timeout: 20_000 });
  expect(await page.evaluate(() => "e2eSameDocument" in window)).toBe(true);
  // Neither a document request for / nor a Next.js router (RSC) request.
  const pageRequests = requests.filter(
    (url) => url.pathname === "/" || url.searchParams.has("_rsc"),
  );
  expect(pageRequests.map(String)).toEqual([]);

  // Back leaves the page (a new context starts on about:blank). Forward loads / as a new
  // document: English, the stored choice, since the history entry no longer holds lang.
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL("/");
  await waitForHydration(page);
  await expectEnglish(page);
});

test("6. ?lang=pt-BR alone is not stored: / in the same context opens in English", async ({
  page,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);

  await page.goto("/");
  await waitForHydration(page);
  await expectEnglish(page);
});

test("7. a 429 in Portuguese shows the pt-BR limit text, not the English body", async ({
  page,
}) => {
  await page.goto("/?lang=pt-BR");
  await expectPortuguese(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      contentType: "text/plain; charset=utf-8",
      headers: { "Retry-After": "3600" },
      body: LIMIT_TEXT,
    }),
  );
  await composer(page).fill("Olá");
  await composer(page).press("Enter");
  await expect(banner(page)).toHaveText(
    "Limite da demo atingido: 20 mensagens por hora. Tente mais tarde.",
  );
  await expect(page.getByRole("button", { name: "Tentar de novo", exact: true })).toHaveCount(0);
});

test("the limit banner follows the switch: pt-BR after PT, English again after EN, never Retry", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  // In English the client's text equals LIMIT_TEXT, so the body here differs from it.
  const serverBody = "server limit text";
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 429,
      contentType: "text/plain; charset=utf-8",
      headers: { "Retry-After": "3600" },
      body: serverBody,
    }),
  );
  await composer(page).fill("Hello");
  await composer(page).press("Enter");
  await expect(banner(page)).toHaveText(LIMIT_TEXT);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await expect(banner(page)).toHaveText(
    "Limite da demo atingido: 20 mensagens por hora. Tente mais tarde.",
  );
  await expect(page.getByRole("button", { name: "Tentar de novo", exact: true })).toHaveCount(0);

  await switchButton(page, "EN").click();
  await expectEnglish(page);
  await expect(banner(page)).toHaveText(LIMIT_TEXT);
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
});

test("8. an about prompt posts its exact text and the locale: en, then pt-BR after PT; Regenerate sends pt-BR too", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  // English first: a locale fixed at load, rather than read for each request, fails below.
  const english = await postedBody(page, () =>
    page.getByRole("button", { name: ABOUT_PROMPTS_EN[0], exact: true }).click(),
  );
  expect(english.locale).toBe("en");
  await newChatButton(page, "New chat").click();

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  const prompt = ABOUT_PROMPTS_PT[0];
  const sent = await postedBody(page, () =>
    page.getByRole("button", { name: prompt, exact: true }).click(),
  );
  expect(sent.trigger).toBe("submit-message");
  expect(sent.messages.at(-1)?.role).toBe("user");
  expect(sent.messages.at(-1)?.parts).toEqual([{ type: "text", text: prompt }]);
  expect(sent.locale).toBe("pt-BR");

  // Regenerate shows once the mock's default answer is complete, about 4 s after the send.
  const regenerate = assistantBubbles(page).getByRole("button", {
    name: "Gerar novamente",
    exact: true,
  });
  await expect(regenerate).toBeVisible({ timeout: 20_000 });
  const regenerated = await postedBody(page, () => regenerate.click());
  expect(regenerated.trigger).toBe("regenerate-message");
  expect(regenerated.messages.at(-1)?.parts).toEqual([{ type: "text", text: prompt }]);
  expect(regenerated.locale).toBe("pt-BR");
});

test("PT while an answer streams renames Stop; the stopped request sent en, its Regenerate sends pt-BR", async ({
  page,
}) => {
  await page.goto("/");
  await waitForHydration(page);
  const english = await postedBody(page, async () => {
    await composer(page).fill(SLOW_PROMPT);
    await composer(page).press("Enter");
  });
  // Sent before the switch.
  expect(english.locale).toBe("en");
  // The bubble shows once text has arrived; aria-busy stays true while the answer streams.
  const bubble = assistantBubbles(page);
  await expect(bubble).toHaveCount(1);
  await expect(conversation(page)).toHaveAttribute("aria-busy", "true");

  await switchButton(page, "PT").click();
  await expectPortuguese(page);
  await page.getByRole("button", { name: "Parar geração", exact: true }).click();
  await expect(bubble.getByText("Interrompida", { exact: true })).toBeVisible();

  const regenerated = await postedBody(page, () =>
    bubble.getByRole("button", { name: "Gerar novamente", exact: true }).click(),
  );
  expect(regenerated.trigger).toBe("regenerate-message");
  expect(regenerated.locale).toBe("pt-BR");
});

test.describe("9. a phone at 375×812 with touch", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test("9. 44 px targets, no sideways scroll and New chat back at the title, in English and after tapping PT", async ({
    page,
  }) => {
    await page.goto("/");
    const isCoarsePointer = await page.evaluate(
      () => window.matchMedia("(pointer: coarse)").matches,
    );
    expect(isCoarsePointer).toBe(true);
    await expectPhoneLayout(page, PHONE_EN);
    await expectNewChatOpensAtTitle(page, PHONE_EN);

    await switchButton(page, "PT").tap();
    await expectPortuguese(page);
    await expectPhoneLayout(page, PHONE_PT);
    await expectNewChatOpensAtTitle(page, PHONE_PT);
  });
});
