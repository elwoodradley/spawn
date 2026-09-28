/**
 * Check 3, part one: find string literals a Python file uses as file paths.
 *
 * A light tokenizer finds every plain string literal (f-strings, bytes and
 * triple-quoted strings are skipped: dynamic, binary, or prose). For each
 * one it looks at the enclosing call: `open`, `Path`, `pd.read_csv`,
 * `np.load`, `torch.save`, `Image.open` and friends make the first argument
 * a path whatever it looks like; anywhere else a literal counts only when it
 * looks like a path (has a slash anchor or a data-file extension). `open`
 * modes and writer functions mark a path as written rather than read.
 *
 * Pure: no filesystem here. `paths.ts` checks existence and classifies.
 */

import { IGNORED_CALLEES, JOIN_LIKE, PATH_LIBS, READ_CALLEES, WRITE_CALLEES } from "./pathCallees";

export type PathUse = "read" | "write" | "unknown";

export interface PathRef {
  /** As written, with backslashes normalised to `/`. */
  path: string;
  /** 1-based line of the literal. */
  line: number;
  use: PathUse;
  /** The call the literal sits in, e.g. `pd.read_csv`, or null. */
  via: string | null;
}

interface Literal {
  value: string;
  line: number;
  /** Index of the opening quote (after any prefix) in the source. */
  from: number;
  /** Index just past the closing quote. */
  to: number;
  skip: boolean;
}

interface Call {
  callee: string;
  /** The callee is a method on an expression: `", ".join(...)`. */
  onExpression: boolean;
  open: number;
  close: number;
  args: Array<{ from: number; to: number; text: string }>;
}

const EXTENSION =
  /\.(csv|tsv|txt|json|jsonl|npy|npz|pt|pth|pkl|pickle|png|jpe?g|gif|bmp|tiff?|parquet|xlsx?|h5|hdf5|ya?ml|toml|ini|cfg|md|log|wav|mp[34]|zip|gz|tar|onnx|ckpt|safetensors|bin|dat|xml|html|py)$/i;
const MODE = /^[rwaxbt+U]{1,4}$/;

/** Never a path: URLs, formats, globs, whitespace, bare punctuation. */
export function rejectedAsPath(s: string): boolean {
  if (s.length === 0 || /\s/.test(s)) return true;
  if (/:\/\//.test(s) || /[%*?<>|{}]/.test(s)) return true;
  if (!/[A-Za-z0-9]/.test(s)) return true;
  if (/^\.[A-Za-z0-9]+$/.test(s)) return true; // ".csv" alone: an extension test
  return false;
}

/** A literal that reads as a path on its own, outside any known call. */
export function looksLikePath(s: string): boolean {
  if (rejectedAsPath(s)) return false;
  if (EXTENSION.test(s)) return true;
  if (!/[\\/]/.test(s)) return false;
  return /^(\.{1,2}[\\/]|~|[A-Za-z]:|\/)/.test(s) || /[\\/]$/.test(s);
}

/** Every string literal, plus a copy of the source with their insides blanked. */
export function tokenize(source: string): { literals: Literal[]; masked: string } {
  const literals: Literal[] = [];
  const masked = source.split("");
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const prefix = /[A-Za-z]{0,2}$/.exec(source.slice(Math.max(0, i - 2), i))?.[0] ?? "";
      const triple = source.startsWith(ch.repeat(3), i);
      const quote = triple ? ch.repeat(3) : ch;
      const from = i;
      let j = i + quote.length;
      let value = "";
      const raw = /r/i.test(prefix);
      while (j < source.length && !source.startsWith(quote, j)) {
        const c = source[j] ?? "";
        if (c === "\n") line++;
        if (c === "\\" && j + 1 < source.length) {
          const next = source[j + 1] ?? "";
          value += raw ? c + next : next;
          j += 2;
          continue;
        }
        value += c;
        j++;
      }
      const to = Math.min(source.length, j + quote.length);
      for (let k = from + quote.length; k < j; k++) masked[k] = " ";
      literals.push({
        value,
        line: line - (value.match(/\n/g)?.length ?? 0),
        from,
        to,
        skip: triple || /[fb]/i.test(prefix),
      });
      i = to;
      continue;
    }
    i++;
  }
  return { literals, masked: masked.join("") };
}

/** The call whose argument list contains `index`, if any (nearest one). */
function enclosingCall(masked: string, index: number): Call | null {
  let depth = 0;
  for (let i = index - 1; i >= 0 && index - i < 4000; i--) {
    const ch = masked[i];
    if (ch === ")" || ch === "]" || ch === "}") depth++;
    else if (ch === "[" || ch === "{") {
      if (depth === 0) return null;
      depth--;
    } else if (ch === "(") {
      if (depth > 0) {
        depth--;
        continue;
      }
      return describeCall(masked, i);
    }
  }
  return null;
}

function describeCall(masked: string, open: number): Call | null {
  let nameEnd = open;
  while (nameEnd > 0 && /\s/.test(masked[nameEnd - 1] ?? "")) nameEnd--;
  let nameStart = nameEnd;
  while (nameStart > 0 && /[\w.]/.test(masked[nameStart - 1] ?? "")) nameStart--;
  const rawName = masked.slice(nameStart, nameEnd);
  if (rawName.length === 0 || /^\d/.test(rawName)) return null;
  const onExpression = rawName.startsWith(".");
  const callee = onExpression ? rawName.slice(1) : rawName;
  if (callee.length === 0) return null;
  // Find the matching close paren and split the arguments on depth-0 commas.
  let depth = 0;
  let argFrom = open + 1;
  const args: Call["args"] = [];
  const pushArg = (to: number) => {
    const text = masked.slice(argFrom, to);
    const lead = text.length - text.trimStart().length;
    args.push({ from: argFrom + lead, to: argFrom + text.trimEnd().length, text: text.trim() });
  };
  for (let i = open + 1; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        pushArg(i);
        return { callee, onExpression, open, close: i, args };
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      pushArg(i);
      argFrom = i + 1;
    }
  }
  return null;
}

/** Keyword argument name if the arg is `name=<literal>`. */
function keywordOf(text: string): string | null {
  return /^(\w+)\s*=/.exec(text)?.[1] ?? null;
}

const lastName = (callee: string) => callee.split(".").pop() ?? callee;
const qualifier = (callee: string) => callee.split(".").slice(-2, -1)[0] ?? "";

function normalise(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Find the literals used as paths in one Python file. */
export function scanPaths(source: string): PathRef[] {
  const { literals, masked } = tokenize(source);
  const lines = source.split(/\r?\n/);
  const byStart = new Map(literals.map((l) => [l.from, l]));
  const literalAt = (arg: { from: number; to: number; text: string }): Literal | null => {
    const keyword = /^\w+\s*=\s*/.exec(arg.text)?.[0].length ?? 0;
    const prefixed = /^[A-Za-z]{0,2}["']/.exec(arg.text.slice(keyword));
    if (!prefixed) return null;
    const lit = byStart.get(arg.from + keyword + prefixed[0].length - 1);
    return lit && lit.to === arg.to && !lit.skip ? lit : null;
  };
  const refs: PathRef[] = [];
  const seenCalls = new Set<number>();
  const claimed = new Set<number>();
  const claim = (lit: Literal) => {
    claimed.add(lit.from);
  };
  const add = (lit: Literal, use: PathUse, via: string | null, path = lit.value) => {
    claim(lit);
    const norm = normalise(path);
    if (refs.some((r) => r.path === norm && r.use === use)) return;
    refs.push({ path: norm, line: lit.line, use, via });
  };
  /** The mode literal of a `.open("w")` right after `close`, read from the real literals. */
  const openModeAfter = (close: number): string | null => {
    const m = /^\s*\.\s*open\s*\(\s*/.exec(masked.slice(close + 1, close + 30));
    if (!m) return null;
    const lit = byStart.get(close + 1 + m[0].length);
    return lit && MODE.test(lit.value) ? lit.value : null;
  };
  const anchored = (lit: Literal) => {
    const before = masked.slice(Math.max(0, lit.from - 40), lit.from).trimEnd();
    return before.endsWith("/") || (lines[lit.line - 1] ?? "").includes("__file__");
  };

  for (const lit of literals) {
    if (lit.skip || claimed.has(lit.from)) continue;
    const call = enclosingCall(masked, lit.from);
    if (call && !seenCalls.has(call.open)) {
      seenCalls.add(call.open);
      scanCall(call, masked, literalAt, { add, claim, openModeAfter });
    }
    if (claimed.has(lit.from)) continue;
    if (call && IGNORED_CALLEES.has(lastName(call.callee))) continue;
    if (!anchored(lit) && looksLikePath(lit.value)) add(lit, "unknown", null);
  }
  return refs.slice(0, 40);
}

function scanCall(
  call: Call,
  masked: string,
  literalAt: (arg: Call["args"][number]) => Literal | null,
  sink: {
    add: (lit: Literal, use: PathUse, via: string | null, path?: string) => void;
    /** Mark a literal as handled without reporting it (an anchored join part). */
    claim: (lit: Literal) => void;
    openModeAfter: (close: number) => string | null;
  },
): void {
  const { add, claim } = sink;
  const name = lastName(call.callee);
  const via = call.callee;
  const literalArgs = call.args.map((arg) => ({
    arg,
    lit: literalAt(arg),
    kw: keywordOf(arg.text),
  }));

  if (JOIN_LIKE.has(name) && !(name === "join" && call.onExpression)) {
    // os.path.join("data", "x.csv") / Path("data") / "x.csv": leading literal
    // args combine; a variable first arg anchors everything after it.
    for (const { lit } of literalArgs) if (lit) claim(lit);
    const leading: Literal[] = [];
    for (const { lit, kw } of literalArgs) {
      if (!lit || kw) break;
      leading.push(lit);
    }
    const first = leading[0];
    if (!first) return;
    const after = masked.slice(call.close + 1, call.close + 40);
    const mode = sink.openModeAfter(call.close);
    const writes =
      /^\s*\.\s*(write_text|write_bytes|mkdir|touch|unlink)\b/.test(after) ||
      (mode !== null && /[wax]/.test(mode));
    add(first, writes ? "write" : "read", via, leading.map((l) => l.value).join("/"));
    return;
  }

  if (name === "open") {
    // `Path(...).open("w")` was handled with the Path call; `f.open(...)` is not a file path.
    if (call.onExpression) return;
    const pathArg = literalArgs.find(({ kw }, i) => (i === 0 && !kw) || kw === "file");
    if (!pathArg?.lit || rejectedAsPath(pathArg.lit.value)) return;
    const mode = literalArgs.find(
      ({ lit, kw }, i) => lit && ((i === 1 && !kw) || kw === "mode") && MODE.test(lit.value),
    );
    const writes = mode?.lit !== null && mode?.lit !== undefined && /[wax]/.test(mode.lit.value);
    add(pathArg.lit, writes ? "write" : "read", via);
    return;
  }

  // `Path(...).mkdir()`: the path is the receiver, handled with the Path call.
  if (call.onExpression && (name === "mkdir" || name === "touch")) return;
  const generic = name === "load" || name === "save";
  const known = READ_CALLEES.has(name) || WRITE_CALLEES.has(name) || generic;
  if (!known || IGNORED_CALLEES.has(name)) return;
  const use: PathUse = WRITE_CALLEES.has(name) || name === "save" ? "write" : "read";
  literalArgs.forEach(({ lit, kw }, i) => {
    if (!lit || rejectedAsPath(lit.value)) return;
    const firstPositional = i === 0 && !kw;
    const trusted = !generic || PATH_LIBS.has(qualifier(call.callee));
    if ((firstPositional && trusted) || looksLikePath(lit.value)) add(lit, use, via);
  });
}
