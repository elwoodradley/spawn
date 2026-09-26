/**
 * Cells: regions of a plain `.py` file delimited by `# %%` marker lines, the
 * convention Jupyter-style editors share. A cell is what you spawn into the
 * pool while iterating. Pure text rules, no Python parsing: a marker inside a
 * string is still a marker, the same way every other editor treats it.
 */

export interface CellRange {
  /** 0-based position in the file. */
  index: number;
  /** 0-based document offsets, `to` exclusive of the trailing newline. */
  from: number;
  to: number;
  /** 1-based lines, inclusive. */
  fromLine: number;
  toLine: number;
  /** Text after the marker, or null for an untitled cell. */
  title: string | null;
  /** 1-based line of the marker, or null for leading code with no marker. */
  markerLine: number | null;
}

/** What a marker line looks like: `# %%`, `#%%`, `# %% title`, `# In[3]:`. */
const MARKER = /^\s*#\s*(?:%%(.*)|In\[[^\]]*\]:?\s*)$/;

/** The subset of CodeMirror's `Text` the parser needs, so tests can pass strings. */
export interface DocLike {
  readonly lines: number;
  line(n: number): { from: number; to: number; text: string };
}

export function docFromString(text: string): DocLike {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  return {
    lines: lines.length,
    line: (n) => {
      const text = lines[n - 1] ?? "";
      const from = offsets[n - 1] ?? 0;
      return { from, to: from + text.length, text };
    },
  };
}

export function isCellMarker(lineText: string): boolean {
  return MARKER.test(lineText);
}

export function cellTitle(lineText: string): string | null {
  const m = MARKER.exec(lineText);
  const title = m?.[1]?.trim() ?? "";
  return title.length > 0 ? title : null;
}

/** Split a document into cells. A file with no markers is one cell. */
export function parseCells(input: DocLike | string): CellRange[] {
  const doc = typeof input === "string" ? docFromString(input) : input;
  const markers: number[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    if (isCellMarker(doc.line(n).text)) markers.push(n);
  }
  const cells: CellRange[] = [];

  const push = (fromLine: number, toLine: number, markerLine: number | null) => {
    const first = doc.line(fromLine);
    const last = doc.line(toLine);
    cells.push({
      index: cells.length,
      from: first.from,
      to: last.to,
      fromLine,
      toLine,
      title: markerLine === null ? null : cellTitle(doc.line(markerLine).text),
      markerLine,
    });
  };

  if (markers.length === 0) {
    push(1, doc.lines, null);
    return cells;
  }

  const firstMarker = markers[0] ?? 1;
  if (firstMarker > 1 && !blankRange(doc, 1, firstMarker - 1)) {
    push(1, firstMarker - 1, null);
  }
  markers.forEach((line, i) => {
    const next = markers[i + 1];
    push(line, next === undefined ? doc.lines : next - 1, line);
  });
  return cells;
}

function blankRange(doc: DocLike, fromLine: number, toLine: number): boolean {
  for (let n = fromLine; n <= toLine; n++) {
    if (doc.line(n).text.trim().length > 0) return false;
  }
  return true;
}

/** The cell containing offset `pos`. The last cell also owns the trailing newline. */
export function cellAt(cells: readonly CellRange[], pos: number): CellRange | undefined {
  return cells.find((c) => pos >= c.from && pos <= c.to) ?? cells[cells.length - 1];
}

/** Every cell up to and including the one at `pos`, in order. */
export function cellsThrough(cells: readonly CellRange[], pos: number): CellRange[] {
  const here = cellAt(cells, pos);
  return here ? cells.filter((c) => c.index <= here.index) : [];
}

/** The cell after `cell`, if any. */
export function nextCell(cells: readonly CellRange[], cell: CellRange): CellRange | undefined {
  return cells[cell.index + 1];
}

/** The code of a cell, without the marker line itself. */
export function cellCode(doc: DocLike, cell: CellRange): { code: string; startLine: number } {
  const startLine = cell.markerLine === cell.fromLine ? cell.fromLine + 1 : cell.fromLine;
  if (startLine > cell.toLine) return { code: "", startLine: cell.fromLine };
  const parts: string[] = [];
  for (let n = startLine; n <= cell.toLine; n++) parts.push(doc.line(n).text);
  return { code: parts.join("\n"), startLine };
}
