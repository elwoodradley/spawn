/**
 * One short label per variable for the end of a line: shape and dtype for
 * arrays, `rows×cols` for DataFrames, the value for numbers, a short repr for
 * strings, `list[400]` for collections, the class name for models.
 */
import type { VariableInfo } from "../../pool/protocol";

const MAX_LABEL = 60;
const MAX_STRING = 40;

const SCALARS = new Set(["int", "float", "bool", "complex", "NoneType"]);
const COLLECTIONS = new Set(["list", "tuple", "set", "frozenset", "dict", "bytes", "bytearray"]);

/** `(400,)`, `(2, 3)`, `()`: how Python prints a shape. */
export function shapeText(shape: readonly number[]): string {
  return shape.length === 1 ? `(${shape[0]},)` : `(${shape.join(", ")})`;
}

function shortString(repr: string): string {
  if (repr.length <= MAX_STRING) return repr;
  const quote = repr[0] ?? "";
  return `${repr.slice(0, MAX_STRING - 2)}…${quote}`;
}

function clip(text: string): string {
  return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL - 1)}…` : text;
}

/** The label for one variable. */
export function inlineLabel(v: VariableInfo): string {
  const device = v.device ? ` ${v.device}` : "";
  if (v.shape && v.dtype) {
    // A 0-d array is one number; the console's summary already says which.
    return clip(v.shape.length === 0 ? v.summary : `${shapeText(v.shape)} ${v.dtype}${device}`);
  }
  if (v.shape) return clip(v.shape.join("×"));
  if (SCALARS.has(v.type) || COLLECTIONS.has(v.type)) return clip(v.summary);
  if (v.type === "str") return clip(shortString(v.summary));
  const plain = v.summary.length <= MAX_STRING && !v.summary.includes("\n") ? v.summary : v.type;
  return clip(`${plain}${device}`);
}

/** The label for a whole line: `a: …  b: …` when it assigns several names. */
export function lineLabel(
  names: readonly string[],
  byName: ReadonlyMap<string, VariableInfo>,
): string {
  const known = names.filter((n) => byName.has(n));
  if (known.length === 1) {
    const v = byName.get(known[0] ?? "");
    return v ? inlineLabel(v) : "";
  }
  return known
    .map((n) => {
      const v = byName.get(n);
      return v ? `${n}: ${inlineLabel(v)}` : "";
    })
    .join("  ");
}

/** The tooltip: every name with its type and full summary. */
export function lineTitle(
  names: readonly string[],
  byName: ReadonlyMap<string, VariableInfo>,
): string {
  return names
    .map((n) => byName.get(n))
    .filter((v): v is VariableInfo => v !== undefined)
    .map((v) => `${v.name}: ${v.type} ${v.summary}${v.device ? ` on ${v.device}` : ""}`)
    .join("\n");
}
