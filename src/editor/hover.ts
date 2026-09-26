/**
 * Hover inspection: rest the pointer on a name and the pool says what it is.
 *
 * Only dotted identifier chains are looked up (`model.layer1.weight`), never
 * expressions, and only while the pool is idle so a hover can neither run
 * code nor queue behind a running cell. Results are cached per name until
 * the next exec finishes, since values only change when code runs.
 */
import { createEffect, createRoot, on } from "solid-js";
import { render } from "solid-js/web";

import { pool, poolStatus } from "../pool/client";
import { execGeneration } from "../pool/live";
import type { DisplayPayload } from "../pool/protocol";
import { HoverCard } from "./HoverCard";
import "./hover.css";
import { hoverTooltip, type EditorView, type Tooltip } from "@codemirror/view";

export const HOVER_TIME_MS = 350;

const PYTHON_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "match",
  "case",
  "self",
  "cls",
]);

/** Names that are almost always the builtin, not something worth a card. */
const SKIP_BUILTINS = new Set([
  "print",
  "len",
  "range",
  "int",
  "float",
  "str",
  "list",
  "dict",
  "set",
  "tuple",
  "bool",
  "type",
  "isinstance",
  "enumerate",
  "zip",
  "map",
  "filter",
  "open",
  "input",
  "super",
  "object",
  "min",
  "max",
  "sum",
  "abs",
  "round",
  "sorted",
  "reversed",
  "any",
  "all",
]);

const isWord = (ch: string) => /[A-Za-z0-9_]/.test(ch);

export interface NameHit {
  name: string;
  from: number;
  to: number;
}

/**
 * The dotted identifier chain around `pos` in `text`, or null. Walks back
 * over word characters and dots, then forward over the same; stops at any
 * bracket, call or operator. `x[0]` at the `x` yields `x`; `a.b.c` anywhere
 * inside yields `a.b.c`; a number or keyword yields null.
 */
export function dottedNameAt(text: string, pos: number): NameHit | null {
  if (pos < 0 || pos > text.length) return null;
  let from = pos;
  let to = pos;
  const at = (i: number) => text[i] ?? "";
  // Allow hovering just after the last character of a name.
  if (!isWord(at(pos)) && at(pos) !== ".") {
    if (pos > 0 && (isWord(at(pos - 1)) || at(pos - 1) === ".")) {
      from = to = pos - 1;
    } else {
      return null;
    }
  }
  while (from > 0 && (isWord(at(from - 1)) || at(from - 1) === ".")) from--;
  while (to < text.length && (isWord(at(to)) || at(to) === ".")) to++;
  let name = text.slice(from, to);
  // Trim dangling dots (`obj.` while typing) and leading dots.
  while (name.startsWith(".")) {
    name = name.slice(1);
    from++;
  }
  while (name.endsWith(".")) {
    name = name.slice(0, -1);
    to--;
  }
  if (name.length === 0) return null;
  const parts = name.split(".");
  if (!parts.every((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p))) return null;
  const first = parts[0] ?? "";
  if (PYTHON_KEYWORDS.has(first) || (parts.length === 1 && SKIP_BUILTINS.has(first))) return null;
  return { name, from, to };
}

interface CacheEntry {
  generation: number;
  payload: DisplayPayload | null;
}

const cache = new Map<string, CacheEntry>();

/** Drop cached answers whenever an exec finishes: values may have changed. */
createRoot(() => {
  createEffect(on(execGeneration, () => cache.clear(), { defer: true }));
});

async function lookup(name: string): Promise<DisplayPayload | null> {
  const generation = execGeneration();
  const hit = cache.get(name);
  if (hit && hit.generation === generation) return hit.payload;
  const payload = await pool().inspect(name);
  cache.set(name, { generation, payload });
  return payload;
}

function tooltipFor(name: NameHit, payload: DisplayPayload): Tooltip {
  return {
    pos: name.from,
    end: name.to,
    above: true,
    create: () => {
      const dom = document.createElement("div");
      dom.className = "sp-hover";
      const dispose = render(() => HoverCard({ name: name.name, payload }), dom);
      return { dom, destroy: dispose };
    },
  };
}

async function source(view: EditorView, pos: number): Promise<Tooltip | null> {
  if (poolStatus() !== "idle") return null;
  const line = view.state.doc.lineAt(pos);
  const hit = dottedNameAt(line.text, pos - line.from);
  if (!hit) return null;
  const payload = await lookup(hit.name);
  if (!payload || payload.kind === "error") return null;
  return tooltipFor({ ...hit, from: line.from + hit.from, to: line.from + hit.to }, payload);
}

/** The editor extension. Add once to the base extensions. */
export function hoverInspection() {
  return hoverTooltip(source, { hoverTime: HOVER_TIME_MS, hideOnChange: true });
}
