import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // CI already ran `pnpm build` with AI_MOCK=1; locally, build first.
    // Both paths serve a production build, never `next dev` (spec §7.2).
    command: process.env.CI ? "pnpm start" : "pnpm build && pnpm start",
    url: `${baseURL}/api/health`,
    // Merged over process.env. Empty Upstash vars force the limiter off even
    // when a local .env* file holds real ones.
    env: {
      PORT: String(PORT),
      AI_MOCK: "1",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
    },
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
