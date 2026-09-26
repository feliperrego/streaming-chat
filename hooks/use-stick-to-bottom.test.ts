import { describe, expect, it } from "vitest";
import { isNearBottom } from "./use-stick-to-bottom";

// A 1000 px tall content in a 400 px viewport: the bottom is at scrollTop 600.
const SCROLL_HEIGHT = 1000;
const CLIENT_HEIGHT = 400;
const at = (distanceFromBottom: number) => SCROLL_HEIGHT - CLIENT_HEIGHT - distanceFromBottom;

describe("isNearBottom", () => {
  it("is true at the bottom", () => {
    expect(isNearBottom(at(0), SCROLL_HEIGHT, CLIENT_HEIGHT)).toBe(true);
  });

  it("is true at 79 and 80 px from the bottom", () => {
    expect(isNearBottom(at(79), SCROLL_HEIGHT, CLIENT_HEIGHT)).toBe(true);
    expect(isNearBottom(at(80), SCROLL_HEIGHT, CLIENT_HEIGHT)).toBe(true);
  });

  it("is false at 81 px from the bottom", () => {
    expect(isNearBottom(at(81), SCROLL_HEIGHT, CLIENT_HEIGHT)).toBe(false);
  });

  it("handles fractional scrollTop (browser zoom)", () => {
    expect(isNearBottom(at(80.5), SCROLL_HEIGHT, CLIENT_HEIGHT)).toBe(false);
    expect(isNearBottom(at(79.5), SCROLL_HEIGHT, CLIENT_HEIGHT)).toBe(true);
  });

  it("is true when the content is shorter than the viewport", () => {
    // browsers report scrollHeight === clientHeight when nothing overflows
    expect(isNearBottom(0, 300, 300)).toBe(true);
    expect(isNearBottom(0, 200, 300)).toBe(true);
  });

  it("accepts a custom threshold", () => {
    expect(isNearBottom(at(10), SCROLL_HEIGHT, CLIENT_HEIGHT, 5)).toBe(false);
    expect(isNearBottom(at(5), SCROLL_HEIGHT, CLIENT_HEIGHT, 5)).toBe(true);
  });
});
