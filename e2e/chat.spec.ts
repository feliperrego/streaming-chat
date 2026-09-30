import { randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page, type Request, type Route } from "@playwright/test";
import { COMPOSER_PLACEHOLDER } from "@/components/chat/composer";
import {
  FIRST_CHUNK_TIMEOUT_MS,
  MAX_ASSISTANT_CHARS,
  MAX_MESSAGES,
  MAX_USER_CHARS,
  SUGGESTED_PROMPTS,
} from "@/lib/chat/config";

// E2E for spec §8.3: the production build in mock mode (AI_MOCK=1), zero cost.
// The mock's first chunk arrives 600 ms after the request (D-S-12); [[slow]] streams
// 300 lines, 30 ms apart; [[error]] fails the first time the server sees a prompt text.

const SLOW_PROMPT = "[[slow]]";
const GENERIC_ERROR_TEXT = "Couldn't get a response. Check your connection and try again.";
// What rateLimitResponse() sends with the default RATE_LIMIT_PER_HOUR (template §5.3).
const LIMIT_TEXT = "Demo limit reached: 20 messages per hour. Try again later.";
// composer.capPlaceholder (lib/i18n/messages.ts), re-declared as a literal so a rewording
// of the value would fail this test, not just move with it (constraints.md: verbatim).
const CAP_TEXT = "Conversation limit reached. Start a new chat.";
// The four approved prompts (spec, constraints.md), re-declared as literals for the same
// reason. SUGGESTED_PROMPTS is still used to click "prompt i" where the exact wording
// doesn't matter.
const APPROVED_PROMPTS = [
  "200-word story about a lighthouse keeper",
  "Explain how HTTPS works to a new developer",
  "5 interview questions for a senior frontend engineer",
  "Follow-up email after a job interview",
] as const;
// The mock's default answer (DEFAULT_MOCK_TEXT in lib/ai/mock.ts), from its first to its last words.
const FULL_DEFAULT_ANSWER =
  /^Streaming lets an answer appear [\s\S]* keeps every test run predictable\.$/;
// TTFT calibration bounds (spec §5.3, D-S-12).
const TTFT_MIN_MS = 600;
const TTFT_MAX_MS = 2000;

type PostedMessage = { id: string; role: string; parts: { type: string; text?: string }[] };
type ChatRequestBody = {
  id: string;
  messages: PostedMessage[];
  trigger: string;
  messageId?: string;
};

const header = (page: Page) => page.locator("header[data-model]");
const composer = (page: Page) => page.getByRole("textbox", { name: "Message" });
const sendButton = (page: Page) => page.getByRole("button", { name: "Send message" });
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });
const retryButton = (page: Page) => page.getByRole("button", { name: "Retry" });
const regenerateButtons = (page: Page) => page.getByRole("button", { name: "Regenerate" });
const jumpButton = (page: Page) => page.getByRole("button", { name: "Jump to latest" });
const promptButton = (page: Page, index: number) =>
  page.getByRole("button", { name: SUGGESTED_PROMPTS[index], exact: true });
const conversation = (page: Page) => page.getByRole("log", { name: "Conversation" });
// The scroll container is the parent of the role="log" list.
const scroller = (page: Page) => conversation(page).locator("xpath=..");
const userBubbles = (page: Page) => page.locator('[data-message-role="user"]');
const assistantBubbles = (page: Page) => page.locator('[data-message-role="assistant"]');
// The error banner. The shadcn Alert carries role="alert"; Next.js's route announcer
// also has role="alert", so the banner is located by its data-slot.
const banner = (page: Page) => page.locator('[data-slot="alert"]');
const stoppedRow = (page: Page) => page.getByTestId("stopped-row");
const typingDots = (page: Page) => page.getByTestId("typing-indicator");
// The sr-only live region Chat.tsx announces "Response failed/stopped/complete" through.
const statusRegion = (page: Page) => page.locator('div[role="status"].sr-only');
// The answer text is the first child of an assistant bubble; the caption row follows it.
const answerText = (bubble: Locator) => bubble.locator(":scope > div").first();

function isChatPost(request: Request): boolean {
  return request.method() === "POST" && new URL(request.url()).pathname === "/api/chat";
}

/** Runs `action` and returns the body of the POST /api/chat it sends. */
async function postedBody(page: Page, action: () => Promise<void>): Promise<ChatRequestBody> {
  const posted = page.waitForRequest(isChatPost);
  await action();
  return (await posted).postDataJSON() as ChatRequestBody;
}

/** The text parts of a posted message, joined. */
function postedText(message: PostedMessage): string {
  return message.parts.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
}

/** One SSE frame per chunk, exactly as createUIMessageStreamResponse writes it, then [DONE]. */
function sse(chunks: object[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
}

/** Fulfills a route with a UI-message-stream SSE body, with the headers the real route sends. */
async function fulfillSse(route: Route, body: string): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
    body,
  });
}

/** A one-shot SSE answer: start, one text part, then finish (default finishReason "stop"). */
function textAnswer(text: string, finishReason = "stop"): string {
  return sse([
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { type: "finish-step" },
    { type: "finish", finishReason },
  ]);
}

async function sendText(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await sendButton(page).click();
}

/** Waits until the request is over: the Stop button has turned back into Send. */
async function waitUntilIdle(page: Page): Promise<void> {
  await expect(sendButton(page)).toBeVisible({ timeout: 20_000 });
}

/** Waits until the page shows `count` answers and the last request is over. */
async function waitForAnswers(page: Page, count = 1): Promise<void> {
  await expect(assistantBubbles(page)).toHaveCount(count, { timeout: 20_000 });
  await waitUntilIdle(page);
}

async function textLength(bubble: Locator): Promise<number> {
  return answerText(bubble).evaluate((element) => element.textContent?.length ?? 0);
}

/** Waits for the bubble's data-ttft-ms and returns it. */
async function ttftOf(bubble: Locator): Promise<number> {
  await expect(bubble).toHaveAttribute("data-ttft-ms", /^\d+$/, { timeout: 10_000 });
  return Number(await bubble.getAttribute("data-ttft-ms"));
}

/** Records a measured value in the test report, to diagnose a flake. */
function annotate(type: string, value: number): void {
  test.info().annotations.push({ type, description: String(value) });
}

function expectCalibrated(ttftMs: number): void {
  expect(ttftMs, "data-ttft-ms").toBeGreaterThanOrEqual(TTFT_MIN_MS);
  expect(ttftMs, "data-ttft-ms").toBeLessThan(TTFT_MAX_MS);
}

type ScrollState = {
  scrollTop: number;
  scrollHeight: number;
  /** How far the content extends past the view. */
  overflow: number;
  /** Distance between the bottom of the view and the bottom of the content. */
  fromBottom: number;
};

async function scrollState(page: Page): Promise<ScrollState> {
  return scroller(page).evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    overflow: element.scrollHeight - element.clientHeight,
    fromBottom: element.scrollHeight - element.scrollTop - element.clientHeight,
  }));
}

async function distanceFromBottom(page: Page): Promise<number> {
  return (await scrollState(page)).fromBottom;
}

/** Waits until the scroll position stops moving: two equal readings 50 ms apart. */
async function waitForScrollToSettle(page: Page): Promise<void> {
  let lastTop = Number.NaN;
  await expect
    .poll(
      async () => {
        const { scrollTop } = await scrollState(page);
        const settled = scrollTop === lastTop;
        lastTop = scrollTop;
        return settled;
      },
      { intervals: [50] },
    )
    .toBe(true);
}

test.describe("1. calibration and streaming", () => {
  // The only test allowed a retry (spec §5.3, C-13). If it still flakes, record the
  // observed data-ttft-ms values and ask before changing the bounds (D-S-12).
  test.describe.configure({ retries: 1 });

  test("a suggested prompt streams in, with a first token in [600, 2000) ms", async ({ page }) => {
    await page.goto("/");
    await promptButton(page, 0).click();
    // Sending refocuses the composer on a fine pointer, so typing the next message needs no click.
    await expect(composer(page)).toBeFocused();
    await expect(typingDots(page)).toBeVisible();

    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    const lengths: number[] = [];
    for (let poll = 0; poll < 4; poll++) {
      if (poll > 0) await page.waitForTimeout(150);
      lengths.push(await textLength(bubble));
    }
    for (let i = 1; i < lengths.length; i++) {
      expect(lengths[i], `text lengths across polls: ${lengths.join(", ")}`).toBeGreaterThan(
        lengths[i - 1],
      );
    }

    const ttftMs = await ttftOf(bubble);
    annotate("ttft-ms", ttftMs);
    expectCalibrated(ttftMs);

    await waitUntilIdle(page);
    await expect(bubble.getByText(`First token in ${ttftMs} ms`, { exact: true })).toBeVisible();
    await expect(header(page).getByText("Mock model", { exact: true })).toBeVisible();
  });
});

test.describe("2. stop", () => {
  /** After a Stop: the text no longer grows, it is labeled Stopped, Send is back and the composer has focus. */
  async function expectStoppedMidAnswer(page: Page, bubble: Locator): Promise<void> {
    const length = await textLength(bubble);
    await page.waitForTimeout(500);
    expect(await textLength(bubble)).toBe(length);
    await expect(bubble.getByText("Stopped", { exact: true })).toBeVisible();
    await expect(sendButton(page)).toBeVisible();
    await expect(composer(page)).toBeFocused();
  }

  test("the Stop button keeps the partial text, labeled Stopped", async ({ page }) => {
    await page.goto("/");
    await sendText(page, SLOW_PROMPT);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    await stopButton(page).click();
    await expectStoppedMidAnswer(page, bubble);
  });

  test("Esc stops from anywhere on the page", async ({ page }) => {
    await page.goto("/");
    await sendText(page, SLOW_PROMPT);
    const bubble = assistantBubbles(page);
    await expect(bubble).toHaveCount(1);
    await composer(page).blur();
    await expect(composer(page)).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expectStoppedMidAnswer(page, bubble);
  });
});

test("3. Stop before the first token shows the stopped row; its Regenerate gives one answer", async ({
  page,
}) => {
  await page.goto("/");
  await composer(page).fill("Stop me before I start");
  const sentAt = Date.now();
  await sendButton(page).click();
  await stopButton(page).click();
  annotate("send-to-stop-ms", Date.now() - sentAt);

  await expect(stoppedRow(page)).toHaveText("Stopped before a response · Regenerate");
  // Past the mock's 600 ms first-token delay: nothing arrived and nothing was measured.
  await page.waitForTimeout(1000);
  await expect(stoppedRow(page)).toBeVisible();
  await expect(assistantBubbles(page)).toHaveCount(0);
  await expect(page.locator("[data-ttft-ms]")).toHaveCount(0);

  await stoppedRow(page).getByRole("button", { name: "Regenerate" }).click();
  await expect(stoppedRow(page)).toHaveCount(0);
  await ttftOf(assistantBubbles(page));
  await waitUntilIdle(page);
  await expect(assistantBubbles(page)).toHaveCount(1);
  await expect(userBubbles(page)).toHaveCount(1);
});

test("4. Regenerate re-sends only the user turn and shows one answer with a fresh TTFT", async ({
  page,
}) => {
  await page.goto("/");
  // Hold the first request for 1.5 s, so the first answer's TTFT is >= 2100 ms. A stale
  // value (the old answer's, e.g. if a new message reused the old id) then cannot
  // pass the [600, 2000) check on the regenerated answer.
  await page.route(
    "**/api/chat",
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    },
    { times: 1 },
  );
  const prompt = "Tell me about streaming";
  await sendText(page, prompt);
  const bubble = assistantBubbles(page);
  const firstTtftMs = await ttftOf(bubble);
  annotate("first-ttft-ms", firstTtftMs);
  expect(firstTtftMs).toBeGreaterThanOrEqual(TTFT_MAX_MS);
  await waitUntilIdle(page);
  const oldAnswer = await answerText(bubble).innerText();
  expect(oldAnswer).toMatch(FULL_DEFAULT_ANSWER);

  const posted = page.waitForRequest(isChatPost);
  await regenerateButtons(page).click();
  // Regenerate refocuses the composer on a fine pointer, same as sending.
  await expect(composer(page)).toBeFocused();
  const body = (await posted).postDataJSON() as ChatRequestBody;
  expect(body.trigger).toBe("regenerate-message");
  // The body ends with the user message and carries no assistant turn or text.
  expect(body.messages.map((message) => message.role)).toEqual(["user"]);
  expect(body.messages.at(-1)?.parts).toEqual([{ type: "text", text: prompt }]);
  expect(JSON.stringify(body)).not.toContain(oldAnswer.slice(0, 40));

  // The old answer is gone at once; the new one gets its own measurement.
  await expect(bubble).toHaveCount(0);
  const regeneratedTtftMs = await ttftOf(bubble);
  annotate("regenerated-ttft-ms", regeneratedTtftMs);
  expectCalibrated(regeneratedTtftMs);
  await waitUntilIdle(page);
  await expect(assistantBubbles(page)).toHaveCount(1);
  await expect(userBubbles(page)).toHaveCount(1);
  await expect(regenerateButtons(page)).toHaveCount(1);
});

// The client posts every earlier answer again. An answer can be longer than MAX_ASSISTANT_CHARS:
// the mock's [[slow]] answer (300 lines, ignoring the token cap), a [[slow]] answer stopped past
// the limit, or a real answer cut at the token cap above the limit's characters per token. The
// next message must still get an answer, not a 400 that Retry would post again (spec §14 A-22).
test.describe("4. a follow-up after an answer longer than MAX_ASSISTANT_CHARS", () => {
  /** Sends a follow-up to the real route and expects the default answer as the second answer. */
  async function expectFollowUpAnswered(page: Page): Promise<void> {
    const followUp = "And a short follow-up";
    const body = await postedBody(page, () => sendText(page, followUp));
    // The input: the posted history carries the long answer whole.
    expect(body.messages.map((message) => message.role)).toEqual(["user", "assistant", "user"]);
    expect(postedText(body.messages[1]).length).toBeGreaterThan(MAX_ASSISTANT_CHARS);

    await waitForAnswers(page, 2);
    await expect(banner(page)).toHaveCount(0);
    await expect(answerText(assistantBubbles(page).nth(1))).toHaveText(FULL_DEFAULT_ANSWER);
    await expect(userBubbles(page)).toHaveCount(2);
    await expect(userBubbles(page).nth(1)).toHaveText(followUp);
  }

  test("a completed [[slow]] answer", async ({ page }) => {
    await page.goto("/");
    await sendText(page, SLOW_PROMPT);
    await waitForAnswers(page);
    await expectFollowUpAnswered(page);
  });

  test("a [[slow]] answer stopped past MAX_ASSISTANT_CHARS", async ({ page }) => {
    await page.goto("/");
    await sendText(page, SLOW_PROMPT);
    const bubble = assistantBubbles(page);
    await expect
      .poll(() => textLength(bubble), { timeout: 15_000 })
      .toBeGreaterThan(MAX_ASSISTANT_CHARS);
    await stopButton(page).click();
    await expect(bubble.getByText("Stopped", { exact: true })).toBeVisible();
    await expectFollowUpAnswered(page);
  });

  test("an answer cut at the length limit past MAX_ASSISTANT_CHARS", async ({ page }) => {
    await page.goto("/");
    const longAnswer = "A long answer that runs on. ".repeat(
      Math.ceil(MAX_ASSISTANT_CHARS / 28) + 10,
    );
    await page.route("**/api/chat", (route) =>
      fulfillSse(route, textAnswer(longAnswer.trim(), "length")),
    );
    await sendText(page, "write 5000 words");
    await waitForAnswers(page);
    await expect(
      assistantBubbles(page).getByText("Cut at demo length limit", { exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/chat");
    await expectFollowUpAnswered(page);
  });
});

test.describe("5. autoscroll", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("follows the stream, stops on wheel up, resumes with Jump to latest", async ({ page }) => {
    await page.goto("/");
    await sendText(page, SLOW_PROMPT);
    // Wait until the answer overflows the view by a good margin.
    await expect
      .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
      .toBeGreaterThan(400);

    // Following: within 2 px of the bottom while the content grows.
    const heightBefore = (await scrollState(page)).scrollHeight;
    for (let i = 0; i < 5; i++) {
      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);
      await page.waitForTimeout(150);
    }
    expect((await scrollState(page)).scrollHeight).toBeGreaterThan(heightBefore);
    await expect(jumpButton(page)).toHaveCount(0);

    // An upward wheel mid-stream stops following: the view stays put while text arrives.
    const box = await scroller(page).boundingBox();
    if (box === null) throw new Error("The scroll container is not visible.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -600);
    await expect(jumpButton(page)).toBeVisible();
    // Let the wheel scroll settle.
    await waitForScrollToSettle(page);
    const settled = await scrollState(page);
    expect(await distanceFromBottom(page)).toBeGreaterThan(80);
    await page.waitForTimeout(500);
    const later = await scrollState(page);
    expect(Math.abs(later.scrollTop - settled.scrollTop)).toBeLessThanOrEqual(2);
    expect(later.scrollHeight).toBeGreaterThan(settled.scrollHeight);
    await expect(jumpButton(page)).toBeVisible();

    // Jump to latest returns to the bottom, and following resumes while the stream goes on.
    await jumpButton(page).click();
    await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);
    await expect(jumpButton(page)).toHaveCount(0);
    const heightAfterJump = (await scrollState(page)).scrollHeight;
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(150);
      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);
    }
    expect((await scrollState(page)).scrollHeight).toBeGreaterThan(heightAfterJump);
    await expect(stopButton(page)).toBeVisible();
    await stopButton(page).click();
  });

  // While following, each pin moves the view down, and its scroll event reaches the hook only at
  // the next rendering step. A stop intent that lands in between must hold when that event
  // arrives. Here the stream is stopped, so no real pin moves the view: a script plays the pin
  // and the stop intent in one task, which fixes their order. Script-made events have no default
  // action, so nothing else scrolls.
  for (const intent of ["PageUp", "wheel up", "touch move down"] as const) {
    test(`a scroll event queued before a stop by ${intent} does not undo it`, async ({ page }) => {
      await page.goto("/");
      await sendText(page, SLOW_PROMPT);
      await expect
        .poll(async () => (await scrollState(page)).overflow, { timeout: 10_000 })
        .toBeGreaterThan(400);
      await stopButton(page).click();
      await expect(statusRegion(page)).toHaveText("Response stopped");
      await waitForScrollToSettle(page);
      expect(await distanceFromBottom(page)).toBeLessThanOrEqual(2);

      // 30 px up: still near the bottom, so the view keeps following, and the last scroll
      // position the hook saw is 30 px above the bottom.
      await scroller(page).evaluate(async (element) => {
        element.scrollTop = element.scrollHeight - element.clientHeight - 30;
        // Scroll events fire in the rendering step, before its animation frame callbacks.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.waitForTimeout(300);
      await expect(jumpButton(page)).toHaveCount(0);

      await scroller(page).evaluate((element, intent) => {
        // The pin: a move down to the bottom, whose scroll event is now queued.
        element.scrollTop = element.scrollHeight;
        // The stop intent, before that event.
        if (intent === "PageUp") {
          document.body.dispatchEvent(
            new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }),
          );
        } else if (intent === "wheel up") {
          element.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
        } else {
          // The finger moving down scrolls the content up.
          const at = (clientY: number) => [new Touch({ identifier: 1, target: element, clientY })];
          element.dispatchEvent(new TouchEvent("touchstart", { touches: at(100), bubbles: true }));
          element.dispatchEvent(new TouchEvent("touchmove", { touches: at(140), bubbles: true }));
        }
      }, intent);
      await expect(jumpButton(page)).toBeVisible();
      // Give the queued scroll event time to arrive and a buggy handler time to re-render.
      await page.waitForTimeout(300);
      await expect(jumpButton(page)).toBeVisible();
    });
  }

  test("wheel up over a conversation that does not overflow never shows Jump to latest", async ({
    page,
  }) => {
    await page.goto("/");
    await sendText(page, "Hello");
    await waitUntilIdle(page);
    expect((await scrollState(page)).overflow).toBeLessThanOrEqual(0);

    const box = await scroller(page).boundingBox();
    if (box === null) throw new Error("The scroll container is not visible.");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -300);
    // Give a buggy handler time to flip isFollowing and re-render before asserting
    // absence — otherwise a false pass could slip through before React re-renders.
    await page.waitForTimeout(300);

    await expect(jumpButton(page)).toHaveCount(0);
  });
});

test.describe("6. errors", () => {
  test("429 shows the translated limit text with no Retry; a later send succeeds", async ({
    page,
  }) => {
    await page.goto("/");
    // The banner shows the client's errors.limit text, never the 429 body (delta spec §4.4).
    // In English that text equals the server's LIMIT_TEXT, so the body here differs from it.
    const serverBody = "server limit text";
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 429,
        contentType: "text/plain; charset=utf-8",
        headers: { "Retry-After": "3600" },
        body: serverBody,
      }),
    );
    await sendText(page, "Hello");
    await expect(banner(page)).toHaveText(LIMIT_TEXT);
    await expect(banner(page)).not.toContainText(serverBody);
    await expect(banner(page)).toHaveAttribute("role", "alert");
    await expect(retryButton(page)).toHaveCount(0);

    await page.unroute("**/api/chat");
    await sendText(page, "Hello again");
    await ttftOf(assistantBubbles(page));
    await waitUntilIdle(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(1);
    await expect(answerText(assistantBubbles(page))).toHaveText(FULL_DEFAULT_ANSWER);
  });

  test("a 500 HTML page shows the generic banner and never renders the HTML", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 500,
        contentType: "text/html; charset=utf-8",
        body: "<!DOCTYPE html><html><body><h1>Upstream exploded</h1><p>Internal Server Error</p></body></html>",
      }),
    );
    await sendText(page, "Hello");
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    await expect(retryButton(page)).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Upstream exploded");
    await expect(page.locator("body")).not.toContainText("<h1>");
    await expect(page.locator("h1", { hasText: "Upstream exploded" })).toHaveCount(0);
  });

  test("a network reset shows the generic banner; Retry succeeds with no duplicated user bubble", async ({
    page,
  }) => {
    await page.goto("/");
    await page.route("**/api/chat", (route) => route.abort("connectionreset"));
    await sendText(page, "Hello");
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    await expect(retryButton(page)).toBeVisible();

    await page.unroute("**/api/chat");
    await retryButton(page).click();
    await ttftOf(assistantBubbles(page));
    await waitUntilIdle(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(1);
    await expect(assistantBubbles(page)).toHaveCount(1);
  });

  test("[[error]] keeps the partial text under the generic banner; Retry streams the full answer", async ({
    page,
  }) => {
    await page.goto("/");
    // The server fails each [[error]] prompt text only once per process, so make it unique.
    await sendText(page, `[[error]] ${randomUUID()}`);
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    const bubble = assistantBubbles(page);
    await expect(answerText(bubble)).toHaveText("This answer fails");
    // Spec §14 A-15: both Regenerate (under the partial answer) and the banner's Retry show at once.
    await expect(regenerateButtons(page)).toHaveCount(1);
    await expect(retryButton(page)).toHaveCount(1);

    await retryButton(page).click();
    await ttftOf(bubble);
    await waitUntilIdle(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(bubble).toHaveCount(1);
    await expect(answerText(bubble)).toHaveText(FULL_DEFAULT_ANSWER);
    await expect(userBubbles(page)).toHaveCount(1);
  });
});

test.describe("7. input and New chat", () => {
  test("whitespace-only input keeps Send disabled", async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("   \n\t  ");
    await expect(sendButton(page)).toBeDisabled();
    await composer(page).press("Enter");
    await expect(userBubbles(page)).toHaveCount(0);
  });

  test(`input over ${MAX_USER_CHARS} characters is truncated`, async ({ page }) => {
    await page.goto("/");
    await composer(page).fill("x".repeat(MAX_USER_CHARS + 100));
    expect((await composer(page).inputValue()).length).toBe(MAX_USER_CHARS);
  });

  test("pressing Enter twice within 50 ms sends exactly one request", async ({ page }) => {
    await page.goto("/");
    let posts = 0;
    page.on("request", (request) => {
      if (isChatPost(request)) posts++;
    });
    await composer(page).fill("Hello");
    await expect(composer(page)).toBeFocused();
    // The page records when each Enter was pressed (the keydown's timeStamp).
    await page.evaluate(() => {
      const pressedAt: number[] = [];
      Object.assign(window, { enterPressedAt: pressedAt });
      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter") pressedAt.push(event.timeStamp);
        },
        { capture: true },
      );
    });
    // Two trusted Enter presses sent as one burst, so the gap between them does not
    // depend on test-runner latency: two sequential keyboard.press() calls took up to
    // 30 ms under load. The browser still handles each keydown as its own task.
    const cdp = await page.context().newCDPSession(page);
    const enter = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
    const enterDown = { type: "keyDown", text: "\r", unmodifiedText: "\r", ...enter } as const;
    const enterUp = { type: "keyUp", ...enter } as const;
    await Promise.all([
      cdp.send("Input.dispatchKeyEvent", enterDown),
      cdp.send("Input.dispatchKeyEvent", enterUp),
      cdp.send("Input.dispatchKeyEvent", enterDown),
      cdp.send("Input.dispatchKeyEvent", enterUp),
    ]);
    const pressedAt = await page.evaluate(
      () => (window as unknown as { enterPressedAt: number[] }).enterPressedAt,
    );
    expect(pressedAt).toHaveLength(2);
    const gapMs = pressedAt[1] - pressedAt[0];
    annotate("double-enter-gap-ms", gapMs);
    expect(gapMs).toBeLessThan(50);

    await expect(stopButton(page)).toBeVisible();
    // Spec §6 "Regenerate is hidden while busy": no Regenerate button while streaming.
    await expect(regenerateButtons(page)).toHaveCount(0);
    await waitUntilIdle(page);
    expect(posts, "POST /api/chat requests").toBe(1);
    await expect(userBubbles(page)).toHaveCount(1);
    await expect(assistantBubbles(page)).toHaveCount(1);
    await ttftOf(assistantBubbles(page));
  });

  test("New chat clears the conversation and shows the empty state", async ({ page }) => {
    await page.goto("/");
    await sendText(page, "Hello");
    await ttftOf(assistantBubbles(page));
    await waitUntilIdle(page);

    await header(page).getByRole("button", { name: "New chat" }).click();
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    await expect(conversation(page)).toHaveCount(0);
    await expect(
      page.getByText("Try it: send a prompt → press Stop (or Esc) halfway → Regenerate", {
        exact: true,
      }),
    ).toBeVisible();
    for (const prompt of APPROVED_PROMPTS) {
      await expect(page.getByRole("button", { name: prompt, exact: true })).toBeVisible();
    }
  });
});

test.describe("8. failure modes", () => {
  test("timeout before the first token (abort chunk, no finish): generic banner with Retry, no Stopped row; Retry recovers", async ({
    page,
  }) => {
    await page.goto("/");
    // What the real route sends when streamText's firstChunkMs timeout fires (spec §2.3,
    // D-S-04): an `abort` chunk with no preceding text and no `finish`.
    await page.route("**/api/chat", (route) =>
      fulfillSse(
        route,
        sse([
          { type: "start" },
          {
            type: "abort",
            reason: `TimeoutError: First chunk timeout of ${FIRST_CHUNK_TIMEOUT_MS}ms exceeded`,
          },
        ]),
      ),
    );
    await sendText(page, "Hello");
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);
    await expect(retryButton(page)).toBeVisible();
    await expect(stoppedRow(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    await expect(statusRegion(page)).toHaveText("Response failed");

    await page.unroute("**/api/chat");
    await retryButton(page).click();
    await ttftOf(assistantBubbles(page));
    await waitUntilIdle(page);
    await expect(banner(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(1);
    await expect(answerText(assistantBubbles(page))).toHaveText(FULL_DEFAULT_ANSWER);
    await expect(userBubbles(page)).toHaveCount(1);
  });

  test("finishReason length shows 'Cut at demo length limit'", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/chat", (route) =>
      fulfillSse(route, textAnswer("A long answer that the demo cuts short.", "length")),
    );
    await sendText(page, "write 5000 words");
    const bubble = assistantBubbles(page);
    await waitUntilIdle(page);
    await expect(bubble.getByText("Cut at demo length limit", { exact: true })).toBeVisible();
    await expect(regenerateButtons(page)).toHaveCount(1);
    await expect(banner(page)).toHaveCount(0);
  });

  test("New chat while streaming aborts the request, shows the empty state and no late bubble appears", async ({
    page,
  }) => {
    await page.goto("/");
    let abortedRequests = 0;
    page.on("requestfailed", (request) => {
      if (isChatPost(request)) abortedRequests++;
    });

    await sendText(page, SLOW_PROMPT);
    await expect(assistantBubbles(page)).toHaveCount(1);

    await header(page).getByRole("button", { name: "New chat" }).click();
    await expect(conversation(page)).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    await expect(banner(page)).toHaveCount(0);
    await expect(sendButton(page)).toBeVisible();
    await expect(
      page.getByText("Try it: send a prompt → press Stop (or Esc) halfway → Regenerate", {
        exact: true,
      }),
    ).toBeVisible();

    // Past the mock's 600 ms first-token delay: the aborted stream never reaches the page.
    await page.waitForTimeout(1000);
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(assistantBubbles(page)).toHaveCount(0);
    expect(abortedRequests).toBe(1);

    await promptButton(page, 1).click();
    const ttftMs = await ttftOf(assistantBubbles(page));
    expectCalibrated(ttftMs);
    await stopButton(page).click();
  });

  test("New chat clears an error banner", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/chat", (route) => route.abort("connectionreset"));
    await sendText(page, "Hello");
    await expect(banner(page)).toContainText(GENERIC_ERROR_TEXT);

    await header(page).getByRole("button", { name: "New chat" }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(userBubbles(page)).toHaveCount(0);
    await expect(conversation(page)).toHaveCount(0);
    await expect(promptButton(page, 0)).toBeVisible();
  });

  test("20 messages disable the composer with the cap placeholder; New chat re-enables it", async ({
    page,
  }) => {
    await page.goto("/");
    const postedSizes: number[] = [];
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON() as ChatRequestBody;
      postedSizes.push(body.messages.length);
      await fulfillSse(route, textAnswer("ok"));
    });

    const roundTrips = MAX_MESSAGES / 2;
    for (let i = 0; i < roundTrips; i++) {
      await sendText(page, `message ${i + 1}`);
      await expect(assistantBubbles(page)).toHaveCount(i + 1);
      await waitUntilIdle(page);
    }
    expect(Math.max(...postedSizes), "largest posted messages.length").toBeLessThanOrEqual(
      MAX_MESSAGES,
    );

    await expect(composer(page)).toBeDisabled();
    await expect(composer(page)).toHaveAttribute("placeholder", CAP_TEXT);
    await expect(sendButton(page)).toBeDisabled();
    // Regenerate still works at the cap: it replaces the last answer, not a new turn.
    await expect(regenerateButtons(page)).toHaveCount(1);

    await header(page).getByRole("button", { name: "New chat" }).click();
    await expect(composer(page)).toBeEnabled();
    await expect(composer(page)).toHaveAttribute("placeholder", COMPOSER_PLACEHOLDER);
  });

  test.describe("touch device", () => {
    test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

    test("touch: no autofocus, no refocus after Stop, 44 px targets, no horizontal scroll", async ({
      page,
    }) => {
      await page.goto("/");
      const isCoarsePointer = await page.evaluate(
        () => window.matchMedia("(pointer: coarse)").matches,
      );
      expect(isCoarsePointer).toBe(true);
      await expect(composer(page)).not.toBeFocused();

      const heights: Record<string, number> = {};
      for (const name of [...SUGGESTED_PROMPTS, "New chat"]) {
        heights[name] = (await page.getByRole("button", { name, exact: true }).boundingBox())!
          .height;
      }
      for (const height of Object.values(heights)) expect(height).toBeGreaterThanOrEqual(44);

      // One column below sm: the second suggested prompt sits directly under the first.
      const first = (await promptButton(page, 0).boundingBox())!;
      const second = (await promptButton(page, 1).boundingBox())!;
      expect(second.y).toBeGreaterThan(first.y);
      expect(second.x).toBe(first.x);

      await composer(page).tap();
      await composer(page).fill(SLOW_PROMPT);
      await composer(page).blur();
      const sendBox = (await sendButton(page).boundingBox())!;
      expect(sendBox.height).toBeGreaterThanOrEqual(44);

      await sendButton(page).tap();
      await expect(assistantBubbles(page)).toHaveCount(1);
      const stopBox = (await stopButton(page).boundingBox())!;
      expect(stopBox.height).toBeGreaterThanOrEqual(44);

      await stopButton(page).tap();
      await expect(assistantBubbles(page).getByText("Stopped", { exact: true })).toBeVisible();
      await expect(composer(page)).not.toBeFocused();

      const regenBox = (await regenerateButtons(page).boundingBox())!;
      expect(regenBox.height).toBeGreaterThanOrEqual(44);

      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    });

    // A rotation that makes the question above take fewer lines: Chromium's scroll anchoring
    // moves the view up by the lines saved, and if a script reads the layout before the next
    // frame, that scroll event reaches the hook before the resize observer pins the view, so
    // following stops. The hook turns anchoring off while following (spec §14 A-22), so the view
    // never moves up. The resize is sent through CDP together with the read, so the read lands
    // before the frame.
    test("touch: a rotation never moves a followed view up", async ({ page }) => {
      await page.goto("/");
      await composer(page).tap();
      await composer(page).fill(
        `Explain, in one short paragraph, what streaming means for a chat interface. ${SLOW_PROMPT}`,
      );
      await sendButton(page).tap();
      await waitUntilIdle(page);
      await expect.poll(() => distanceFromBottom(page)).toBeLessThanOrEqual(2);
      const before = (await scrollState(page)).scrollTop;

      await scroller(page).evaluate((element) => {
        (window as unknown as { scroller: Element }).scroller = element;
      });
      const cdp = await page.context().newCDPSession(page);
      const scale = await page.evaluate(() => window.devicePixelRatio);
      const [, read] = await Promise.all([
        cdp.send("Emulation.setDeviceMetricsOverride", {
          width: 812,
          height: 375,
          deviceScaleFactor: scale,
          mobile: true,
        }),
        cdp.send("Runtime.evaluate", {
          expression: "(window.scroller).scrollTop",
          returnByValue: true,
        }),
      ]);
      expect(read.result.value, "scrollTop at the first layout after rotating").toBeGreaterThanOrEqual(
        before,
      );
      await expect
        .poll(() => distanceFromBottom(page), { message: "distance from bottom after rotating" })
        .toBeLessThanOrEqual(2);
      await expect(jumpButton(page)).toHaveCount(0);
    });
  });
});
