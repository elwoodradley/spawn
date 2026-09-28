import { beforeEach, describe, expect, it } from "vitest";

import type { Series } from "./metrics";
import {
  bestOf,
  capRuns,
  capSnapshot,
  clearRuns,
  codeChanged,
  downsample,
  finalsOf,
  HISTORY_POINTS,
  MAX_SNAPSHOT_CODE,
  recordRun,
  removeRun,
  restoreRuns,
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

const snapshot = (code: string) => ({
  path: "/p/train.py",
  code,
  python: "/usr/bin/python3",
  cwd: "/p",
  args: ["-u", "/p/train.py"],
});

describe("finals and best values", () => {
  it("takes the last value of every series", () => {
    expect(finalsOf([series("loss", 3), series("acc", 1)])).toEqual({ loss: 1, acc: 0 });
  });

  it("finds the lowest val loss and the highest val accuracy with their steps", () => {
    const valLoss: Series = {
      name: "val_loss",
      points: [
        { step: 1, value: 0.9 },
        { step: 2, value: 0.3 },
        { step: 3, value: 0.5 },
      ],
    };
    const valAcc: Series = {
      name: "val/acc",
      points: [
        { step: 1, value: 0.7 },
        { step: 2, value: 0.95 },
        { step: 3, value: 0.9 },
      ],
    };
    expect(bestOf([valLoss, valAcc, series("loss", 3)])).toEqual({
      val_loss: { value: 0.3, step: 2 },
      "val/acc": { value: 0.95, step: 2 },
    });
  });

  it("records finals and best from the full series before downsampling", () => {
    const rec = recordRun({ ...base, series: [series("val_loss", 2000)] }, 5);
    expect(rec?.finals).toEqual({ val_loss: 999.5 });
    expect(rec?.best).toEqual({ val_loss: { value: 0, step: 0 } });
  });
});

describe("snapshots", () => {
  it("keeps the snapshot and caps its code", () => {
    const long = "x".repeat(MAX_SNAPSHOT_CODE + 10);
    expect(capSnapshot(snapshot("short"))).toEqual(snapshot("short"));
    const capped = capSnapshot(snapshot(long));
    expect(capped.code).toHaveLength(MAX_SNAPSHOT_CODE);
    expect(capped.truncated).toBe(true);
    const rec = recordRun({ ...base, series: [series("loss", 3)], snapshot: snapshot(long) }, 5);
    expect(rec?.snapshot?.truncated).toBe(true);
  });

  it("knows when the code changed between two runs", () => {
    const a = recordRun({ ...base, series: [series("loss", 3)], snapshot: snapshot("a") }, 5);
    const b = recordRun({ ...base, series: [series("loss", 3)], snapshot: snapshot("b") }, 5);
    const c = recordRun({ ...base, series: [series("loss", 3)], snapshot: snapshot("b") }, 5);
    const d = recordRun({ ...base, series: [series("loss", 3)] }, 5);
    if (!a || !b || !c || !d) throw new Error("records missing");
    expect(codeChanged(a, b)).toBe(true);
    expect(codeChanged(b, c)).toBe(false);
    expect(codeChanged(c, d)).toBeNull();
  });
});

describe("restoreRuns", () => {
  it("replaces the list and keeps new ids above the restored ones", () => {
    restoreRuns([{ ...base, id: 40, series: [] }]);
    expect(runs().map((r) => r.id)).toEqual([40]);
    const next = recordRun({ ...base, series: [series("loss", 3)] }, 5);
    expect(next?.id).toBeGreaterThan(40);
  });
});
