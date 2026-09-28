/** The small O(n) numerics behind the training health check. Pure. */
import type { Point } from "./metrics";

export function values(points: readonly Point[]): number[] {
  return points.map((p) => p.value);
}

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/** A tenth of the series, between 3 and 15 points. */
export function windowFor(n: number): number {
  return Math.max(3, Math.min(15, Math.round(n / 10)));
}

/** Centred moving average of width `w` (edges shrink), via prefix sums: O(n). */
export function smooth(xs: readonly number[], w: number): number[] {
  const n = xs.length;
  const prefix = new Array<number>(n + 1);
  prefix[0] = 0;
  for (let i = 0; i < n; i++) prefix[i + 1] = (prefix[i] ?? 0) + (xs[i] ?? 0);
  const half = Math.floor(w / 2);
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    out[i] = ((prefix[hi + 1] ?? 0) - (prefix[lo] ?? 0)) / (hi - lo + 1);
  }
  return out;
}

/** Point-to-point jitter: mean absolute successive difference, scaled to a σ. */
export function noiseLevel(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < xs.length; i++) sum += Math.abs((xs[i] ?? 0) - (xs[i - 1] ?? 0));
  return sum / (xs.length - 1) / Math.SQRT2;
}

export function argmin(xs: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if ((xs[i] ?? 0) < (xs[best] ?? 0)) best = i;
  return best;
}

/** Index of the last point at or before `step` (0 when none is). */
export function indexAtStep(points: readonly Point[], step: number): number {
  let idx = 0;
  for (let i = 0; i < points.length; i++) if ((points[i]?.step ?? 0) <= step) idx = i;
  return idx;
}
