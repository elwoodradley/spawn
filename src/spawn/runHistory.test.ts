import { beforeEach, describe, expect, it } from "vitest";

import type { Series } from "./metrics";
import {
  capRuns,
  clearRuns,
  downsample,
  HISTORY_POINTS,
  recordRun,
  removeRun,
  runLabel,
  runs,
} from "./runHistory";

const series = (name: string, n: number): Series => ({
  name,
  points: Array.from({ length: n }, (_, i) => ({ step: i, value: i * 0.5 })),
});

const base = {
  startedAt: 0,
  file: "train.py",
  command: "python -u train.py",
  durationMs: 3100,
  outcome: "ok" as const,
};

beforeEach(() => clearRuns());

describe("downsample", () => {
  it("returns a copy when already small", () => {
    const pts = [1, 2, 3];
    const out = downsample(pts, 10);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts);
  });

  it("keeps at most about max points and always the last one", () => {
    const pts = Array.from({ length: 1234 }, (_, i) => i);
    const out = downsample(pts, HISTORY_POINTS);
    expect(out.length).toBeLessThanOrEqual(HISTORY_POINTS + 1);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(1233);
  });
});

describe("recordRun", () => {
  it("clones and downsamples series", () => {
    const live = series("loss", 2000);
    const rec = recordRun({ ...base, series: [live] }, 5);
    expect(rec?.series[0]?.points.length).toBeLessThanOrEqual(HISTORY_POINTS + 1);
    live.points.push({ step: 9999, value: 0 });
    expect(rec?.series[0]?.points.some((p) => p.step === 9999)).toBe(false);
  });

  it("skips runs with no metrics", () => {
    expect(recordRun({ ...base, series: [] }, 5)).toBeNull();
    expect(runs()).toHaveLength(0);
  });

  it("caps history to keep, dropping the oldest", () => {
    for (let i = 0; i < 4; i++) recordRun({ ...base, series: [series("loss", 3)] }, 2);
    expect(runs()).toHaveLength(2);
    const ids = runs().map((r) => r.id);
    expect(ids[0]).toBeLessThan(ids[1] ?? 0);
  });

  it("removes a single run", () => {
    const a = recordRun({ ...base, series: [series("loss", 3)] }, 5);
    const b = recordRun({ ...base, series: [series("loss", 3)] }, 5);
    removeRun(a?.id ?? -1);
    expect(runs().map((r) => r.id)).toEqual([b?.id]);
  });
});

describe("capRuns", () => {
  it("handles zero and fractional keep", () => {
    const list = [1, 2, 3].map((id) => ({ ...base, id, series: [] }));
    expect(capRuns(list, 0)).toEqual([]);
    expect(capRuns(list, 1.9)).toHaveLength(1);
  });
});

describe("runLabel", () => {
  it("formats id, clock and duration", () => {
    const at = new Date(2026, 0, 1, 12, 4).getTime();
    expect(runLabel({ ...base, id: 2, startedAt: at, series: [] })).toBe("#2 · 12:04 · 3.1s");
  });
});
