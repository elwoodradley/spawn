/**
 * The last few finished runs, kept so the run panel can overlay a previous
 * run's curves on the live ones and explain what changed between two runs.
 * Each record carries the metrics plus, when the controller could read it,
 * a snapshot of the code and settings the run started with. `runStore.ts`
 * persists the list per project; this module is the in-memory model.
 */
import { createSignal } from "solid-js";

import type { Series, XUnit } from "./metrics";
import { classify } from "./pairs";

export type RunOutcome = "ok" | "croak" | "stopped";

/** What a run started with: the file text and how it was launched. */
export interface RunSnapshot {
  /** Full path of the file that ran. */
  path: string;
  /** The file's text at run start, capped at `MAX_SNAPSHOT_CODE`. */
  code: string;
  /** True when `code` was cut to fit the cap. */
  truncated?: boolean;
  /** Interpreter path. */
  python: string;
  cwd: string;
  args: string[];
}

/** The best value a series reached and where. */
export interface BestPoint {
  value: number;
  step: number;
}

export interface RunRecord {
  id: number;
  startedAt: number;
  /** Base name of the spawned file, for the runs strip. */
  file: string;
  command: string;
  durationMs: number;
  outcome: RunOutcome;
  series: Series[];
  /** Optional, so records saved by older versions still load. */
  snapshot?: RunSnapshot;
  /** Last value of every series, by name. */
  finals?: Record<string, number>;
  /** Best value of every val series (lowest for losses, highest otherwise). */
  best?: Record<string, BestPoint>;
  xUnit?: XUnit;
}

/** Points kept per stored series; enough for a faint reference line. */
export const HISTORY_POINTS = 500;
/** Characters of code kept per run (about 200 KB). */
export const MAX_SNAPSHOT_CODE = 200_000;

const [runs, setRuns] = createSignal<readonly RunRecord[]>([]);
export { runs };

let nextId = 0;

/** Every nth point, always keeping the last so the end value is exact. */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const stride = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % stride === 0);
  const last = points[points.length - 1];
  if (last !== undefined && out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Cap a list of runs to `keep`, dropping the oldest. */
export function capRuns(list: readonly RunRecord[], keep: number): RunRecord[] {
  const n = Math.max(0, Math.floor(keep));
  return list.slice(Math.max(0, list.length - n));
}

/** Metrics where a smaller number is better. */
export const LOWER_IS_BETTER = /loss|nll|cost|error|err$|mse|mae|rmse|perplexity|ppl/i;

export function lowerIsBetter(name: string): boolean {
  return LOWER_IS_BETTER.test(name);
}

/** The last value of every series, by name. */
export function finalsOf(series: readonly Series[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of series) {
    const last = s.points[s.points.length - 1];
    if (last) out[s.name] = last.value;
  }
  return out;
}

/** The best point of every val series (`val_loss`, `val/acc`, ...). */
export function bestOf(series: readonly Series[]): Record<string, BestPoint> {
  const out: Record<string, BestPoint> = {};
  for (const s of series) {
    if (classify(s.name).side !== "val" || s.points.length === 0) continue;
    const lower = lowerIsBetter(s.name);
    let best = s.points[0];
    for (const p of s.points) {
      if (!best || (lower ? p.value < best.value : p.value > best.value)) best = p;
    }
    if (best) out[s.name] = { value: best.value, step: best.step };
  }
  return out;
}

/** Fit a snapshot's code under the cap, flagging the cut. */
export function capSnapshot(snapshot: RunSnapshot): RunSnapshot {
  if (snapshot.code.length <= MAX_SNAPSHOT_CODE) return snapshot;
  return { ...snapshot, code: snapshot.code.slice(0, MAX_SNAPSHOT_CODE), truncated: true };
}

/** Record a finished run. Series are cloned and downsampled; finals and best values are computed from the full series first. */
export function recordRun(
  run: Omit<RunRecord, "id" | "series" | "finals" | "best"> & { series: readonly Series[] },
  keep: number,
): RunRecord | null {
  if (run.series.length === 0) return null;
  const record: RunRecord = {
    ...run,
    id: ++nextId,
    finals: finalsOf(run.series),
    best: bestOf(run.series),
    series: run.series.map((s) => ({
      name: s.name,
      points: downsample(s.points, HISTORY_POINTS).map((p) => ({ ...p })),
    })),
  };
  if (run.snapshot) record.snapshot = capSnapshot(run.snapshot);
  setRuns((list) => capRuns([...list, record], keep));
  return record;
}

/** Replace the list with runs loaded from disk; ids keep counting upward. */
export function restoreRuns(list: readonly RunRecord[]): void {
  for (const r of list) nextId = Math.max(nextId, r.id);
  setRuns([...list]);
}

export function removeRun(id: number): void {
  setRuns((list) => list.filter((r) => r.id !== id));
}

export function clearRuns(): void {
  setRuns([]);
}

/** True when both runs saved code and it differs; null when either did not. */
export function codeChanged(a: RunRecord, b: RunRecord): boolean | null {
  if (!a.snapshot || !b.snapshot) return null;
  return a.snapshot.code !== b.snapshot.code;
}

/** Label like `#2 · 12:04 · 3.1s` for legends and the runs strip. */
export function runLabel(run: RunRecord): string {
  return `#${run.id} · ${clock(run.startedAt)} · ${(run.durationMs / 1000).toFixed(1)}s`;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
