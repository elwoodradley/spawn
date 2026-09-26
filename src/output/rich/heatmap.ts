/**
 * Pure colour helpers for the array heatmap: parse the theme's CSS colours
 * and build a single-hue sequential ramp from the plot background (low) to
 * the first series colour (high). One hue, light to dark, never a rainbow.
 */
export type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb(...)`, `rgba(...)`; null otherwise. */
export function parseCssColor(input: string): Rgb | null {
  const text = input.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(text);
  if (hex?.[1] !== undefined) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      return [0, 1, 2].map((i) => parseInt((h[i] ?? "0").repeat(2), 16)) as Rgb;
    }
    if (h.length === 6 || h.length === 8) {
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
    }
    return null;
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(text);
  if (fn) {
    const parts = [fn[1], fn[2], fn[3]].map((v) => Math.round(Number(v ?? "NaN")));
    if (parts.every((v) => Number.isFinite(v))) return parts as Rgb;
  }
  return null;
}

/** Interpolate `from` → `to` at `t` in [0, 1]; clamps out-of-range t. */
export function rampColor(t: number, from: Rgb, to: Rgb): Rgb {
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
  return [mix(from[0], to[0]), mix(from[1], to[1]), mix(from[2], to[2])];
}

export function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** Map a value into [0, 1] over [min, max]; a flat range maps to 0.5. */
export function normalize(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return 0.5;
  return (value - min) / (max - min);
}

/** Min and max over a 2D preview, ignoring NaN; null if nothing finite. */
export function previewRange(preview: number[][]): [number, number] | null {
  let min = Infinity;
  let max = -Infinity;
  for (const row of preview) {
    for (const v of row) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return min === Infinity ? null : [min, max];
}
