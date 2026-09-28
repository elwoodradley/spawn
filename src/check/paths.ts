/**
 * Check 3, part two: classify each path the scanner found.
 *
 * Absolute paths only work on this machine (yellow). A relative read that
 * resolves from the run's working directory is fine (green); one that
 * resolves only from the other candidate folder (project root vs the
 * file's folder) is the classic "works for me, fails for the grader" bug
 * (red); one found nowhere is red for a known read and yellow when the
 * literal merely looked like a path. Writes are green unless absolute.
 */
import type { CheckItem, CheckRow } from "./model";
import { plural, worstState } from "./model";
import type { PathRef } from "./pathScan";

export { scanPaths, type PathRef } from "./pathScan";

export interface PathExistence {
  /** Resolves from the working directory the run uses. */
  fromCwd: boolean;
  /** Resolves from the other candidate folder (null when there is none). */
  fromOther: boolean | null;
}

export interface PathContext {
  file: string;
  /** Display names like `puzzles/` and `hw3/`. */
  cwdLabel: string;
  otherLabel: string | null;
}

export function isAbsolutePath(path: string): boolean {
  return /^(\/|~|[A-Za-z]:[\\/]|\\\\)/.test(path);
}

export function classifyPath(ref: PathRef, exists: PathExistence, ctx: PathContext): CheckRow {
  const link = { file: ctx.file, line: ref.line };
  const via = ref.via ? ` in ${ref.via}(…)` : "";
  if (isAbsolutePath(ref.path)) {
    return {
      state: "warn",
      link,
      text: `${ref.path}${via}: absolute path, only works on this machine. Use a path relative to the project instead.`,
    };
  }
  if (ref.use === "write") {
    return { state: "pass", link, text: `${ref.path}${via}: written by the program` };
  }
  if (exists.fromCwd) {
    return { state: "pass", link, text: `${ref.path}${via}: found from ${ctx.cwdLabel}` };
  }
  if (exists.fromOther && ctx.otherLabel) {
    return {
      state: "fail",
      link,
      text: `${ref.path}${via}: not found from ${ctx.cwdLabel}, where the program runs, but it exists from ${ctx.otherLabel}. Change the path or the working directory (Settings › Run) so they agree.`,
    };
  }
  if (ref.use === "read") {
    return {
      state: "fail",
      link,
      text: `${ref.path}${via}: file not found from ${ctx.cwdLabel}${ctx.otherLabel ? ` or ${ctx.otherLabel}` : ""}. The program will stop with FileNotFoundError.`,
    };
  }
  return {
    state: "warn",
    link,
    text: `${ref.path}: not found from ${ctx.cwdLabel}. Fine if the program creates it first; otherwise check the spelling.`,
  };
}

/** One item for the whole check, with a row per path. */
export function pathsItem(rows: CheckRow[]): CheckItem {
  if (rows.length === 0) {
    return {
      id: "paths",
      state: "skip",
      title: "File paths: the program does not open any files by name",
    };
  }
  const state = worstState(rows.map((r) => r.state));
  const failed = rows.filter((r) => r.state === "fail").length;
  const warned = rows.filter((r) => r.state === "warn").length;
  const counted = plural(rows.length, "file path");
  if (state === "fail") {
    return {
      id: "paths",
      state,
      rows,
      title: `${plural(failed, "file path")} of ${rows.length} will not be found when the program runs`,
      hint: "A relative path is looked up from the folder the program starts in, not from where the file is saved.",
    };
  }
  if (state === "warn") {
    return {
      id: "paths",
      state,
      rows,
      title: `${counted} checked, ${warned} to look at`,
    };
  }
  return { id: "paths", state: "pass", rows, title: `${counted} checked, all found` };
}
