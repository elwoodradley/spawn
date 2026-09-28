import { describe, expect, it } from "vitest";

import { analyzeHealth, THRESHOLDS, type Finding } from "./health";
import { noiseLevel, smooth } from "./healthMath";
import type { Series } from "./metrics";

/** Deterministic noise so a flaky seed cannot make the suite lie. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly normal: sum of uniforms, centred. */
function gauss(next: () => number): number {
  let s = 0;
  for (let i = 0; i < 6; i++) s += next();
  return (s - 3) / Math.SQRT2;
}

function series(name: string, f: (epoch: number) => number, epochs: number, from = 1): Series {
  const points = [];
  for (let e = from; e < from + epochs; e++) points.push({ step: e, value: f(e) });
  return { name, points };
}

const kinds = (findings: Finding[]) => findings.map((f) => f.kind);

/** The tour's overfit.py: val bottoms out around epoch 14 and climbs; train keeps falling. */
function overfitRun(epochs: number, seed = 4) {
  const next = rng(seed);
  const loss = series("loss", (e) => 1.2 * Math.exp(-e / 9) + 0.02 + gauss(next) * 0.01, epochs);
  const val = series(
    "val_loss",
    (e) =>
      e === 1
        ? 6.78
        : 0.05 + 0.6 * Math.exp(-e / 5) + 0.004 * Math.max(0, e - 13) ** 1.6 + gauss(next) * 0.01,
    epochs,
  );
  return [loss, val];
}

describe("quiet on healthy runs", () => {
  it("says nothing about a clean converging run", () => {
    const loss = series("loss", (e) => 1.2 * Math.exp(-e / 9) + 0.02, 40);
    const val = series("val_loss", (e) => 1.3 * Math.exp(-e / 9) + 0.05, 40);
    const acc = series("acc", (e) => 1 - 0.6 * Math.exp(-e / 8), 40);
    const vacc = series("val_acc", (e) => 0.97 - 0.6 * Math.exp(-e / 8), 40);
    expect(analyzeHealth({ series: [loss, val, acc, vacc], xUnit: "epoch" })).toEqual([]);
  });

  it("says nothing about a noisy but healthy run, across many seeds", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const next = rng(seed);
      const loss = series("loss", (e) => 1.5 * Math.exp(-e / 20) + 0.1 + gauss(next) * 0.03, 100);
      const val = series(
        "val_loss",
        (e) => 1.6 * Math.exp(-e / 20) + 0.15 + gauss(next) * 0.05,
        100,
      );
      expect(kinds(analyzeHealth({ series: [loss, val], xUnit: "epoch" }))).toEqual([]);
    }
  });

  it("does not mistake a noisy validation plateau for overfitting", () => {
    // 20% relative noise on a flat val loss while train still creeps down.
    for (let seed = 1; seed <= 200; seed++) {
      const next = rng(seed);
      const loss = series("loss", (e) => 0.4 * Math.exp(-e / 40) + 0.05, 100);
      const val = series(
        "val_loss",
        (e) => 0.15 + 0.6 * Math.exp(-e / 8) + gauss(next) * 0.03,
        100,
      );
      const found = analyzeHealth({ series: [loss, val], xUnit: "epoch" });
      expect(
        found.filter((f) => f.kind === "overfitting"),
        `seed ${seed}`,
      ).toEqual([]);
    }
  });

  it("ignores a lone spike and the first few epochs", () => {
    const loss = series("loss", (e) => (e === 12 ? 9 : 1 / e), 30);
    expect(analyzeHealth({ series: [loss] })).toEqual([]);
    expect(analyzeHealth({ series: overfitRun(9), xUnit: "epoch" })).toEqual([]);
  });

  it("does not fire overfitting before the rise is established", () => {
    expect(kinds(analyzeHealth({ series: overfitRun(17), xUnit: "epoch" }))).not.toContain(
      "overfitting",
    );
  });
});

describe("overfitting", () => {
  it("names the epoch validation loss turned and that the best model was there", () => {
    const found = analyzeHealth({ series: overfitRun(40), xUnit: "epoch" });
    expect(found).toHaveLength(1);
    const f = found[0] as Finding;
    expect(f.kind).toBe("overfitting");
    expect(f.metric).toBe("loss");
    expect(f.series).toBe("val_loss");
    expect(f.severity).toBe("warn");
    expect(f.confidence).toBe("likely");
    expect(f.step).toBeGreaterThanOrEqual(12);
    expect(f.step).toBeLessThanOrEqual(16);
    expect(f.message).toBe(
      `Validation loss started rising at epoch ${f.step} while training loss kept falling. ` +
        `The model started memorizing instead of learning. The best version was at epoch ${f.step}.`,
    );
    expect(f.id).toBe("overfitting:val_loss");
  });

  it("hedges when the rise is small", () => {
    const loss = series("loss", (e) => 1.2 * Math.exp(-e / 9) + 0.02, 40);
    const val = series(
      "val_loss",
      (e) => 0.3 + 0.6 * Math.exp(-e / 5) + 0.0025 * Math.max(0, e - 15),
      40,
    );
    const f = analyzeHealth({ series: [loss, val], xUnit: "epoch" })[0];
    expect(f?.kind).toBe("overfitting");
    expect(f?.confidence).toBe("possible");
    expect(f?.message).toContain("may have started rising");
  });

  it("is not overfitting when training loss rises too", () => {
    const loss = series("loss", (e) => 0.2 + 0.01 * Math.max(0, e - 15), 40);
    const val = series("val_loss", (e) => 0.3 + 0.02 * Math.max(0, e - 15), 40);
    expect(kinds(analyzeHealth({ series: [loss, val] }))).not.toContain("overfitting");
  });

  it("works with train_/val_ prefixes and step units", () => {
    const [loss, val] = overfitRun(40);
    const found = analyzeHealth({
      series: [{ ...(loss as Series), name: "train_loss" }, val as Series],
      xUnit: "step",
    });
    expect(found[0]?.message).toContain("at step ");
  });
});

describe("NaN and infinity", () => {
  it("reports the first nan per series with the learning-rate hint for a loss", () => {
    const loss = series("loss", (e) => 1 / e, 39);
    const found = analyzeHealth({
      series: [loss],
      nonFinite: [
        { name: "loss", step: 40, kind: "nan" },
        { name: "loss", step: 41, kind: "nan" },
      ],
      xUnit: "epoch",
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: "nan:loss",
      kind: "nan",
      metric: "loss",
      step: 40,
      severity: "warn",
      confidence: "likely",
      label: "NaN",
    });
    expect(found[0]?.message).toBe(
      "Loss became NaN (not a number) at epoch 40. The learning rate is probably too high.",
    );
  });

  it("gives a different hint for a metric that is not a loss, and reads inf", () => {
    const found = analyzeHealth({
      series: [],
      nonFinite: [{ name: "val_acc", step: 3, kind: "inf" }],
      xUnit: "step",
    });
    expect(found[0]?.metric).toBe("acc");
    expect(found[0]?.message).toBe(
      "Validation accuracy became infinite at step 3. Check for a division by zero or NaN values in the data.",
    );
  });
});

describe("exploding loss", () => {
  const blowUp = (epochs: number) =>
    series("loss", (e) => (e <= 20 ? 0.1 + 1 / e : 0.1 * 3 ** (e - 20)), epochs);

  it("fires once the loss has sat at 10× its minimum for five points", () => {
    const found = analyzeHealth({ series: [blowUp(27)], xUnit: "epoch" });
    expect(found).toHaveLength(1);
    const f = found[0] as Finding;
    expect(f.kind).toBe("exploding");
    expect(f.step).toBe(23);
    expect(f.confidence).toBe("likely");
    expect(f.message).toMatch(
      /^Loss is exploding: it went from 0\.15\d? to \d+ starting at epoch 23/,
    );
    expect(f.message).toContain("The learning rate is probably too high.");
  });

  it("waits for the fifth point", () => {
    expect(kinds(analyzeHealth({ series: [blowUp(26)] }))).not.toContain("exploding");
  });

  it("does not count a blow-up that recovered", () => {
    const loss = series("loss", (e) => (e >= 10 && e <= 16 ? 50 : 0.5), 30);
    expect(kinds(analyzeHealth({ series: [loss] }))).not.toContain("exploding");
  });

  it("leaves validation loss to the overfitting check", () => {
    const val = series("val_loss", (e) => (e <= 20 ? 1 / e : 3 ** (e - 20)), 30);
    expect(kinds(analyzeHealth({ series: [val] }))).not.toContain("exploding");
  });
});

describe("stalled and flat", () => {
  it("reports a loss that stopped improving over the trailing half", () => {
    const next = rng(9);
    const loss = series("loss", (e) => 0.25 + 0.8 * Math.exp(-e / 6) + gauss(next) * 0.0003, 100);
    const found = analyzeHealth({ series: [loss], xUnit: "epoch" });
    expect(found).toHaveLength(1);
    const f = found[0] as Finding;
    expect(f.kind).toBe("stalled");
    expect(f.severity).toBe("info");
    expect(f.confidence).toBe("likely");
    expect(f.step).toBe(51);
    expect(f.message).toMatch(
      /^Loss hasn't meaningfully improved in 49 epochs \(0\.25 → 0\.25\)\./,
    );
    expect(f.message).toContain("converged");
  });

  it("needs a long enough run", () => {
    const loss = series(
      "loss",
      () => 0.25 + Math.random() * 1e-6,
      THRESHOLDS.stalled.minPoints - 1,
    );
    expect(analyzeHealth({ series: [loss] })).toEqual([]);
  });

  it("flags a loss that never moved, once, with the training checklist", () => {
    const loss = series("loss", () => 0.6931, 20);
    const found = analyzeHealth({ series: [loss], xUnit: "epoch" });
    expect(kinds(found)).toEqual(["flat"]);
    expect(found[0]?.message).toBe(
      "Loss has stayed at exactly 0.693 for 19 epochs. The model may not be training at all: " +
        "check that the optimizer step runs every batch and that the parameters have requires_grad set.",
    );
  });

  it("does not call a constant learning rate flat", () => {
    const lr = series("lr", () => 0.001, 50);
    expect(analyzeHealth({ series: [lr] })).toEqual([]);
  });
});

describe("train/val gap", () => {
  it("points out accuracy far apart on a bounded metric", () => {
    const acc = series("train_acc", (e) => Math.min(0.99, 0.5 + e * 0.05), 20);
    const vacc = series("val_acc", (e) => Math.min(0.6, 0.45 + e * 0.02), 20);
    const found = analyzeHealth({ series: [acc, vacc] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: "gap", metric: "acc", severity: "warn" });
    expect(found[0]?.message).toBe(
      "Training accuracy is 0.99 but validation accuracy is 0.6. " +
        "The model may be overfitting, or the validation set may differ from the training data.",
    );
    expect(found[0]?.label).toBe("gap 0.39");
  });

  it("scales the threshold for percentages and stays quiet on a modest gap", () => {
    const pct = analyzeHealth({
      series: [series("acc", () => 99, 12), series("val_acc", () => 60, 12)],
    });
    expect(kinds(pct)).toEqual(["gap"]);
    const modest = analyzeHealth({
      series: [series("acc", () => 0.9, 12), series("val_acc", () => 0.8, 12)],
    });
    expect(modest).toEqual([]);
  });
});

describe("shape", () => {
  it("orders the worst news first and keeps ids stable", () => {
    const [loss, val] = overfitRun(40);
    const found = analyzeHealth({
      series: [loss as Series, val as Series],
      nonFinite: [{ name: "loss", step: 41, kind: "nan" }],
      xUnit: "epoch",
    });
    expect(kinds(found)).toEqual(["nan", "overfitting"]);
    expect(found.map((f) => f.id)).toEqual(["nan:loss", "overfitting:val_loss"]);
  });

  it("stays fast on the panel's maximum load", () => {
    const next = rng(2);
    const names = ["loss", "val_loss", "acc", "val_acc", "lr", "grad_norm", "mse", "val_mse"];
    const big = names.map((name) => series(name, (s) => 1 / Math.sqrt(s) + next() * 0.01, 2000));
    const started = performance.now();
    for (let i = 0; i < 20; i++) analyzeHealth({ series: big, xUnit: "step" });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("has honest helpers", () => {
    expect(smooth([1, 2, 3, 4, 5], 3)).toEqual([1.5, 2, 3, 4, 4.5]);
    expect(noiseLevel([1, 1, 1])).toBe(0);
    expect(noiseLevel([0, 1, 0, 1])).toBeCloseTo(1 / Math.SQRT2);
  });
});
