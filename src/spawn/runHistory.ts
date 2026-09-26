/**
 * The last few finished runs, kept in memory so the run panel can overlay a
 * previous run's curves on the live ones. Spawn the same file twice with
 * different hyperparameters and compare without screenshots.
 */
import { createSignal } from "solid-js";

import type { Series } from "./metrics";

export type RunOutcome = "ok" | "croak" | "stopped";

export interface RunRecord {
  id: number;
  startedAt: number;
  /** Base name of the spawned file, for the runs strip. */
  file: string;
  command: string;
  durationMs: number;
  outcome: RunOutcome;
  series: Series[];
}

/** Points kept per stored series; enough for a faint reference line. */
export const HISTORY_POINTS = 500;

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

/** Record a finished run. Series are cloned and downsampled. */
export function recordRun(
  run: Omit<RunRecord, "id" | "series"> & { series: readonly Series[] },
  keep: number,
): RunRecord | null {
  if (run.series.length === 0) return null;
  const record: RunRecord = {
    ...run,
    id: ++nextId,
    series: run.series.map((s) => ({
      name: s.name,
      points: downsample(s.points, HISTORY_POINTS).map((p) => ({ ...p })),
    })),
  };
  setRuns((list) => capRuns([...list, record], keep));
  return record;
}

export function removeRun(id: number): void {
  setRuns((list) => list.filter((r) => r.id !== id));
}

export function clearRuns(): void {
  setRuns([]);
}

/** Label like `#2 · 12:04 · 3.1s` for legends and the runs strip. */
export function runLabel(run: RunRecord): string {
  return `#${run.id} · ${clock(run.startedAt)} · ${(run.durationMs / 1000).toFixed(1)}s`;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
