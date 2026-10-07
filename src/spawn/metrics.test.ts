import { describe, expect, it } from "vitest";

import { isMetricName, MetricsModel, parseClock } from "./metrics";

function model(extra: ConstructorParameters<typeof MetricsModel>[0] = {}) {
  let t = 0;
  const m = new MetricsModel({ now: () => t, ...extra });
  return { m, tick: (ms: number) => (t += ms) };
}

const pts = (m: MetricsModel, name: string) =>
  m.series.find((s) => s.name === name)?.points.map((p) => [p.step, p.value]);

describe("metric pairs", () => {
  it("reads colon and equals pairs, any name", () => {
    const { m } = model();
    m.feed("loss: 0.234 acc=0.91 val_loss = 1e-3\n");
    expect(pts(m, "loss")).toEqual([[0, 0.234]]);
    expect(pts(m, "acc")).toEqual([[0, 0.91]]);
    expect(pts(m, "val_loss")).toEqual([[0, 0.001]]);
  });

  it("uses an explicit step on the line as x", () => {
    const { m } = model();
    m.feed("step 120 loss: 0.5\nstep=121 loss: 0.4\n");
    expect(pts(m, "loss")).toEqual([
      [120, 0.5],
      [121, 0.4],
    ]);
    expect(m.series.some((s) => s.name === "step")).toBe(false);
  });

  it("uses the last seen step for a following metric line", () => {
    const { m } = model();
    m.feed("iter 7\nloss: 0.9\nacc: 0.1\n");
    expect(pts(m, "loss")).toEqual([[7, 0.9]]);
    expect(pts(m, "acc")).toEqual([[7, 0.1]]);
  });

  it("falls back to a running index without steps", () => {
    const { m } = model();
    m.feed("loss: 3\nloss: 2\nloss: 1\n");
    expect(pts(m, "loss")).toEqual([
      [0, 3],
      [1, 2],
      [2, 1],
    ]);
  });

  it("reads space-separated pairs only for metric-like names", () => {
    const { m } = model();
    m.feed("train_loss 0.234 seed 42\n");
    expect(pts(m, "train_loss")).toEqual([[0, 0.234]]);
    expect(m.series.some((s) => s.name === "seed")).toBe(false);
  });

  it("buffers a line split across chunks", () => {
    const { m } = model();
    m.feed("los");
    m.feed("s: 0.2");
    expect(m.series).toHaveLength(0);
    m.feed("5\nacc: 1\n");
    expect(pts(m, "loss")).toEqual([[0, 0.25]]);
  });

  it("ignores long names and caps the number of series", () => {
    const { m } = model({ maxSeries: 2 });
    m.feed("a_very_long_metric_name_indeed: 1 w: 9 aa: 1 bb: 2 cc: 3\n");
    expect(m.series.map((s) => s.name)).toEqual(["aa", "bb"]);
  });

  it("does not read times or percentages as metrics", () => {
    const { m } = model();
    m.feed("time: 00:03 done: 45% ratio: 3/4\n");
    expect(m.series).toHaveLength(0);
  });

  it("charts a space-separated pair only when a whole part of the name is a metric word", () => {
    const { m } = model();
    m.feed("apples 5\nprevious 3 already 7 indices 4 access 2\n");
    m.feed("train_loss 0.5 valLoss 0.6 accuracy 0.9 acc1 0.8 mAP 0.4 episode_reward 12\n");
    expect(m.series.map((s) => s.name)).toEqual([
      "train_loss",
      "valLoss",
      "accuracy",
      "acc1",
      "mAP",
      "episode_reward",
    ]);
  });

  it("isMetricName matches whole parts only", () => {
    expect(isMetricName("val/loss")).toBe(true);
    expect(isMetricName("lr")).toBe(true);
    expect(isMetricName("already")).toBe(false);
    expect(isMetricName("sauce")).toBe(false);
  });

  it("does not read dates or ranges as metrics", () => {
    const { m } = model();
    m.feed("date: 2024-01-05\nrange=1-10\nphone 555-1234 loss: 0.5\n");
    expect(m.series.map((s) => s.name)).toEqual(["loss"]);
  });
});

describe("tqdm", () => {
  it("parses a unicode bar into progress, eta and rate", () => {
    const { m } = model();
    m.feed("train:  45%|████▌     | 45/100 [00:03<00:04, 12.3it/s]\r");
    expect(m.progress()).toMatchObject({
      current: 45,
      total: 100,
      fraction: 0.45,
      etaSeconds: 4,
      source: "tqdm",
    });
    expect(m.rate()?.perSecond).toBeCloseTo(12.3);
    expect(m.rate()?.unit).toBe("it");
  });

  it("inverts s/it and reads a bar without a total", () => {
    const { m } = model();
    m.feed("3it [00:06,  2.00s/it]\r");
    expect(m.rate()?.perSecond).toBeCloseTo(0.5);
    expect(m.progress()).toBeNull();
  });

  it("sees each \\r rewrite as its own line", () => {
    const { m } = model();
    m.feed(" 10%|█| 1/10 [00:01<00:09, 1.0it/s]\r 20%|██| 2/10 [00:02<00:08, 1.0it/s]\r");
    expect(m.progress()?.current).toBe(2);
  });

  it("does not turn the bar's numbers into series", () => {
    const { m } = model();
    m.feed(" 45%|████| 45/100 [00:03<00:04, 12.3it/s, loss=0.5]\r");
    expect(m.series.map((s) => s.name)).toEqual(["loss"]);
  });
});

describe("epochs and rate", () => {
  it("reads epoch n/m as progress when tqdm is absent", () => {
    const { m } = model();
    m.feed("Epoch 3/10\n");
    expect(m.epoch()).toEqual({ current: 3, total: 10 });
    expect(m.progress()).toMatchObject({ fraction: 0.3, source: "epoch", etaSeconds: null });
    m.feed("epoch: 4 of 10\n");
    expect(m.progress()?.current).toBe(4);
  });

  it("estimates a rate from step counts over time", () => {
    const { m, tick } = model();
    m.feed("step 0\n");
    tick(1000);
    m.feed("step 50\n");
    tick(1000);
    m.feed("step 100\n");
    expect(m.rate()).toEqual({ perSecond: 50, unit: "it" });
  });

  it("estimates epochs per second from epoch lines and plots by epoch", () => {
    const { m, tick } = model();
    m.feed("epoch   1 | loss: 0.4664 | val_acc: 0.700\n");
    tick(500);
    m.feed("epoch   2 | loss: 0.4000 | val_acc: 0.750\n");
    tick(500);
    m.feed("epoch   3 | loss: 0.3500 | val_acc: 0.800\n");
    expect(m.rate()).toEqual({ perSecond: 2, unit: "epoch" });
    expect(m.xUnit()).toBe("epoch");
    expect(m.series.find((s) => s.name === "loss")?.points.map((p) => p.step)).toEqual([1, 2, 3]);
    expect(m.series.find((s) => s.name === "val_acc")?.points.map((p) => p.step)).toEqual([
      1, 2, 3,
    ]);
  });

  it("falls back to metric lines per second when nothing is counted", () => {
    const { m, tick } = model();
    m.feed("loss: 0.5\n");
    tick(250);
    m.feed("loss: 0.4\n");
    tick(250);
    m.feed("loss: 0.3\n");
    expect(m.rate()).toEqual({ perSecond: 4, unit: "sample" });
    expect(m.xUnit()).toBe("sample");
  });
});

describe("user patterns", () => {
  it("adds a named series from a custom regex", () => {
    const { m } = model({ patterns: [{ name: "reward", regex: String.raw`R=([\d.]+)` }] });
    m.feed("episode 1 R=12.5\n");
    expect(pts(m, "reward")).toEqual([[0, 12.5]]);
  });

  it("reports an invalid regex instead of throwing", () => {
    const { m } = model();
    expect(() => m.setPatterns([{ name: "bad", regex: "(" }])).not.toThrow();
    expect(m.patternErrors()[0]?.name).toBe("bad");
    expect(() => m.feed("x: 1\n")).not.toThrow();
  });
});

describe("housekeeping", () => {
  it("downsamples past maxPoints and keeps the last point", () => {
    const { m } = model({ maxPoints: 10 });
    for (let i = 0; i <= 10; i++) m.feed(`step ${i} loss: ${i}\n`);
    const points = pts(m, "loss") ?? [];
    expect(points.length).toBeLessThanOrEqual(7);
    expect(points[points.length - 1]).toEqual([10, 10]);
  });

  it("keeps up with a flood: 20k lines in well under a few seconds", () => {
    const { m } = model();
    const t0 = performance.now();
    for (let c = 0; c < 100; c++) {
      let chunk = "";
      for (let i = 0; i < 200; i++) {
        const n = c * 200 + i;
        chunk += `epoch ${Math.floor(n / 10)} loss: ${1 / (n + 1)} acc: 0.5\n`;
      }
      m.feed(chunk);
    }
    // Updating the whole store per line took over 20 s here.
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(m.series.map((s) => s.name)).toEqual(["loss", "acc"]);
    for (const s of m.series) expect(s.points.length).toBeLessThanOrEqual(2000);
    expect(pts(m, "loss")?.at(-1)).toEqual([1999, 1 / 20000]);
  });

  it("reset clears everything including the partial buffer", () => {
    const { m } = model();
    m.feed("loss: 1\nEpoch 1/2\npartial");
    m.reset();
    m.feed(" loss: 2\n");
    expect(m.series).toHaveLength(1);
    expect(pts(m, "loss")).toEqual([[0, 2]]);
    expect(m.epoch()).toBeNull();
  });

  it("flush parses a trailing unterminated line", () => {
    const { m } = model();
    m.feed("loss: 7");
    m.flush();
    expect(pts(m, "loss")).toEqual([[0, 7]]);
  });
});

describe("non-finite values", () => {
  it("records nan and inf as events, not points", () => {
    const { m } = model();
    m.feed("epoch 39 loss: 0.5\nepoch 40 loss: nan\nval_loss=inf\nlr -inf\n");
    expect(pts(m, "loss")).toEqual([[39, 0.5]]);
    expect(m.series.some((s) => s.name === "val_loss")).toBe(false);
    expect(m.nonFinite()).toEqual([
      { name: "loss", step: 40, kind: "nan" },
      { name: "val_loss", step: 40, kind: "inf" },
      { name: "lr", step: 40, kind: "inf" },
    ]);
  });

  it("uses an explicit step, else the running index of the series", () => {
    const { m } = model();
    m.feed("loss: 1\nloss: 0.5\nloss: NaN\nstep 7 loss: Infinity\n");
    expect(m.nonFinite()).toEqual([
      { name: "loss", step: 2, kind: "nan" },
      { name: "loss", step: 7, kind: "inf" },
    ]);
  });

  it("ignores words that merely start with nan or inf", () => {
    const { m } = model();
    m.feed("loss information: nancy\nmode=inference\nstep: nan\n");
    expect(m.nonFinite()).toEqual([]);
  });

  it("caps the number of events and clears them on reset", () => {
    const { m } = model();
    for (let i = 0; i < 150; i++) m.feed("loss: nan\n");
    expect(m.nonFinite().length).toBeLessThanOrEqual(100);
    m.reset();
    expect(m.nonFinite()).toEqual([]);
  });
});

describe("parseClock", () => {
  it("reads mm:ss and h:mm:ss", () => {
    expect(parseClock("00:04")).toBe(4);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("?")).toBeNull();
  });
});
