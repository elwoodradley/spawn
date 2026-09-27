/**
 * Which interpreter to use when a project opens. Pure, so it is testable:
 * the saved per-project choice wins; otherwise the first candidate that is
 * not the operating system's own Python; the system Python only when it is
 * the only option, and then with a warning the chrome shows.
 */
import type { Candidate } from "../ipc";

export interface Choice {
  path: string | null;
  warning: string | null;
}

export function chooseInterpreter(candidates: readonly Candidate[], saved: string | null): Choice {
  if (saved && candidates.some((c) => c.path === saved)) {
    const picked = candidates.find((c) => c.path === saved);
    return { path: saved, warning: picked ? systemWarning(picked) : null };
  }
  const preferred = candidates.find((c) => c.source !== "system");
  if (preferred) return { path: preferred.path, warning: null };
  const only = candidates[0];
  if (!only) return { path: null, warning: null };
  return { path: only.path, warning: systemWarning(only) };
}

export function systemWarning(candidate: Candidate): string | null {
  if (candidate.source !== "system") return null;
  const version = candidate.version ? ` (${candidate.version})` : "";
  return `Using the system Python at ${candidate.path}${version}. Projects usually want their own environment: create a .venv from Select Python Interpreter.`;
}
