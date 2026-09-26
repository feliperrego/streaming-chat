# Streaming Chat — median time to first token: pending the first production measurement

[![CI](https://github.com/feliperrego/streaming-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/feliperrego/streaming-chat/actions/workflows/ci.yml) · **[Live demo](<demo URL>)** · Part of the [feliperrego.com](https://feliperrego.com) portfolio

## Problem
Chat interfaces feel slow when the answer appears only at the end, and they waste money when "Stop" only stops the screen. This demo streams every answer token by token, lets you stop or regenerate it at any moment, and shows how long the first token took.

## Decisions
- **Chat UI hand-built on shadcn/ui** instead of AI Elements: the streaming states (Stop, Regenerate, autoscroll, time to first token) are the skill this project shows, so none of them comes prebuilt.
- **Time to first token measured in the browser on the live demo** instead of server-side first-chunk time or a Node script: it is the delay a visitor actually feels, and the live caption uses the same code path as the number above.

## How it's measured
Pending: the first production run prints this line (n, min/max, model, location, date, link to the raw data).
From the click to the first character of a new answer on screen, via `MEASURE_URL=<url> MEASURE_LOCATION='<city, connection>' pnpm exec playwright test --project=measure`.
CI calibrates the instrument against a mock with a fixed 600 ms first token (must read 600–2000 ms); Stop is verified to cancel the model call ([spec §9](docs/specs/2026-09-25-streaming-chat-design.md)).
Caveats: one client location, n = 14 is a snapshot not a benchmark, headless desktop Chromium, single-turn chats, a whole-stack number not comparable with provider-advertised TTFT.

## Run it
`pnpm install && pnpm dev:mock` (no API key needed)

## Stack
Next.js · AI SDK · AI Gateway · shadcn/ui · Upstash · Playwright
