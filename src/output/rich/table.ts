/** Pure helpers for the table block: row windowing, sorting, cell formatting. */
import type { Cell, ColumnInfo } from "../../pool/protocol";

export interface Window {
  /** First row index rendered. */
  start: number;
  /** One past the last row index rendered. */
  end: number;
  /** Spacer heights so the scrollbar reflects every row. */
  topPad: number;
  bottomPad: number;
}

/** Which rows to render for a scroll position; a few extra above and below. */
export function visibleWindow(
  scrollTop: number,
  rowHeight: number,
  viewportHeight: number,
  total: number,
  overscan = 5,
): Window {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const count = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(total, first + count + overscan);
  return {
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: (total - end) * rowHeight,
  };
}

export type SortDir = "asc" | "desc";

/** Nulls last in either direction; numbers numerically; the rest as text. */
export function compareCells(a: Cell, b: Cell): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** A sorted copy of row indices, so the index column follows the data. */
export function sortedOrder(rows: Cell[][], column: number, dir: SortDir): number[] {
  const order = rows.map((_, i) => i);
  order.sort((i, j) => {
    const a = rows[i]?.[column] ?? null;
    const b = rows[j]?.[column] ?? null;
    // Nulls stay last whichever way the data is sorted.
    if (a === null || b === null) return compareCells(a, b);
    const c = compareCells(a, b);
    return dir === "asc" ? c : -c;
  });
  return order;
}

export function isNumericDtype(dtype: string): boolean {
  return /^(int|uint|float|decimal|number|i\d|u\d|f\d)/i.test(dtype);
}

/** Compact cell text: floats to 4 significant decimals, nulls as ∅. */
export function formatCell(value: Cell): string {
  if (value === null) return "∅";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return String(value);
    const abs = Math.abs(value);
    if (abs >= 1e6 || (abs < 1e-4 && abs > 0)) return value.toExponential(3);
    return trimZeros(value.toFixed(4));
  }
  if (typeof value === "boolean") return value ? "True" : "False";
  return value;
}

function trimZeros(text: string): string {
  return text.replace(/\.?0+$/, "");
}

export function describeColumn(col: ColumnInfo): string {
  const parts = [`${col.dtype}`, `${col.nulls} null${col.nulls === 1 ? "" : "s"}`];
  if (col.stats) {
    parts.push(
      `min ${formatCell(col.stats.min)}`,
      `max ${formatCell(col.stats.max)}`,
      `mean ${formatCell(col.stats.mean)}`,
      `std ${formatCell(col.stats.std)}`,
    );
  }
  return parts.join(" · ");
}
