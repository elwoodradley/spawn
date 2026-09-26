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
