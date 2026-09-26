/**
 * Pure helpers for the production TTFT measurement (spec §5.2, §5.4).
 * e2e/ttft.measure.ts collects the samples in a browser; these functions turn
 * them into the committed JSON and the two README lines, so the published
 * number is never typed by hand.
 */

/** Sequential requests per run: request 1 is reported apart, 2..15 give n = 14. */
export const MEASURE_REQUESTS = 15;

/** Where the run happened and what it measured, read from the deployed page. */
export type MeasurementMeta = {
  /** Start of the run, ISO 8601 in UTC. Its first 10 characters name the file. */
  date: string;
  url: string;
  /** `data-model` of the deployed page's header. */
  model: string;
  /** MEASURE_LOCATION, e.g. "Recife, home fibre". */
  location: string;
  userAgent: string;
  /** `browser.version()` of the Playwright browser that ran the measurement. */
  browserVersion: string;
  /** `process.platform`, plus `os.release()`, e.g. "darwin 23.4.0". */
  platform: string;
  /** `data-commit` of the deployed page's header. */
  commit: string;
};

export type TtftSummary = {
  /** Request 1 of the run, reported apart and never called "cold". */
  firstRequestMs: number;
  /** Requests 2..N, in request order. */
  samplesMs: number[];
  n: number;
  median: number;
  min: number;
  max: number;
};

export type CompletedMeasurement = MeasurementMeta & { aborted: false } & TtftSummary;

/** A run that stopped early (a 429, a failed request): what was collected, and no statistics. */
export type AbortedMeasurement = MeasurementMeta & {
  aborted: true;
  abortReason: string;
  firstRequestMs: number | null;
  samplesMs: number[];
  n: number;
  median: null;
  min: null;
  max: null;
};

export type TtftMeasurement = CompletedMeasurement | AbortedMeasurement;

/** Median of the values; the mean of the two middle values when their count is even. */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median() needs at least one value.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Splits a run into request 1 and the samples (requests 2..N), and computes the
 * median (rounded to whole ms), min and max over the samples only. No tail
 * percentile: n stays below 20 (spec §5.2, C-11).
 */
export function summarize(requestsMs: readonly number[]): TtftSummary {
  if (requestsMs.length < 2) {
    throw new RangeError("summarize() needs request 1 and at least one more request.");
  }
  const [firstRequestMs, ...samplesMs] = requestsMs;
  return {
    firstRequestMs,
    samplesMs,
    n: samplesMs.length,
    median: Math.round(median(samplesMs)),
    min: Math.min(...samplesMs),
    max: Math.max(...samplesMs),
  };
}

/** The UTC day of an ISO timestamp, YYYY-MM-DD. */
export function measurementDay(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(isoDate)) throw new RangeError(`Not an ISO date: ${isoDate}`);
  return isoDate.slice(0, 10);
}

/**
 * Repo-relative path of the run's JSON. A successful run writes to
 * measurements/ttft-YYYY-MM-DD.json; an aborted run writes to a distinct
 * `.aborted.json` file, so an aborted run can never collide with — or overwrite —
 * a good run's file for the same day (spec §5.4).
 */
export function measurementPath(measurement: Pick<TtftMeasurement, "date" | "aborted">): string {
  const day = measurementDay(measurement.date);
  return measurement.aborted
    ? `measurements/ttft-${day}.aborted.json`
    : `measurements/ttft-${day}.json`;
}

/**
 * Guards a write against clobbering a previous successful run: an aborted run
 * is always safe to write (its own `.aborted.json` file), but a successful run
 * must refuse to overwrite an existing non-aborted file for the same date.
 * Pure and unit-tested: the caller passes whether the target file already
 * exists (a plain fs check) rather than this function touching the filesystem.
 */
export function assertSafeToWrite(relativePath: string, aborted: boolean, exists: boolean): void {
  if (aborted || !exists) return;
  throw new Error(
    `${relativePath} already exists from an earlier successful run. ` +
      "Rename or delete it before running the measurement again.",
  );
}

/**
 * The JSON record of a run. With `abortReason`, the run is aborted: it keeps
 * what was collected and has no statistics. Without it, every request of the
 * run must be present.
 */
export function buildMeasurement(
  meta: MeasurementMeta,
  requestsMs: readonly number[],
  abortReason?: string,
): TtftMeasurement {
  if (abortReason !== undefined) {
    const [firstRequestMs = null, ...samplesMs] = requestsMs;
    return {
      ...meta,
      aborted: true,
      abortReason,
      firstRequestMs,
      samplesMs,
      n: samplesMs.length,
      median: null,
      min: null,
      max: null,
    };
  }
  if (requestsMs.length !== MEASURE_REQUESTS) {
    throw new RangeError(
      `A complete run has ${MEASURE_REQUESTS} requests; got ${requestsMs.length}.`,
    );
  }
  return { ...meta, aborted: false, ...summarize(requestsMs) };
}

/**
 * README line 1 and the first line of "How it's measured" (spec §5.4).
 * An aborted run has no README lines.
 */
export function readmeLines(measurement: TtftMeasurement): [string, string] {
  if (measurement.aborted) {
    throw new Error(`An aborted run has no README lines (${measurement.abortReason}).`);
  }
  const { median: medianMs, n, min, max, model, location, firstRequestMs, date } = measurement;
  return [
    `# Streaming Chat — median time to first token ${medianMs} ms in production`,
    `n=${n}, min ${min} / max ${max}, ${model}, measured from ${location}, ${measurementDay(date)}; ` +
      `first request of the run: ${firstRequestMs} ms · [raw data](${measurementPath(measurement)})`,
  ];
}
