import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDuration,
  formatRate,
  formatValue,
  alignSeries,
  gapPath,
  integerTicks,
  linearScale,
  linePath,
  clampUnit,
  fitRange,
  isBoundedMetric,
  logTicks,
  nearestIndex,
  niceTicks,
  repelLabels,
  robustRange,
  spacedTicks,
  valueTicks,
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
    expect(formatRate({ perSecond: 12.34, unit: "it" })).toBe("12.3 it/s");
    expect(formatRate({ perSecond: 0.5, unit: "it" })).toBe("2.0 s/it");
    expect(formatRate({ perSecond: 4.2, unit: "epoch" })).toBe("4.2 ep/s");
    expect(formatRate({ perSecond: 0.25, unit: "epoch" })).toBe("4.0 s/ep");
    expect(formatRate(null)).toBe("–");
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

describe("integerTicks", () => {
  it("includes both ends and only whole numbers between", () => {
    expect(integerTicks(1, 60, 4)).toEqual([1, 20, 40, 60]);
    expect(integerTicks(0, 3, 4)).toEqual([0, 1, 2, 3]);
    expect(integerTicks(5, 5)).toEqual([5]);
  });
});

describe("valueTicks", () => {
  it("labels the true min and max and keeps inner ticks clear of them", () => {
    const ticks = valueTicks(0.2899, 0.4664, 3);
    expect(ticks[0]).toBe(0.2899);
    expect(ticks[ticks.length - 1]).toBe(0.4664);
    for (const t of ticks.slice(1, -1)) {
      expect(t).toBeGreaterThan(0.2899 + 0.0212);
      expect(t).toBeLessThan(0.4664 - 0.0212);
    }
  });

  it("covers a range whose data exceeds the nice ticks", () => {
    const ticks = valueTicks(0.71, 0.93, 3);
    expect(ticks).toContain(0.93);
    expect(ticks).toContain(0.71);
  });
});

describe("alignSeries and gapPath", () => {
  const x = linearScale([0, 10], [0, 100]);
  const y = linearScale([0, 1], [100, 0]);

  it("interpolates the second series at the first series' steps over the overlap", () => {
    const a = [
      { step: 0, value: 0 },
      { step: 5, value: 0.5 },
      { step: 10, value: 1 },
    ];
    const b = [
      { step: 2, value: 1 },
      { step: 8, value: 0 },
    ];
    const pairs = alignSeries(a, b);
    expect(pairs.map(([p]) => p.step)).toEqual([5]);
    expect(pairs[0]?.[1].value).toBeCloseTo(0.5);
  });

  it("returns an empty path when the lines do not overlap or are single points", () => {
    expect(gapPath([{ step: 0, value: 0 }], [{ step: 0, value: 1 }], x, y)).toBe("");
    expect(
      gapPath(
        [
          { step: 0, value: 0 },
          { step: 1, value: 0 },
        ],
        [
          { step: 5, value: 1 },
          { step: 6, value: 1 },
        ],
        x,
        y,
      ),
    ).toBe("");
  });

  it("closes a band between two lines", () => {
    const a = [
      { step: 0, value: 0 },
      { step: 10, value: 0 },
    ];
    const b = [
      { step: 0, value: 1 },
      { step: 10, value: 1 },
    ];
    expect(gapPath(a, b, x, y)).toBe("M0.0 100.0 L100.0 100.0 L100.0 0.0 L0.0 0.0 Z");
  });

  it("linePath draws in pixel space", () => {
    expect(
      linePath(
        [
          { step: 0, value: 0 },
          { step: 10, value: 1 },
        ],
        x,
        y,
      ),
    ).toBe("M0.0 100.0 L100.0 0.0");
  });
});

describe("robustRange", () => {
  it("ignores a single spike so the rest of the curve keeps its room", () => {
    const values = [6.78, 1.07, 0.9, 0.6, 0.3, 0.12, 0.08, 0.05, 0.06, 0.09, 0.2, 0.4];
    const r = robustRange(values);
    expect(r.clipped).toBe(true);
    expect(r.max).toBeLessThan(3);
    expect(r.min).toBeLessThanOrEqual(0.05);
  });

  it("keeps the full range when nothing sticks out", () => {
    const r = robustRange([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    expect(r.clipped).toBe(false);
    expect(r.min).toBeLessThanOrEqual(0.1);
    expect(r.max).toBeGreaterThanOrEqual(0.8);
  });

  it("does not pad a non-negative metric below zero", () => {
    expect(robustRange([0.02, 0.1, 0.3, 0.5, 0.7, 0.9]).min).toBe(0);
    expect(robustRange([-0.5, 0.1, 0.3, 0.5, 0.7, 0.9], 0.08, Infinity).min).toBeLessThan(-0.5);
  });

  it("never clips with fewer than six points", () => {
    expect(robustRange([100, 1, 1, 1]).clipped).toBe(false);
  });
});

describe("repelLabels", () => {
  it("pushes overlapping labels apart and keeps them inside the plot", () => {
    const out = repelLabels([150, 152, 20], 12, 10, 160);
    const sorted = [...out].sort((a, b) => a - b);
    expect(sorted[1]! - sorted[0]!).toBeGreaterThanOrEqual(12);
    expect(sorted[2]! - sorted[1]!).toBeGreaterThanOrEqual(12);
    expect(Math.max(...out)).toBeLessThanOrEqual(160);
    expect(out[2]).toBeCloseTo(20);
  });
});

describe("spacedTicks and logTicks", () => {
  it("drops inner ticks that would crowd on screen", () => {
    const toPx = (v: number) => v * 10;
    expect(spacedTicks([0, 0.5, 1, 1.2, 10], toPx, 14)).toEqual([0, 10]);
    expect(spacedTicks([0, 5, 10], toPx, 14)).toEqual([0, 5, 10]);
  });

  it("gives decades between the ends", () => {
    expect(logTicks(0.05, 6.78)).toEqual([0.05, 0.1, 1, 6.78]);
    expect(logTicks(0, 1)).toEqual([]);
  });
});

describe("fitRange", () => {
  const ramp = [0.7, 0.8, 0.85, 0.95, 0.951, 0.953, 0.952, 0.955, 0.954, 0.953, 0.953, 0.953];
  const spike = [6.78, 1.07, 0.9, 0.6, 0.3, 0.12, 0.08, 0.05, 0.06, 0.09, 0.2, 0.4];

  it("clips an isolated spike", () => {
    const r = fitRange([spike]);
    expect(r.clipped).toBe(true);
    expect(r.max).toBeLessThan(2);
  });

  it("keeps a contiguous early ramp in view", () => {
    const r = fitRange([ramp]);
    expect(r.clipped).toBe(false);
    expect(r.min).toBeLessThanOrEqual(0.7);
  });

  it("judges each line on its own neighbours", () => {
    const loss = [1.2, 1.0, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.28, 0.26, 0.25, 0.24];
    const r = fitRange([loss, spike]);
    expect(r.clipped).toBe(true);
    expect(r.max).toBeLessThan(2);
    expect(r.min).toBeLessThanOrEqual(0.05);
  });
});

describe("bounded metrics", () => {
  it("recognises accuracy-like names and not loss-like ones", () => {
    for (const n of [
      "acc",
      "val_acc",
      "accuracy",
      "train/accuracy",
      "precision",
      "recall",
      "f1",
      "f1_score",
      "auc",
      "iou",
      "top5",
    ]) {
      expect(isBoundedMetric(n), n).toBe(true);
    }
    for (const n of ["loss", "val_loss", "lr", "mse", "accumulated", "epoch"]) {
      expect(isBoundedMetric(n), n).toBe(false);
    }
  });

  it("clamps a padded range into [0, 1]", () => {
    expect(clampUnit({ min: 0.7, max: 1.03, clipped: false })).toEqual({
      min: 0.7,
      max: 1,
      clipped: false,
    });
    expect(clampUnit({ min: -0.05, max: 0.5, clipped: false }).min).toBe(0);
  });
});
