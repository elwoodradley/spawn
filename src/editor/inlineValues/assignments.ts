/**
 * Which lines of a piece of Python assign module-level names. Pure text
 * rules, no Python parser: enough to put a value beside `x = ...`,
 * `a, b = ...`, `name: int = ...`, `total += ...` and `for name in ...`, and
 * to leave alone what is not a global (bodies of `def` and `class`, keyword
 * arguments on continuation lines, anything inside a string).
 */
import { isCellMarker } from "../cells";

export interface AssignmentLine {
  /** 0-based index into the code's lines. */
  index: number;
  /** Names assigned on this line, in order. */
  names: string[];
  /** The line as it was, for the "unchanged since it ran" check. */
  text: string;
}

interface ScanState {
  /** The triple quote we are inside, across lines. */
  triple: '"""' | "'''" | null;
  /** Open brackets carried over from earlier lines. */
  depth: number;
}

/** Strip strings and comments from one line while tracking brackets. */
function stripLine(
  raw: string,
  st: ScanState,
): { code: string; startDepth: number; startInside: boolean } {
  const startDepth = st.depth;
  const startInside = st.triple !== null;
  let out = "";
  let i = 0;
  while (i < raw.length) {
    if (st.triple) {
      const end = raw.indexOf(st.triple, i);
      if (end < 0) return { code: out, startDepth, startInside };
      i = end + 3;
      st.triple = null;
      continue;
    }
    const ch = raw[i] ?? "";
    if (ch === "#") break;
    if (raw.startsWith('"""', i) || raw.startsWith("'''", i)) {
      st.triple = raw.slice(i, i + 3) as '"""' | "'''";
      i += 3;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < raw.length && raw[j] !== ch) j += raw[j] === "\\" ? 2 : 1;
      i = j + 1;
      continue;
    }
    if ("([{".includes(ch)) st.depth += 1;
    else if (")]}".includes(ch)) st.depth = Math.max(0, st.depth - 1);
    out += ch;
    i += 1;
  }
  return { code: out, startDepth, startInside };
}

/** `a, (b, c)` → ["a", "b", "c"]; anything that is not a plain name list → []. */
function targetList(text: string): string[] {
  const parts = text
    .replace(/[()[\]]/g, " ")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const names: string[] = [];
  for (const part of parts) {
    const m = /^\*?([A-Za-z_]\w*)$/.exec(part);
    if (!m?.[1]) return [];
    names.push(m[1]);
  }
  return names;
}

const FOR = /^for\s+(.+?)\s+in\b/;
const ASSIGN = /^(.*?)\s*(?:\*\*|\/\/|<<|>>|[-+*/%@&|^])?=(?!=)\s*(.*)$/;
const CHAIN = /^(.*?)\s*=(?!=)\s*(.*)$/;

/** Names a statement assigns, or [] when it is not a simple assignment. */
export function assignedNames(statement: string): string[] {
  const loop = FOR.exec(statement);
  if (loop?.[1]) return targetList(loop[1]);
  const m = ASSIGN.exec(statement);
  if (!m || m[1] === undefined) return [];
  let lhs = m[1];
  const colon = lhs.indexOf(":");
  if (colon >= 0) lhs = lhs.slice(0, colon); // `name: int = ...`
  const names = targetList(lhs);
  if (names.length === 0) return [];
  // `a = b = ...`: keep taking targets while what follows is another one.
  let rest = m[2] ?? "";
  for (;;) {
    const c = CHAIN.exec(rest);
    if (!c || c[1] === undefined) break;
    const more = targetList(c[1]);
    if (more.length === 0) break;
    names.push(...more);
    rest = c[2] ?? "";
  }
  return names;
}

/** Every line of `code` that assigns names at module level. */
export function findAssignments(code: string): AssignmentLine[] {
  const lines = code.split("\n");
  const st: ScanState = { triple: null, depth: 0 };
  let blockIndent: number | null = null;
  const out: AssignmentLine[] = [];
  lines.forEach((raw, index) => {
    const { code: stripped, startDepth, startInside } = stripLine(raw, st);
    if (startInside || startDepth > 0) return;
    const statement = stripped.trim();
    if (statement.length === 0) return;
    const indent = raw.length - raw.trimStart().length;
    if (blockIndent !== null) {
      if (indent > blockIndent) return; // inside a def or class body
      blockIndent = null;
    }
    if (/^(?:async\s+)?(?:def|class)\b/.test(statement)) {
      blockIndent = indent;
      return;
    }
    const names = assignedNames(statement);
    if (names.length > 0) out.push({ index, names, text: raw });
  });
  return out;
}

/**
 * Map each line of executed code to its 1-based line in the document. The
 * code normally starts at `startLine` and runs in step; "Run All Cells
 * Above" joins cells without their `# %%` markers, so a marker line in the
 * document is skipped when the code does not match it. A line that matches
 * nothing (edited while the run was going) maps to null.
 */
export function alignCodeLines(
  codeLines: readonly string[],
  docLines: readonly string[],
  startLine: number,
): (number | null)[] {
  let d = startLine - 1; // 0-based cursor into docLines
  return codeLines.map((code) => {
    while (d < docLines.length && docLines[d] !== code && isCellMarker(docLines[d] ?? "")) d += 1;
    const matched = d < docLines.length && docLines[d] === code;
    d += 1;
    return matched ? d : null;
  });
}
