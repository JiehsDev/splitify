import { describe, expect, it } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("parses ranges and singles", () => {
    expect(parseRange("1-3,5", 10).pages).toEqual([1, 2, 3, 5]);
  });
  it("tolerates spaces", () => {
    expect(parseRange(" 2 - 4 ,  7 ", 10).pages).toEqual([2, 3, 4, 7]);
  });
  it("dedupes and sorts", () => {
    expect(parseRange("5,1-3,2", 10).pages).toEqual([1, 2, 3, 5]);
  });
  it("skips out-of-range with a warning, not an error", () => {
    const r = parseRange("1,99", 10);
    expect(r.pages).toEqual([1]);
    expect(r.error).toBeUndefined();
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("clamps ranges that run past the end", () => {
    const r = parseRange("8-12", 10);
    expect(r.pages).toEqual([8, 9, 10]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("errors on garbage and returns no pages", () => {
    const r = parseRange("abc", 10);
    expect(r.pages).toEqual([]);
    expect(r.error).toBeTruthy();
  });
  it("errors on empty input", () => {
    expect(parseRange("  ", 10).error).toBeTruthy();
  });
  it("handles reversed ranges with a warning", () => {
    const r = parseRange("5-3", 10);
    expect(r.pages).toEqual([3, 4, 5]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
