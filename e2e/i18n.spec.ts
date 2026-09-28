import { expect, test, type Page } from "@playwright/test";

// E2E for the interface language (delta spec §6): the production build in mock mode.
// The page is prerendered in English and switches after hydration (delta spec §4.2), so
// Portuguese is asserted web-first only, and English only once the page has hydrated.
// The expected strings are literals, re-declared as in chat.spec.ts.

const header = (page: Page) => page.locator("header[data-model]");
const footer = (page: Page) => page.locator("footer");
// exact: a non-exact "EN" also matches "Send message".
const switchButton = (page: Page, name: "EN" | "PT") =>
  page.getByRole("button", { name, exact: true });
const newChatButton = (page: Page, name: string) =>
  header(page).getByRole("button", { name, exact: true });
const composer = (page: Page) => page.getByRole("textbox");
const conversation = (page: Page) => page.getByRole("log");
const userBubbles = (page: Page) => page.locator('[data-message-role="user"]');
const assistantBubbles = (page: Page) => page.locator('[data-message-role="assistant"]');

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
