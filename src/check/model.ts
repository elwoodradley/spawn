/**
 * The pre-submit checklist's data model. Every check ends as one `CheckItem`
 * with a traffic-light state, a one-line title a first-course student can
 * read without searching, optional sub-rows (one per file path, say), a
 * jump target into the project and a raw-output block behind a toggle.
 */

export type CheckState = "running" | "pass" | "fail" | "warn" | "skip";

export type CheckId = "python" | "paths" | "fresh" | "tests";

export interface CheckLink {
  file: string;
  /** 1-based. */
  line: number;
}

export interface CheckRow {
  state: Exclude<CheckState, "running">;
  text: string;
  link?: CheckLink;
}

export interface CheckItem {
  id: CheckId;
  state: CheckState;
  title: string;
  /** A second, plain-language line: what to do about it. */
  hint?: string;
  /** Short rows shown under the title (one per path, for example). */
  rows?: CheckRow[];
  /** Raw program output, shown in an expandable block. */
  detail?: string;
  /** "Jump to the line" target. */
  link?: CheckLink;
  /** A button that runs a command, e.g. Select Python Interpreter. */
  action?: { label: string; command: string };
}

export const CHECK_TITLES: Record<CheckId, string> = {
  python: "Python version",
  paths: "File paths",
  fresh: "Runs from a fresh start",
  tests: "Tests",
};

/** The worst state in a list: fail beats warn beats pass; skips do not count. */
export function worstState(states: readonly CheckRow["state"][]): CheckRow["state"] {
  if (states.includes("fail")) return "fail";
  if (states.includes("warn")) return "warn";
  if (states.includes("pass")) return "pass";
  return "skip";
}

/** "3 of 4 checks passed", or what is still going on. */
export function summarize(items: readonly CheckItem[], running: boolean): string {
  if (items.length === 0) return running ? "Checking…" : "";
  const counted = items.filter((i) => i.state !== "skip" && i.state !== "running");
  const passed = counted.filter((i) => i.state === "pass").length;
  const failed = counted.filter((i) => i.state === "fail").length;
  const warned = counted.filter((i) => i.state === "warn").length;
  if (running) return `Checking… ${passed} passed so far`;
  if (counted.length === 0) return "Nothing to check";
  const parts = [`${passed} of ${counted.length} checks passed`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (warned > 0) parts.push(`${warned} to look at`);
  return parts.join(" · ");
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
