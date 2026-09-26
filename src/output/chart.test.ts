import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDuration,
  formatRate,
  formatValue,
  linearScale,
  nearestIndex,
  niceTicks,
} from "./chart";

describe("niceTicks", () => {
  it("picks round steps covering the range", () => {
    expect(niceTicks(0, 1)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0.13, 0.87)).toEqual([0.2, 0.4, 0.6, 0.8]);
    expect(niceTicks(0, 2300)).toEqual([0, 1000, 2000]);
  });

  it("handles a flat series and reversed input", () => {
    expect(niceTicks(5, 5).length).toBeGreaterThan(1);
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });

  it("avoids float noise in labels", () => {
    expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(niceTicks(0.001, 0.0035)).toEqual([0.001, 0.002, 0.003]);
  });
});

describe("format helpers", () => {
  it("formats values compactly", () => {
    expect(formatValue(0.234)).toBe("0.234");
    expect(formatValue(0.00012)).toBe("1.2e-4");
    expect(formatValue(12345)).toBe("12.3k");
    expect(formatValue(2_500_000)).toBe("2.5M");
    expect(formatValue(3)).toBe("3");
    expect(formatValue(0)).toBe("0");
  });

  it("formats durations, rates and bytes", () => {
    expect(formatDuration(4)).toBe("4s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3723)).toBe("1h 02m");
    expect(formatDuration(null)).toBe("–");
    expect(formatRate(12.34)).toBe("12.3 it/s");
    expect(formatRate(0.5)).toBe("2.0 s/it");
    expect(formatBytes(3.2 * 2 ** 30)).toBe("3.2");
    expect(formatBytes(24 * 2 ** 30)).toBe("24");
  });
});

describe("scales", () => {
  it("maps a domain onto a range", () => {
    const s = linearScale([0, 10], [0, 100]);
    expect(s(5)).toBe(50);
    expect(linearScale([3, 3], [0, 10])(3)).toBe(0);
  });

  it("finds the nearest index", () => {
    expect(nearestIndex([0, 10, 20], 12)).toBe(1);
    expect(nearestIndex([0, 10, 20], 16)).toBe(2);
    expect(nearestIndex([0, 10, 20], -5)).toBe(0);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});
