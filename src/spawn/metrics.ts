/**
 * The run panel's data: numeric series scraped from a spawn's output.
 *
 * Training scripts print things like `loss: 0.234`, `epoch 3/10`, and tqdm
 * bars. This model watches every chunk of stdout and stderr, turns those into
 * named series, a progress fraction, and an iteration rate. Users add their
 * own `{ name, regex }` patterns (one capture group for the number).
 *
 * Pure: no Tauri, no DOM. `feed()` accepts arbitrary chunks and buffers the
 * partial last line; `\r` counts as a line break so tqdm rewrites are seen.
 */
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";

export interface Point {
  step: number;
  value: number;
}

export interface Series {
  name: string;
  points: Point[];
}

/**
 * A metric printed as `nan`, `inf` or `-inf`. Kept apart from the points so
 * charts are unaffected; the health check reads them.
 */
export interface NonFinite {
  name: string;
  step: number;
  kind: "nan" | "inf";
}

export interface Progress {
  current: number;
  total: number;
  /** 0..1 */
  fraction: number;
  etaSeconds: number | null;
  source: "tqdm" | "epoch";
}

/** Iterations per second and what an iteration is, for the run header. */
export interface Rate {
  perSecond: number;
  unit: "it" | "epoch" | "sample";
}

/** What the x axis of a series counts. */
export type XUnit = "step" | "epoch" | "sample";

export interface UserPattern {
  name: string;
  regex: string;
}

export interface PatternError {
  name: string;
  message: string;
}

export interface MetricsOptions {
  maxPoints?: number;
  maxSeries?: number;
  patterns?: UserPattern[];
  now?: () => number;
}

export const DEFAULT_MAX_POINTS = 2000;
export const DEFAULT_MAX_SERIES = 8;
/** Non-finite events kept; a loop printing `nan` forever must not grow the store. */
const MAX_NON_FINITE = 100;
const MAX_NAME = 24;

const NUMBER = String.raw`(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)`;
/**
 * `name: 1.23` / `name=1.23`, names of 2 to 24 chars of word, dot, slash,
 * dash. Single letters (`w=1.4`, `b=-0.1`) are almost never metrics.
 */
const PAIR = new RegExp(
  String.raw`(?<![\w./-])([A-Za-z_][\w./-]{1,${MAX_NAME - 1}})\s*[:=]\s*${NUMBER}(?![\w.%:/])`,
  "g",
);
/** `train_loss 0.234`: space-separated, only for names that read as metrics. */
const SPACE_PAIR = new RegExp(
  String.raw`(?<![\w./-])([A-Za-z_][\w./-]{0,${MAX_NAME - 1}})\s+${NUMBER}(?![\w.%:/])`,
  "g",
);
const METRIC_WORD =
  /loss|acc|lr|err|score|f1|auc|ppl|perplexity|reward|mse|mae|rmse|bleu|iou|dice|map/i;
/**
 * `loss: nan`, `loss=inf`, `val_loss -inf`. The separator is captured so the
 * space-separated form can be held to metric-like names, as SPACE_PAIR is.
 */
const NON_FINITE = new RegExp(
  String.raw`(?<![\w./-])([A-Za-z_][\w./-]{1,${MAX_NAME - 1}})(\s*[:=]\s*|\s+)(-?(?:nan|inf|infinity))(?![\w.])`,
  "gi",
);
/** Names that are counters, not metrics. */
const COUNTERS = new Set([
  "step",
  "steps",
  "iter",
  "iters",
  "it",
  "iteration",
  "global_step",
  "epoch",
  "epochs",
  "batch",
]);
const STEP = /(?<![\w./-])(?:step|iter|iteration|global_step|it)\s*[:=]?\s*(\d+)(?![\w.%:/])/i;
const EPOCH = /(?<![\w./-])epochs?\s*[:=]?\s*(\d+)(?:\s*(?:\/|of)\s*(\d+))?(?![\w.%:/])/i;
/** tqdm: `45%|████| 45/100 [00:03<00:04, 12.3it/s]` (the bar may be empty). */
const TQDM = /(\d+)%\|[^|\n]*\|\s*(\d+)\/(\d+)\s*\[([\d:]+)<([\d:?]+),\s*([\d.]+)\s*(it\/s|s\/it)/;
/** tqdm without a total: `45it [00:03, 12.3it/s]`. */
const TQDM_OPEN = /(\d+)it\s*\[[\d:]+,\s*([\d.]+)\s*(it\/s|s\/it)/;

export function parseClock(text: string): number | null {
  if (text === "?") return null;
  const parts = text.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

interface Compiled {
  name: string;
  regex: RegExp;
}

export class MetricsModel {
  readonly series: Series[];
  private readonly setSeries;
  private readonly progressSignal = createSignal<Progress | null>(null);
  private readonly rateSignal = createSignal<Rate | null>(null);
  private readonly xUnitSignal = createSignal<XUnit>("sample");
  private readonly epochSignal = createSignal<{ current: number; total: number | null } | null>(
    null,
  );
  private readonly errorsSignal = createSignal<readonly PatternError[]>([]);
  private readonly nonFiniteSignal = createSignal<readonly NonFinite[]>([]);
  private readonly maxPoints: number;
  private readonly maxSeries: number;
  private readonly now: () => number;
  private compiled: Compiled[] = [];
  private buffer = "";
  private lastStep: number | null = null;
  private lastEpoch: number | null = null;
  /** (time, count) samples for a rate estimate when tqdm is absent. */
  private stepSamples: Array<[number, number]> = [];
  private epochSamples: Array<[number, number]> = [];
  private recordSamples: Array<[number, number]> = [];
  private recordCount = 0;
  private tqdmRate: Rate | null = null;

  constructor(options: MetricsOptions = {}) {
    const [series, setSeries] = createStore<Series[]>([]);
    this.series = series;
    this.setSeries = setSeries;
    this.maxPoints = options.maxPoints ?? DEFAULT_MAX_POINTS;
    this.maxSeries = options.maxSeries ?? DEFAULT_MAX_SERIES;
    this.now = options.now ?? (() => Date.now());
    this.setPatterns(options.patterns ?? []);
  }

  get progress() {
    return this.progressSignal[0];
  }
  get rate() {
    return this.rateSignal[0];
  }
  get epoch() {
    return this.epochSignal[0];
  }
  get xUnit() {
    return this.xUnitSignal[0];
  }
  get patternErrors() {
    return this.errorsSignal[0];
  }
  /** Metrics that printed as `nan` or `inf`, in order, never charted. */
  get nonFinite() {
    return this.nonFiniteSignal[0];
  }

  /** Replace user patterns. Bad regexes are reported, never thrown. */
  setPatterns(patterns: UserPattern[]): void {
    const errors: PatternError[] = [];
    this.compiled = [];
    for (const p of patterns) {
      try {
        const regex = new RegExp(p.regex);
        if (!p.name.trim()) errors.push({ name: p.name, message: "pattern needs a name" });
        else this.compiled.push({ name: p.name.slice(0, MAX_NAME), regex });
      } catch (err) {
        errors.push({ name: p.name, message: err instanceof Error ? err.message : String(err) });
      }
    }
    this.errorsSignal[1](errors);
  }

  reset(): void {
    this.buffer = "";
    this.lastStep = null;
    this.lastEpoch = null;
    this.stepSamples = [];
    this.epochSamples = [];
    this.recordSamples = [];
    this.recordCount = 0;
    this.tqdmRate = null;
    this.setSeries([]);
    this.nonFiniteSignal[1]([]);
    this.progressSignal[1](null);
    this.rateSignal[1](null);
    this.epochSignal[1](null);
    this.xUnitSignal[1]("sample");
  }

  feed(text: string): void {
    this.buffer += text;
    const lines = this.buffer.split(/\r\n|\n|\r/);
    this.buffer = lines.pop() ?? "";
    for (const line of lines) if (line.length > 0) this.line(line);
  }

  /** Parse what is left in the buffer (call at exit). */
  flush(): void {
    const rest = this.buffer;
    this.buffer = "";
    if (rest.length > 0) this.line(rest);
  }

  private line(line: string): void {
    this.scanProgress(line);
    this.scanCounters(line);
    const step = STEP.exec(line);
    const x = step?.[1] !== undefined ? Number(step[1]) : null;
    const values = new Map<string, number>();
    for (const c of this.compiled) {
      const m = c.regex.exec(line);
      const n = m?.[1] !== undefined ? Number(m[1]) : NaN;
      if (Number.isFinite(n)) values.set(c.name, n);
    }
    for (const m of line.matchAll(PAIR)) this.collect(values, m[1], m[2]);
    for (const m of line.matchAll(SPACE_PAIR)) {
      if (m[1] !== undefined && METRIC_WORD.test(m[1])) this.collect(values, m[1], m[2]);
    }
    if (values.size > 0) this.record(values, x);
    this.scanNonFinite(line, x);
  }

  /** `loss: nan` is an event, not a point: charts ignore it, health reads it. */
  private scanNonFinite(line: string, explicitStep: number | null): void {
    if (this.nonFinite().length >= MAX_NON_FINITE) return;
    const found: NonFinite[] = [];
    for (const m of line.matchAll(NON_FINITE)) {
      const name = m[1];
      const sep = m[2];
      const raw = m[3];
      if (name === undefined || sep === undefined || raw === undefined) continue;
      if (!/[:=]/.test(sep) && !METRIC_WORD.test(name)) continue;
      if (COUNTERS.has(name.toLowerCase())) continue;
      const kind = /nan/i.test(raw) ? "nan" : "inf";
      const s = this.series.find((entry) => entry.name === name);
      const counter = this.lastStep ?? this.lastEpoch;
      const step = explicitStep ?? counter ?? s?.points.length ?? 0;
      found.push({ name, step, kind });
    }
    if (found.length > 0) this.nonFiniteSignal[1]((prev) => [...prev, ...found]);
  }

  private collect(
    values: Map<string, number>,
    name: string | undefined,
    raw: string | undefined,
  ): void {
    if (name === undefined || raw === undefined) return;
    if (COUNTERS.has(name.toLowerCase()) || values.has(name)) return;
    const n = Number(raw);
    if (Number.isFinite(n)) values.set(name, n);
  }

  private record(values: Map<string, number>, explicitStep: number | null): void {
    this.recordCount += 1;
    this.recordSamples.push([this.now(), this.recordCount]);
    if (this.recordSamples.length > 20) this.recordSamples.shift();
    this.updateRate();
    this.setSeries(
      produce((list) => {
        for (const [name, value] of values) {
          let s = list.find((entry) => entry.name === name);
          if (!s) {
            if (list.length >= this.maxSeries) continue;
            s = { name, points: [] };
            list.push(s);
          }
          const step = explicitStep ?? this.impliedX(s);
          s.points.push({ step, value });
          if (s.points.length > this.maxPoints) {
            const last = s.points[s.points.length - 1];
            s.points = s.points.filter((_, i) => i % 2 === 0);
            if (last && s.points[s.points.length - 1] !== last) s.points.push(last);
          }
        }
      }),
    );
  }

  private scanProgress(line: string): void {
    const bar = TQDM.exec(line);
    if (bar?.[2] !== undefined && bar[3] !== undefined && bar[6] !== undefined) {
      const current = Number(bar[2]);
      const total = Number(bar[3]);
      this.tqdmRate = rateOf(bar[6], bar[7]);
      if (this.tqdmRate) this.rateSignal[1](this.tqdmRate);
      this.progressSignal[1]({
        current,
        total,
        fraction: total > 0 ? Math.min(1, current / total) : 0,
        etaSeconds: parseClock(bar[5] ?? "?"),
        source: "tqdm",
      });
      return;
    }
    const open = TQDM_OPEN.exec(line);
    if (open?.[2] !== undefined) {
      this.tqdmRate = rateOf(open[2], open[3]);
      if (this.tqdmRate) this.rateSignal[1](this.tqdmRate);
    }
  }

  private scanCounters(line: string): void {
    const epoch = EPOCH.exec(line);
    if (epoch?.[1] !== undefined) {
      const current = Number(epoch[1]);
      const total = epoch[2] !== undefined ? Number(epoch[2]) : null;
      this.epochSignal[1]({ current, total });
      if (this.lastEpoch !== current) {
        this.lastEpoch = current;
        this.epochSamples.push([this.now(), current]);
        if (this.epochSamples.length > 20) this.epochSamples.shift();
      }
      if (this.xUnit() === "sample") this.xUnitSignal[1]("epoch");
      if (total !== null && total > 0 && this.progress()?.source !== "tqdm") {
        this.progressSignal[1]({
          current,
          total,
          fraction: Math.min(1, current / total),
          etaSeconds: null,
          source: "epoch",
        });
      }
    }
    const step = STEP.exec(line);
    if (step?.[1] !== undefined) {
      const n = Number(step[1]);
      if (this.lastStep !== n) {
        this.lastStep = n;
        this.stepSamples.push([this.now(), n]);
        if (this.stepSamples.length > 20) this.stepSamples.shift();
      }
      this.xUnitSignal[1]("step");
    }
    this.updateRate();
  }

  /**
   * The x value for a metric that came without an explicit step: the last
   * step or epoch seen, unless this series already has a point there (several
   * lines per step), else the sample index.
   */
  private impliedX(s: Series): number {
    const counter = this.lastStep ?? this.lastEpoch;
    if (counter !== null && !s.points.some((p) => p.step === counter)) return counter;
    return s.points.length;
  }

  /** tqdm beats step counters, which beat epochs, which beat sample cadence. */
  private updateRate(): void {
    if (this.tqdmRate !== null) return;
    const rate =
      rateFrom(this.stepSamples, "it") ??
      rateFrom(this.epochSamples, "epoch") ??
      rateFrom(this.recordSamples, "sample");
    this.rateSignal[1](rate);
  }
}

/** Δcount / Δtime over a window of (ms, count) samples. */
function rateFrom(samples: Array<[number, number]>, unit: Rate["unit"]): Rate | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || first === last) return null;
  const dt = (last[0] - first[0]) / 1000;
  const dcount = last[1] - first[1];
  return dt > 0 && dcount > 0 ? { perSecond: dcount / dt, unit } : null;
}

function rateOf(value: string, unit: string | undefined): Rate | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { perSecond: unit === "s/it" ? 1 / n : n, unit: "it" };
}
