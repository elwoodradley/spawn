/**
 * Inline values per file. Kept outside CodeMirror state so switching tabs
 * keeps them and the console's restart can drop them all at once; the editor
 * extension reads `inlineEntries(path)` when it rebuilds decorations.
 */
import { createSignal } from "solid-js";

import type { VariableInfo } from "../../pool/protocol";
import { lineLabel, lineTitle } from "./format";

export interface InlineEntry {
  /** 1-based line in the file. */
  line: number;
  names: string[];
  /** The line's text when it ran; the value hides once the line differs. */
  text: string;
  label: string;
  title: string;
}

export interface FreshAssignment {
  line: number;
  names: string[];
  text: string;
}

export interface LineRange {
  from: number;
  to: number;
}

const files = new Map<string, InlineEntry[]>();
const [generation, setGeneration] = createSignal(0);
/** Bumps whenever any file's values change. */
export { generation as inlineGeneration };

export function inlineEntries(path: string): readonly InlineEntry[] {
  return files.get(path) ?? [];
}

function entryFor(
  fresh: FreshAssignment,
  byName: ReadonlyMap<string, VariableInfo>,
): InlineEntry | null {
  if (!fresh.names.some((n) => byName.has(n))) return null;
  return {
    line: fresh.line,
    names: fresh.names,
    text: fresh.text,
    label: lineLabel(fresh.names, byName),
    title: lineTitle(fresh.names, byName),
  };
}

/**
 * What a file's entries become after a run: lines in the executed range are
 * replaced by what that run assigned, every other line is relabelled from
 * the console's current variables (the namespace is shared, so a name
 * re-assigned elsewhere changes everywhere), and a line whose names are all
 * gone is dropped.
 */
export function mergeEntries(
  existing: readonly InlineEntry[],
  executed: LineRange,
  fresh: readonly FreshAssignment[],
  variables: readonly VariableInfo[],
): InlineEntry[] {
  const byName = new Map(variables.map((v) => [v.name, v]));
  const kept = existing.filter((e) => e.line < executed.from || e.line > executed.to);
  const next: InlineEntry[] = [];
  for (const source of [...kept, ...fresh]) {
    const entry = entryFor(source, byName);
    if (entry) next.push(entry);
  }
  return next.sort((a, b) => a.line - b.line);
}

/** Record what a finished run assigned in `path`. */
export function recordExec(
  path: string,
  executed: LineRange,
  fresh: readonly FreshAssignment[],
  variables: readonly VariableInfo[],
): void {
  files.set(path, mergeEntries(inlineEntries(path), executed, fresh, variables));
  setGeneration((g) => g + 1);
}

/** Forget one file's values, or every file's (the console restarted). */
export function clearInlineValues(path?: string): void {
  if (path === undefined) files.clear();
  else files.delete(path);
  setGeneration((g) => g + 1);
}
