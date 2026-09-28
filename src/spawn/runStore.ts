/**
 * Persist the kept runs per project in the app store, so run history (with
 * its code snapshots) survives a restart. One store key holds a map from
 * project root to that project's runs; only the last few projects are kept.
 *
 * `installRunHistory()` wires it to the open project: when the project
 * changes the list is swapped, and every change to the list is written back.
 */
import { createEffect, createRoot, on } from "solid-js";
import { z } from "zod";

import { brood } from "../app/state";
import { getSetting, setSetting } from "../ipc";
import { capRuns, restoreRuns, runs, type RunRecord } from "./runHistory";

export const HISTORY_KEY = "runs.history";
/** Runs written to disk per project (the in-memory cap is a setting). */
export const MAX_STORED_RUNS = 10;
/** Projects whose history is kept; the least recently saved is dropped. */
export const MAX_STORED_PROJECTS = 8;

const PointSchema = z.object({ step: z.number(), value: z.number() });
const SeriesSchema = z.object({ name: z.string(), points: z.array(PointSchema) });
const SnapshotSchema = z.object({
  path: z.string(),
  code: z.string(),
  truncated: z.boolean().optional(),
  python: z.string(),
  cwd: z.string(),
  args: z.array(z.string()),
});
const BestSchema = z.object({ value: z.number(), step: z.number() });
export const RunRecordSchema = z.object({
  id: z.number().int(),
  startedAt: z.number(),
  file: z.string(),
  command: z.string(),
  durationMs: z.number(),
  outcome: z.enum(["ok", "croak", "stopped"]),
  series: z.array(SeriesSchema),
  snapshot: SnapshotSchema.optional(),
  finals: z.record(z.string(), z.number()).optional(),
  best: z.record(z.string(), BestSchema).optional(),
  xUnit: z.enum(["step", "epoch", "sample"]).optional(),
});

export interface StoredProject {
  savedAt: number;
  runs: RunRecord[];
}
export type StoredHistory = Record<string, StoredProject>;

/** Accept whatever is on disk; a bad run is dropped, a bad project too. */
export function parseHistory(input: unknown): StoredHistory {
  const out: StoredHistory = {};
  if (typeof input !== "object" || input === null) return out;
  for (const [root, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const raw = value as Record<string, unknown>;
    if (typeof raw.savedAt !== "number" || !Array.isArray(raw.runs)) continue;
    const kept: RunRecord[] = [];
    for (const run of raw.runs) {
      const parsed = RunRecordSchema.safeParse(run);
      if (parsed.success) kept.push(parsed.data);
    }
    out[root] = { savedAt: raw.savedAt, runs: kept };
  }
  return out;
}

/** The history with `root`'s runs replaced, capped, and old projects pruned. */
export function withProject(
  history: StoredHistory,
  root: string,
  list: readonly RunRecord[],
  now = Date.now(),
): StoredHistory {
  const next: StoredHistory = {
    ...history,
    [root]: { savedAt: now, runs: capRuns(list, MAX_STORED_RUNS) },
  };
  const roots = Object.keys(next).sort((a, b) => (next[b]?.savedAt ?? 0) - (next[a]?.savedAt ?? 0));
  for (const stale of roots.slice(MAX_STORED_PROJECTS)) delete next[stale];
  return next;
}

export async function loadRunHistory(root: string): Promise<RunRecord[]> {
  try {
    const history = parseHistory(await getSetting<unknown>(HISTORY_KEY, {}));
    return history[root]?.runs ?? [];
  } catch {
    return [];
  }
}

let queue: Promise<void> = Promise.resolve();

/** Read-modify-write the map; calls are serialised so none clobbers another. */
export function saveRunHistory(root: string, list: readonly RunRecord[]): Promise<void> {
  queue = queue.then(async () => {
    const history = parseHistory(await getSetting<unknown>(HISTORY_KEY, {}));
    await setSetting(HISTORY_KEY, withProject(history, root, list));
  }, undefined);
  queue = queue.catch(() => undefined);
  return queue;
}

/**
 * Swap the kept runs when the project changes and save them when they
 * change. Called once from App on mount, like the project settings.
 */
export function installRunHistory(): () => void {
  return createRoot((dispose) => {
    let current: string | null = null;
    createEffect(
      on(brood, (root) => {
        current = root;
        if (!root) {
          restoreRuns([]);
          return;
        }
        void loadRunHistory(root).then((list) => {
          if (current === root) restoreRuns(list);
        });
      }),
    );
    createEffect(
      on(
        runs,
        (list) => {
          if (current) void saveRunHistory(current, list);
        },
        { defer: true },
      ),
    );
    return dispose;
  });
}
