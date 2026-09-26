/** Pure helpers for the confusion-matrix block. */
import { normalize, type Rgb } from "./heatmap";

export interface ClassRow {
  index: number;
  label: string;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  support: number;
}

export type ClassKey = "label" | "precision" | "recall" | "f1" | "support";

export function classRows(
  labels: string[] | null,
  perClass: readonly {
    precision: number | null;
    recall: number | null;
    f1: number | null;
    support: number;
  }[],
): ClassRow[] {
  return perClass.map((c, i) => ({ index: i, label: labels?.[i] ?? String(i), ...c }));
}

/** Sort rows by a column; nulls sink to the end in either direction. */
export function sortClassRows(rows: ClassRow[], key: ClassKey, dir: "asc" | "desc"): ClassRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "string" && typeof y === "string") return sign * x.localeCompare(y);
    return sign * (Number(x) - Number(y));
  });
}

/** Fraction of the cell's ramp: values scale against the largest cell. */
export function cellIntensity(value: number, max: number): number {
  return normalize(value, 0, max);
}

/** Relative luminance (sRGB) for choosing readable text on a cell. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** True when light text reads better on this background. */
export function prefersLightText(bg: Rgb): boolean {
  return luminance(bg) < 0.4;
}

export function formatPct(value: number | null): string {
  return value === null ? "–" : `${(value * 100).toFixed(1)}%`;
}

/** `X[[3, 17, 42]]`-ready text for pasting into code. */
export function indicesAsList(indices: readonly number[]): string {
  return `[${indices.join(", ")}]`;
}

/** Overall accuracy from the diagonal. */
export function accuracy(values: number[][]): number | null {
  let diag = 0;
  let total = 0;
  values.forEach((row, i) => {
    row.forEach((v, j) => {
      total += v;
      if (i === j) diag += v;
    });
  });
  return total > 0 ? diag / total : null;
}
