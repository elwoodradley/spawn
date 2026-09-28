/**
 * Check 2: is the selected interpreter the Python the course expects?
 *
 * The expectation comes from, in order: `requires-python` in
 * pyproject.toml, `.python-version`, or `pythonVersion` in
 * `.spawn/project.json`. Specifiers are PEP 440 style (`>=3.11`,
 * `~=3.11.0`, `==3.11.*`, `!=3.9.6`, comma-separated). Everything here is
 * pure; the runner reads the files and the interpreter's version.
 */
import type { CheckItem } from "./model";

export interface Expectation {
  /** Normalised specifier, e.g. `>=3.11`. */
  spec: string;
  /** What the file said, for the message. */
  display: string;
  source: "pyproject.toml" | ".python-version" | ".spawn/project.json";
}

export interface ExpectationSources {
  pyproject?: string | null;
  pythonVersionFile?: string | null;
  /** The already-parsed `pythonVersion` field. */
  projectJsonVersion?: string | null;
}

/** `3.12.3`, `Python 3.12.3`, `cpython@3.12` → [3, 12, 3]. Null if no number. */
export function parseVersion(text: string): number[] | null {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text);
  if (!match) return null;
  return match
    .slice(1)
    .filter((part): part is string => part !== undefined)
    .map(Number);
}

function compare(a: number[], b: number[]): number {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Does `a` start with `b` (3.11.4 starts with 3.11)? */
function startsWith(a: number[], b: number[]): boolean {
  return b.every((part, i) => (a[i] ?? 0) === part);
}

const CLAUSE = /^(~=|==|!=|<=|>=|<|>)\s*v?(\d+(?:\.\d+)*)(\.\*)?$/;

function satisfiesClause(version: number[], clause: string): boolean | null {
  const match = CLAUSE.exec(clause.trim());
  if (!match) return null;
  const [, op, number, wildcard] = match;
  const target = number?.split(".").map(Number) ?? [];
  if (op === undefined || target.length === 0) return null;
  const prefixMatch = startsWith(version, target);
  switch (op) {
    case "==":
      return wildcard ? prefixMatch : compare(version, target) === 0;
    case "!=":
      return wildcard ? !prefixMatch : compare(version, target) !== 0;
    case ">=":
      return compare(version, target) >= 0;
    case ">":
      return compare(version, target) > 0;
    case "<=":
      return compare(version, target) <= 0;
    case "<":
      return compare(version, target) < 0;
    case "~=": {
      // Compatible release: >= X.Y.Z and == X.Y.*; needs two components.
      if (target.length < 2) return null;
      return compare(version, target) >= 0 && startsWith(version, target.slice(0, -1));
    }
    default:
      return null;
  }
}

/**
 * True when `version` meets every comma-separated clause of `spec`.
 * Null when the version or the spec cannot be read.
 */
export function satisfies(version: string, spec: string): boolean | null {
  const parsed = parseVersion(version);
  if (!parsed) return null;
  const clauses = spec
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  if (clauses.length === 0) return null;
  let ok = true;
  for (const clause of clauses) {
    const result = satisfiesClause(parsed, clause);
    if (result === null) return null;
    ok = ok && result;
  }
  return ok;
}

/** `requires-python = ">=3.11"` in the `[project]` table. */
export function requiresPythonFrom(pyproject: string): string | null {
  const match = /^\s*requires-python\s*=\s*["']([^"']+)["']/m.exec(pyproject);
  return match?.[1]?.trim() ?? null;
}

/**
 * A bare version like `3.11` or `3.11.4` (as `.python-version` holds) means
 * "that release line": `~=3.11.0` / `~=3.11.4`. Anything starting with an
 * operator is already a specifier.
 */
export function specFromBare(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (/^[<>=!~]/.test(trimmed)) return trimmed;
  const parsed = parseVersion(trimmed);
  if (!parsed) return null;
  if (parsed.length === 1) return `==${parsed[0]}.*`;
  const padded = parsed.length === 2 ? [...parsed, 0] : parsed;
  return `~=${padded.join(".")}`;
}

export function expectedPython(sources: ExpectationSources): Expectation | null {
  const requires = sources.pyproject ? requiresPythonFrom(sources.pyproject) : null;
  if (requires) return { spec: requires, display: requires, source: "pyproject.toml" };
  const firstLine = sources.pythonVersionFile
    ?.split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith("#"));
  if (firstLine) {
    const spec = specFromBare(firstLine);
    if (spec) return { spec, display: firstLine, source: ".python-version" };
  }
  if (sources.projectJsonVersion) {
    const spec = specFromBare(sources.projectJsonVersion);
    if (spec) {
      return { spec, display: sources.projectJsonVersion, source: ".spawn/project.json" };
    }
  }
  return null;
}

/** The checklist item, from the expectation and the interpreter's version. */
export function pythonVersionItem(
  expectation: Expectation | null,
  version: string | null,
): CheckItem {
  const title = "Python version";
  if (!expectation) {
    return {
      id: "python",
      state: "skip",
      title: `${title}: the project does not say which Python it needs`,
      hint: "Add requires-python to pyproject.toml or a .python-version file to have this checked.",
    };
  }
  const where = `${expectation.display} (${expectation.source})`;
  if (!version) {
    return {
      id: "python",
      state: "warn",
      title: `${title}: could not read the interpreter's version`,
      hint: `The course expects ${where}. Choose an interpreter with Select Python Interpreter.`,
      action: { label: "Select Python Interpreter", command: "metamorphosis.open" },
    };
  }
  const ok = satisfies(version, expectation.spec);
  if (ok === null) {
    return {
      id: "python",
      state: "warn",
      title: `${title}: could not understand "${expectation.display}"`,
      hint: `SPAWN reads specifiers such as >=3.11 or 3.11 from ${expectation.source}. You are running ${version}.`,
    };
  }
  if (ok) {
    return { id: "python", state: "pass", title: `Python ${version} matches ${where}` };
  }
  return {
    id: "python",
    state: "fail",
    title: `Course expects Python ${expectation.display} but you are running ${version}`,
    hint: `Pick a matching interpreter with Select Python Interpreter (expected from ${expectation.source}).`,
    action: { label: "Select Python Interpreter", command: "metamorphosis.open" },
  };
}
