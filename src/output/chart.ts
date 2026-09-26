/** Pure helpers for the run panel charts: scales, ticks, number formatting. */

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

export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "–";
  if (rate >= 100) return `${rate.toFixed(0)} it/s`;
  if (rate >= 1) return `${rate.toFixed(1)} it/s`;
  return `${(1 / rate).toFixed(1)} s/it`;
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
