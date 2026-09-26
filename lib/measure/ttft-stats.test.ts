import { describe, expect, it } from "vitest";
import {
  MEASURE_REQUESTS,
  assertSafeToWrite,
  buildMeasurement,
  measurementDay,
  measurementPath,
  median,
  readmeLines,
  summarize,
  type MeasurementMeta,
} from "./ttft-stats";

const META: MeasurementMeta = {
  date: "2026-10-02T14:03:59.123Z",
  url: "https://streaming-chat.example.com",
  model: "provider/model-x",
  location: "Recife, home fibre",
  userAgent: "Mozilla/5.0 (test)",
  browserVersion: "120.0.6099.109",
  platform: "darwin 23.4.0",
  commit: "abc1234",
};

// Request 1 is 1500 ms; requests 2..15 are 14 samples. Sorted, the middle two are
// 705 and 710, so the median is 707.5, reported as 708.
const RUN = [1500, 690, 720, 700, 650, 900, 710, 640, 760, 705, 695, 730, 800, 715, 680];

describe("median", () => {
  it("takes the middle value of an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values of an even count", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("does not reorder its input", () => {
    const values = [3, 1, 2];
    median(values);
    expect(values).toEqual([3, 1, 2]);
  });

  it("rejects an empty list", () => {
    expect(() => median([])).toThrow(RangeError);
  });
});

describe("summarize", () => {
  it("reports request 1 apart and computes median, min and max over requests 2..15", () => {
    expect(summarize(RUN)).toEqual({
      firstRequestMs: 1500,
      samplesMs: RUN.slice(1),
      n: 14,
      median: 708,
      min: 640,
      max: 900,
    });
  });

  it("rounds a half-ms median to a whole ms", () => {
    expect(summarize([999, 600, 601]).median).toBe(601);
    expect(summarize([999, 600, 603]).median).toBe(602);
  });

  it("ignores request 1 even when it is the extreme", () => {
    const summary = summarize([5, 700, 800]);
    expect(summary.min).toBe(700);
    expect(summary.max).toBe(800);
  });

  it("needs at least two requests", () => {
    expect(() => summarize([700])).toThrow(RangeError);
  });
});

describe("measurementDay and measurementPath", () => {
  it("use the UTC day of the ISO date", () => {
    expect(measurementDay("2026-10-02T23:59:59.999Z")).toBe("2026-10-02");
    expect(measurementPath({ date: "2026-10-02T00:00:00.000Z", aborted: false })).toBe(
      "measurements/ttft-2026-10-02.json",
    );
  });

  it("reject a value that is not an ISO timestamp", () => {
    expect(() => measurementDay("02/10/2026")).toThrow(RangeError);
  });

  it("names an aborted run's file with the run's start time, so two aborted runs on the same day never collide", () => {
    expect(measurementPath({ date: "2026-10-02T00:00:00.000Z", aborted: true })).toBe(
      "measurements/ttft-2026-10-02-000000.aborted.json",
    );
    expect(measurementPath({ date: "2026-10-02T14:03:59.123Z", aborted: true })).toBe(
      "measurements/ttft-2026-10-02-140359.aborted.json",
    );
  });
});

describe("assertSafeToWrite", () => {
  it("allows a successful run when no file exists yet for that date", () => {
    expect(() =>
      assertSafeToWrite("measurements/ttft-2026-10-02.json", false, false),
    ).not.toThrow();
  });

  it("refuses a successful run that would overwrite an existing non-aborted file", () => {
    expect(() => assertSafeToWrite("measurements/ttft-2026-10-02.json", false, true)).toThrow(
      /measurements\/ttft-2026-10-02\.json already exists[\s\S]*[Rr]ename or delete/,
    );
  });

  it("always allows an aborted run, even when its file already exists", () => {
    expect(() =>
      assertSafeToWrite("measurements/ttft-2026-10-02.aborted.json", true, true),
    ).not.toThrow();
  });
});

describe("buildMeasurement", () => {
  it("builds a complete run with every metadata field", () => {
    expect(RUN).toHaveLength(MEASURE_REQUESTS);
    expect(buildMeasurement(META, RUN)).toEqual({
      date: "2026-10-02T14:03:59.123Z",
      url: "https://streaming-chat.example.com",
      model: "provider/model-x",
      location: "Recife, home fibre",
      userAgent: "Mozilla/5.0 (test)",
      browserVersion: "120.0.6099.109",
      platform: "darwin 23.4.0",
      commit: "abc1234",
      aborted: false,
      firstRequestMs: 1500,
      samplesMs: RUN.slice(1),
      n: 14,
      median: 708,
      min: 640,
      max: 900,
    });
  });

  it("refuses a complete run with fewer than 15 requests", () => {
    expect(() => buildMeasurement(META, RUN.slice(0, 14))).toThrow(RangeError);
  });

  it("builds an aborted run with what was collected and no statistics", () => {
    expect(buildMeasurement(META, [1500, 690, 720], "HTTP 429 on request 4")).toEqual({
      ...META,
      aborted: true,
      abortReason: "HTTP 429 on request 4",
      firstRequestMs: 1500,
      samplesMs: [690, 720],
      n: 2,
      median: null,
      min: null,
      max: null,
    });
  });

  it("builds an aborted run that failed on request 1", () => {
    expect(buildMeasurement(META, [], "HTTP 429 on request 1")).toMatchObject({
      aborted: true,
      firstRequestMs: null,
      samplesMs: [],
      n: 0,
    });
  });

  it("serialises with the metadata first and the statistics last", () => {
    expect(Object.keys(buildMeasurement(META, RUN))).toEqual([
      "date",
      "url",
      "model",
      "location",
      "userAgent",
      "browserVersion",
      "platform",
      "commit",
      "aborted",
      "firstRequestMs",
      "samplesMs",
      "n",
      "median",
      "min",
      "max",
    ]);
  });
});

describe("readmeLines", () => {
  it("prints README line 1 and the first line of How it's measured (spec §5.4)", () => {
    expect(readmeLines(buildMeasurement(META, RUN))).toEqual([
      "# Streaming Chat — median time to first token 708 ms in production",
      "n=14, min 640 / max 900, provider/model-x, measured from Recife, home fibre, 2026-10-02; " +
        "first request of the run: 1500 ms · [raw data](measurements/ttft-2026-10-02.json)",
    ]);
  });

  it("refuses an aborted run", () => {
    expect(() => readmeLines(buildMeasurement(META, [1500], "HTTP 429 on request 2"))).toThrow(
      /aborted run has no README lines/,
    );
  });
});
