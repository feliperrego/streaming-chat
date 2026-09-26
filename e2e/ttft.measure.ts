import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { release } from "node:os";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { SUGGESTED_PROMPTS } from "@/lib/chat/config";
import {
  MEASURE_REQUESTS,
  assertSafeToWrite,
  buildMeasurement,
  measurementPath,
  readmeLines,
  type MeasurementMeta,
} from "@/lib/measure/ttft-stats";

// Production TTFT measurement (spec §5.2). Runs only in the `measure` project:
//   MEASURE_URL=<production URL> MEASURE_LOCATION='<city, connection>' pnpm exec playwright test --project=measure
// 15 sequential requests stay under the 20/hour limit: run it in its own hour.

/** Longest wait for one request's first token: the route's 20 s firstChunkMs, plus margin. */
const FIRST_TOKEN_TIMEOUT_MS = 30_000;
/** Pause after each Stop, so requests never overlap (spec §5.2). */
const PAUSE_AFTER_STOP_MS = 2_000;

type DeployedPage = { model: string; commit: string; isMock: boolean };

async function readHeader(page: Page): Promise<DeployedPage> {
  const header = page.locator("header[data-model]");
  await expect(header).toBeVisible();
  return {
    model: ((await header.getAttribute("data-model")) ?? "").trim(),
    commit: (await header.getAttribute("data-commit")) ?? "",
    isMock: (await header.getAttribute("data-mock")) !== null,
  };
}

/** Loads the page in a fresh context and checks the guards; records what is deployed. */
async function readDeployment(
  browser: Browser,
): Promise<DeployedPage & { userAgent: string; browserVersion: string; platform: string }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/");
    const deployed = await readHeader(page);
    if (deployed.isMock) {
      throw new Error("Refusing to measure: the page is in mock mode (data-mock).");
    }
    if (deployed.model === "") throw new Error("Refusing to measure: data-model is empty.");
    return {
      ...deployed,
      userAgent: await page.evaluate(() => navigator.userAgent),
      browserVersion: browser.version(),
      platform: `${process.platform} ${release()}`,
    };
  } finally {
    await context.close();
  }
}

/**
 * One request in a fresh context: click the prompt, read data-ttft-ms, click Stop,
 * wait. Returns the TTFT in ms, or the reason the run must stop.
 */
async function measureOnce(
  browser: Browser,
  index: number,
  expected: DeployedPage,
): Promise<{ ttftMs: number } | { abortReason: string }> {
  const request = index + 1;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/");
    const deployed = await readHeader(page);
    if (deployed.model !== expected.model || deployed.commit !== expected.commit) {
      return { abortReason: `the deployment changed before request ${request}` };
    }

    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/api/chat",
      { timeout: FIRST_TOKEN_TIMEOUT_MS },
    );
    await page
      .getByRole("button", {
        name: SUGGESTED_PROMPTS[index % SUGGESTED_PROMPTS.length],
        exact: true,
      })
      .click();
    const status = (await response).status();
    if (status === 429) return { abortReason: `HTTP 429 on request ${request}` };
    if (status !== 200) return { abortReason: `HTTP ${status} on request ${request}` };

    const answer = page.locator('[data-message-role="assistant"][data-ttft-ms]');
    try {
      await expect(answer).toHaveCount(1, { timeout: FIRST_TOKEN_TIMEOUT_MS });
    } catch {
      return {
        abortReason: `no first token within ${FIRST_TOKEN_TIMEOUT_MS} ms on request ${request}`,
      };
    }
    const ttftMs = Number(await answer.getAttribute("data-ttft-ms"));

    // Stop saves tokens and exercises Stop in production; a finished answer has no Stop.
    const stop = page.getByRole("button", { name: "Stop generating" });
    if (await stop.isVisible()) {
      await stop.click({ timeout: 5_000 }).catch(async (error: unknown) => {
        // The answer can finish between the check and the click; only then is a missed Stop fine.
        if (!(await page.getByRole("button", { name: "Send message" }).isVisible())) throw error;
      });
    }
    await page.waitForTimeout(PAUSE_AFTER_STOP_MS);
    return { ttftMs };
  } finally {
    await context.close();
  }
}

test("time to first token on the deployed demo", async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(5 * 60_000);
  const location = process.env.MEASURE_LOCATION?.trim() ?? "";
  if (location === "") throw new Error("Set MEASURE_LOCATION='<city, connection>'.");
  if (baseURL === undefined) throw new Error("Set MEASURE_URL to the deployed URL.");

  const date = new Date().toISOString();
  // Computed from the run's start date, before spending any of the 20/hour quota: a
  // successful run for today would refuse to write anyway, so fail fast instead of
  // running 15 requests that can never be saved. An aborted run's file is always
  // safe (it is time-stamped), so only the success path needs checking here.
  const successPath = measurementPath({ date, aborted: false });
  const successFile = path.resolve(testInfo.project.testDir, "..", successPath);
  assertSafeToWrite(successPath, false, existsSync(successFile));

  const deployed = await readDeployment(browser);
  const meta: MeasurementMeta = {
    date,
    url: baseURL,
    model: deployed.model,
    location,
    userAgent: deployed.userAgent,
    browserVersion: deployed.browserVersion,
    platform: deployed.platform,
    commit: deployed.commit,
  };

  const requestsMs: number[] = [];
  let abortReason: string | undefined;
  for (let index = 0; index < MEASURE_REQUESTS; index++) {
    let result: Awaited<ReturnType<typeof measureOnce>>;
    try {
      result = await measureOnce(browser, index, deployed);
    } catch (error) {
      result = { abortReason: `request ${index + 1} failed: ${String(error)}` };
    }
    if ("abortReason" in result) {
      abortReason = result.abortReason;
      break;
    }
    requestsMs.push(result.ttftMs);
  }

  const measurement = buildMeasurement(meta, requestsMs, abortReason);
  const relativePath = measurementPath(measurement);
  const file = path.resolve(testInfo.project.testDir, "..", relativePath);
  // An aborted run always writes its own .aborted.json file; only a successful
  // run can collide with — and must refuse to overwrite — an earlier good run.
  assertSafeToWrite(relativePath, measurement.aborted, existsSync(file));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(measurement, null, 2)}\n`);

  if (measurement.aborted) {
    throw new Error(
      `Measurement aborted: ${measurement.abortReason}. Wrote ${relativePath}; no README lines.`,
    );
  }
  console.log(`Wrote ${relativePath}. README lines:\n\n${readmeLines(measurement).join("\n")}\n`);
});
