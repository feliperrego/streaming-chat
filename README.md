# Streaming Chat — median time to first token 1340 ms in production

[![CI](https://github.com/feliperrego/streaming-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/feliperrego/streaming-chat/actions/workflows/ci.yml) · **[Live demo](https://streaming-chat-rho.vercel.app)** · Part of the [feliperrego.com](https://feliperrego.com) portfolio

## Problem
Chat interfaces feel slow when the answer appears only at the end. This demo streams every answer token by token, lets you stop or regenerate it at any moment, and shows how long the first token took.

## Decisions
- **Chat UI hand-built on shadcn/ui** instead of AI Elements: the streaming states (Stop, Regenerate, autoscroll, time to first token) are the skill this project shows, so none of them comes prebuilt.
- **Time to first token measured in the browser on the live demo** instead of server-side first-chunk time or a Node script: it is the delay a visitor actually feels, and the live caption uses the same code path as the number above.

## How it's measured
n=14, min 1222 / max 1582, openai/gpt-6-luna, measured from Fortaleza, BR — fibra, 2026-09-28; first request of the run: 1090 ms · [raw data](measurements/ttft-2026-09-28.json)
From the click to the first character of a new answer rendered, via `MEASURE_URL=<url> MEASURE_LOCATION='<city, connection>' pnpm exec playwright test --project=measure`.
CI calibrates the instrument against a mock with a fixed 600 ms first token (must read 600 ms to under 2000 ms). Stop ends the stream end to end up to the AI Gateway (logged as 499), but the Gateway still completes and bills the provider's generation, so cost is bounded by the 1024-token cap ([spec §9](docs/specs/2026-09-25-streaming-chat-design.md#9-manual-checks-in-production-once-before-publishing)).
Caveats: one client location, n = 14 is a snapshot not a benchmark, headless desktop Chromium, single-turn chats, a whole-stack number not comparable with provider-advertised TTFT.

## Run it
`pnpm install && pnpm dev:mock` (no API key needed)

## Stack
Next.js · AI SDK · AI Gateway · shadcn/ui · Upstash · Playwright
