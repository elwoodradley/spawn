/** Pure helpers for the run panel charts: scales, ticks, number formatting. */
import type { Rate } from "../spawn/metrics";

/** Round tick positions covering [min, max] with about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return niceTicks(min - pad, max + pad, count);
  }
  const span = max - min;
  const rough = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(roundTo(v, step));
  return ticks;
}

function roundTo(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(Math.min(12, decimals)));
}

/** Compact value labels: 0.234, 1.2e-4, 12.3k, 1.5M. */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= 1e6) return `${trim((value / 1e6).toFixed(1))}M`;
  if (abs >= 1e4) return `${trim((value / 1e3).toFixed(1))}k`;
  if (abs >= 100) return trim(value.toFixed(0));
  if (abs >= 1) return trim(value.toFixed(2));
  if (abs >= 1e-3) return trim(value.toFixed(4));
  return value.toExponential(1);
}

function trim(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "–";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(rest).padStart(2, "0")}s`;
  return `${rest}s`;
}

const RATE_UNIT = { it: "it", epoch: "ep", sample: "pt" } as const;

/** `12.3 it/s`, `0.8 ep/s`, or the inverse `2.5 s/ep` when slower than one per second. */
export function formatRate(rate: Rate | null): string {
  if (rate === null || !Number.isFinite(rate.perSecond) || rate.perSecond <= 0) return "–";
  const unit = RATE_UNIT[rate.unit];
  const r = rate.perSecond;
  if (r >= 100) return `${r.toFixed(0)} ${unit}/s`;
  if (r >= 1) return `${r.toFixed(1)} ${unit}/s`;
  return `${(1 / r).toFixed(1)} s/${unit}`;
}

/** Ticks for an integer axis (steps, epochs): whole numbers only, ends included. */
export function integerTicks(min: number, max: number, count = 5): number[] {
  const lo = Math.floor(min);
  const hi = Math.ceil(max);
  if (hi <= lo) return [lo];
  const ticks = niceTicks(lo, hi, count).filter((t) => Number.isInteger(t) && t > lo && t < hi);
  return [lo, ...ticks, hi];
}

/**
 * Value-axis labels that cover the data: the true minimum and maximum at the
 * ends plus nice ticks in between, dropping any tick that would crowd an end.
 */
export function valueTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const inner = niceTicks(min, max, count).filter(
    (t) => t - min > span * 0.12 && max - t > span * 0.12,
  );
  return [min, ...inner, max];
}

export function formatBytes(bytes: number): string {
  const gib = bytes / 2 ** 30;
  if (gib >= 10) return gib.toFixed(0);
  return gib.toFixed(1);
}

export interface Scale {
  (value: number): number;
  domain: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  return scale;
}

/** Index of the point whose x is nearest to `x`, in a sorted list. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (hi < 0) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] ?? 0) < x) lo = mid + 1;
    else hi = mid;
  }
  const prev = lo - 1;
  const a = xs[prev];
  const b = xs[lo];
  if (a !== undefined && b !== undefined && Math.abs(a - x) <= Math.abs(b - x)) return prev;
  return lo;
}

export interface XY {
  step: number;
  value: number;
}

/** `M x y L x y …` for a polyline through points already in pixel space. */
export function linePath(points: readonly XY[], x: Scale, y: Scale): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.step).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
}

/**
 * Interpolate series `b` at each x of series `a` over their shared x range.
 * Points outside the overlap are dropped, so the band never extrapolates.
 */
export function alignSeries(a: readonly XY[], b: readonly XY[]): Array<[XY, XY]> {
  if (a.length === 0 || b.length === 0) return [];
  const lo = Math.max(a[0]?.step ?? 0, b[0]?.step ?? 0);
  const hi = Math.min(a[a.length - 1]?.step ?? 0, b[b.length - 1]?.step ?? 0);
  if (hi < lo) return [];
  const out: Array<[XY, XY]> = [];
  let j = 0;
  for (const p of a) {
    if (p.step < lo || p.step > hi) continue;
    while (j + 1 < b.length && (b[j + 1]?.step ?? Infinity) <= p.step) j++;
    const b0 = b[j];
    const b1 = b[j + 1];
    if (!b0) continue;
    let value = b0.value;
    if (b1 && b1.step !== b0.step && p.step > b0.step) {
      const t = (p.step - b0.step) / (b1.step - b0.step);
      value = b0.value + t * (b1.value - b0.value);
    }
    out.push([p, { step: p.step, value }]);
  }
  return out;
}

/**
 * A closed path filling the area between two lines over their shared x
 * range: forward along `a`, back along `b`. Empty when they do not overlap.
 */
export function gapPath(a: readonly XY[], b: readonly XY[], x: Scale, y: Scale): string {
  const pairs = alignSeries(a, b);
  if (pairs.length < 2) return "";
  const forward = pairs.map(([p]) => `${x(p.step).toFixed(1)} ${y(p.value).toFixed(1)}`);
  const back = pairs
    .slice()
    .reverse()
    .map(([, q]) => `${x(q.step).toFixed(1)} ${y(q.value).toFixed(1)}`);
  return `M${forward.join(" L")} L${back.join(" L")} Z`;
}

export interface Range {
  min: number;
  max: number;
  /** True when some data lies outside [min, max]. */
  clipped: boolean;
}

/**
 * Rank-based percentile: the value at the rank, never interpolated toward a
 * neighbour, so a single extreme point cannot pull the 98th percentile up
 * on a short series. Low percentiles round the rank up, high ones down.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * p;
  const rank = p < 0.5 ? Math.ceil(pos) : Math.floor(pos);
  return sorted[rank] ?? NaN;
}

/**
 * A value range that ignores a few outliers. Fits the 2nd–98th percentile
 * band plus a margin, unless the full range is not much wider (then the full
 * range is fine and nothing is clipped). A single spike therefore cannot
 * flatten the rest of the curve.
 */
export function robustRange(values: readonly number[], margin = 0.08, tolerance = 1.6): Range {
  const finite = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return { min: 0, max: 1, clipped: false };
  const fullMin = finite[0] ?? 0;
  const fullMax = finite[finite.length - 1] ?? 1;
  if (finite.length < 6) return pad(fullMin, fullMax, margin, false);
  const lo = percentile(finite, 0.02);
  const hi = percentile(finite, 0.98);
  const fullSpan = fullMax - fullMin;
  const coreSpan = hi - lo;
  if (coreSpan <= 0 || fullSpan <= coreSpan * tolerance) {
    return pad(fullMin, fullMax, margin, false);
  }
  return pad(lo, hi, margin, true);
}

function pad(min: number, max: number, margin: number, clipped: boolean): Range {
  if (min === max) {
    const p = min === 0 ? 1 : Math.abs(min) * 0.1;
    return { min: min - p, max: max + p, clipped };
  }
  const m = (max - min) * margin;
  // Data that never goes below zero should not get an axis that does.
  const floor = min >= 0 && min - m < 0 ? 0 : min - m;
  return { min: floor, max: max + m, clipped };
}

/** A scale that keeps off-range values on the edge instead of off the chart. */
export function clampedScale(scale: Scale): Scale {
  const [d0, d1] = scale.domain;
  const lo = Math.min(d0, d1);
  const hi = Math.max(d0, d1);
  const clamped = ((value: number) => scale(Math.min(hi, Math.max(lo, value)))) as Scale;
  clamped.domain = scale.domain;
  return clamped;
}

/** Log10 scale for strictly positive domains. */
export function logScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const l0 = Math.log10(Math.max(d0, Number.MIN_VALUE));
  const l1 = Math.log10(Math.max(d1, Number.MIN_VALUE));
  const span = l1 - l0 || 1;
  const scale = ((value: number) =>
    r0 + ((Math.log10(Math.max(value, Number.MIN_VALUE)) - l0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  return scale;
}

/** Decade ticks inside a positive range, ends included. */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const ticks = [min];
  for (let e = Math.ceil(Math.log10(min)); 10 ** e < max; e++) {
    const t = 10 ** e;
    if (t > min) ticks.push(Number(t.toPrecision(12)));
  }
  ticks.push(max);
  return ticks;
}

/**
 * Drop ticks that would sit closer than `minPx` to a neighbour on screen.
 * The first and last ticks always survive; inner ones are dropped from the
 * crowded side.
 */
export function spacedTicks(
  ticks: readonly number[],
  toPx: (v: number) => number,
  minPx: number,
): number[] {
  if (ticks.length <= 2) return [...ticks];
  const first = ticks[0] as number;
  const last = ticks[ticks.length - 1] as number;
  const out = [first];
  let lastPx = toPx(first);
  for (const t of ticks.slice(1, -1)) {
    const px = toPx(t);
    if (Math.abs(px - lastPx) >= minPx && Math.abs(toPx(last) - px) >= minPx) {
      out.push(t);
      lastPx = px;
    }
  }
  out.push(last);
  return out;
}

/**
 * Nudge label positions apart so none overlap: sort by y, sweep pushing each
 * at least `minGap` below the previous, then shift the stack back up if it
 * ran past `hi`. Returns positions in the original order.
 */
export function repelLabels(
  ys: readonly number[],
  minGap: number,
  lo: number,
  hi: number,
): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed: number[] = [];
  for (const item of order) {
    const prev = placed[placed.length - 1];
    placed.push(prev === undefined ? Math.max(lo, item.y) : Math.max(item.y, prev + minGap));
  }
  // Pull back only the labels that ran past the bottom, keeping their gaps.
  for (let i = placed.length - 1; i >= 0; i--) {
    const ceiling = i === placed.length - 1 ? hi : (placed[i + 1] as number) - minGap;
    placed[i] = Math.min(placed[i] as number, ceiling);
  }
  const out = new Array<number>(ys.length);
  order.forEach((item, k) => {
    out[item.i] = Math.max(lo, placed[k] as number);
  });
  return out;
}

/**
 * Fit a value range across several lines, clipping only *isolated spikes*:
 * a point more than one core-span outside the percentile core whose
 * neighbours along its line are not spikes themselves. A first-epoch spike
 * qualifies; the early part of an accuracy ramp does not (its neighbours are
 * out there with it, and it is close to the core anyway), so the full range
 * is kept and nothing is hidden.
 */
export function fitRange(lines: readonly (readonly number[])[], margin = 0.08): Range {
  const all = lines.flat().filter(Number.isFinite);
  const full = robustRange(all, margin, Number.POSITIVE_INFINITY);
  if (all.length < 6) return full;
  const sorted = [...all].sort((a, b) => a - b);
  const lo = percentile(sorted, 0.02);
  const hi = percentile(sorted, 0.98);
  const span = hi - lo;
  if (!(span > 0)) return full;
  const spike = (v: number) => v > hi + span || v < lo - span;
  let spikes = 0;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const v = line[i] as number;
      if (!Number.isFinite(v) || !spike(v)) continue;
      const prev = line[i - 1];
      const next = line[i + 1];
      if ((prev !== undefined && spike(prev)) || (next !== undefined && spike(next))) return full;
      spikes += 1;
    }
  }
  if (spikes === 0) return full;
  const fitted = robustRange(
    all.filter((v) => !spike(v)),
    margin,
    Number.POSITIVE_INFINITY,
  );
  return { min: fitted.min, max: fitted.max, clipped: true };
}

/**
 * Metrics that live in [0, 1] by definition: accuracy, precision, recall,
 * f1, AUC, IoU, Dice, mAP, and anything ending in `_acc`. Their axis should
 * never be padded above 1.0 (or below 0).
 */
export function isBoundedMetric(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /(^|[_/\s-])(acc|accuracy|precision|recall|f1|f1[_-]?score|auc|roc[_-]?auc|iou|dice|map|top\d+)$/.test(
      n,
    ) || /(^|[_/\s-])(acc|accuracy)([_/\s-]|$)/.test(n)
  );
}

/**
 * The range for a chart of `metric`: clamped into [0, 1] when the metric is
 * bounded and every value fits, untouched otherwise. Accuracy printed as a
 * percentage (`acc: 87.5`) keeps its own range instead of every point
 * landing off-scale above a 0–1 axis.
 */
export function boundedRange(metric: string, values: readonly number[], range: Range): Range {
  if (!isBoundedMetric(metric) || values.some((v) => v < 0 || v > 1)) return range;
  return clampUnit(range);
}

/** Clamp a fitted range into [0, 1] for bounded metrics, keeping a hair of room. */
export function clampUnit(range: Range): Range {
  const min = Math.max(0, range.min);
  const max = Math.min(1, range.max);
  return { min: Math.min(min, max - 1e-6), max, clipped: range.clipped };
}
