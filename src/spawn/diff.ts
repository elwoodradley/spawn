/**
 * Line diff between two code snapshots, for "what changed between these
 * runs". Myers' O(ND) algorithm with the common head and tail trimmed
 * first, so a one-line edit in a long file costs almost nothing. A size
 * guard falls back to "everything removed, everything added" instead of
 * spending seconds on two unrelated files.
 *
 * Pure: strings in, ops out. `collapseContext` folds unchanged stretches
 * down to a few lines around each change, the way a code review shows them.
 */

export type DiffKind = "same" | "add" | "del";

export interface DiffOp {
  kind: DiffKind;
  text: string;
  /** 1-based line numbers in the old and new text; null on the other side. */
  a: number | null;
  b: number | null;
}

export interface DiffResult {
  ops: DiffOp[];
  /** False when the size guard replaced the exact diff with a whole-file swap. */
  exact: boolean;
}

/** Lines (after trimming the shared head and tail) worth diffing exactly. */
export const MAX_DIFF_LINES = 20_000;
/** Edit-script length beyond which the exact search stops. */
export const MAX_EDITS = 2_000;

export function splitLines(text: string): string[] {
  const lines = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function diffLines(a: string, b: string): DiffResult {
  const A = splitLines(a);
  const B = splitLines(b);
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let endA = A.length;
  let endB = B.length;
  while (endA > head && endB > head && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = A.slice(head, endA);
  const midB = B.slice(head, endB);

  const exact = midA.length + midB.length <= MAX_DIFF_LINES ? myers(midA, midB, MAX_EDITS) : null;
  const middle: Array<[DiffKind, string]> = exact ?? [
    ...midA.map((t): [DiffKind, string] => ["del", t]),
    ...midB.map((t): [DiffKind, string] => ["add", t]),
  ];

  const ops: DiffOp[] = [];
  let la = 0;
  let lb = 0;
  const push = (kind: DiffKind, text: string) => {
    ops.push({
      kind,
      text,
      a: kind === "add" ? null : ++la,
      b: kind === "del" ? null : ++lb,
    });
  };
  for (let i = 0; i < head; i++) push("same", A[i] ?? "");
  for (const [kind, text] of middle) push(kind, text);
  for (let i = endA; i < A.length; i++) push("same", A[i] ?? "");
  return { ops, exact: exact !== null };
}

/**
 * Myers' greedy shortest edit script. Each round keeps only the window of
 * furthest-reaching x values it touched, so memory is O(D²) and the guard
 * on D bounds both time and space. Returns null when the guard trips.
 */
function myers(
  a: readonly string[],
  b: readonly string[],
  maxD: number,
): Array<[DiffKind, string]> | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  if (max === 0) return [];
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= Math.min(max, maxD) && !found; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? 0) < (v[offset + k + 1] ?? 0));
      let x = down ? (v[offset + k + 1] ?? 0) : (v[offset + k - 1] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  if (!found) return null;

  const out: Array<[DiffKind, string]> = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const win = trace[d];
    if (!win) break;
    const at = (k: number) => win[k + d + 1] ?? 0;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      out.push(["same", a[x - 1] ?? ""]);
      x--;
      y--;
    }
    if (d > 0) out.push(x === prevX ? ["add", b[prevY] ?? ""] : ["del", a[prevX] ?? ""]);
    x = prevX;
    y = prevY;
  }
  return out.reverse();
}

export type DiffChunk = { kind: "lines"; ops: DiffOp[] } | { kind: "skip"; ops: DiffOp[] };

/** Keep `context` unchanged lines around each change; fold the rest. */
export function collapseContext(ops: readonly DiffOp[], context = 3): DiffChunk[] {
  const visible = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, i) => {
    if (op.kind === "same") return;
    for (let j = Math.max(0, i - context); j <= Math.min(ops.length - 1, i + context); j++) {
      visible[j] = true;
    }
  });
  const chunks: DiffChunk[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op) continue;
    const kind = visible[i] ? "lines" : "skip";
    const last = chunks[chunks.length - 1];
    if (last && last.kind === kind) last.ops.push(op);
    else chunks.push({ kind, ops: [op] });
  }
  return chunks;
}

export function diffStats(ops: readonly DiffOp[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.kind === "add") added++;
    else if (op.kind === "del") removed++;
  }
  return { added, removed };
}
