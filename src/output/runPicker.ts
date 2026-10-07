/**
 * Compare mode for the runs strip: the user turns it on, ticks two kept
 * runs, and the Metrics tab swaps its charts for the comparison until it is
 * closed. Module-level signals so the strip and the view stay in step.
 *
 * Picks hold the records themselves, not ids: another project's history
 * reuses the same ids, and a tick must not carry over to its runs.
 */
import { createSignal } from "solid-js";

import { runs, type RunRecord } from "../spawn/runHistory";

const [compareMode, setCompareMode] = createSignal(false);
const [picked, setPicked] = createSignal<readonly RunRecord[]>([]);
export { compareMode, picked };

export function toggleCompareMode(): void {
  if (compareMode()) exitCompare();
  else setCompareMode(true);
}

export function exitCompare(): void {
  setCompareMode(false);
  setPicked([]);
}

/** Tick or untick a run; a third tick replaces the older of the two. */
export function togglePick(id: number): void {
  setPicked((list) => {
    const live = list.filter((r) => runs().includes(r));
    const run = runs().find((r) => r.id === id);
    if (!run) return live;
    if (live.includes(run)) return live.filter((r) => r !== run);
    return [...live.slice(-1), run];
  });
}

export function isPicked(id: number): boolean {
  return picked().some((r) => r.id === id && runs().includes(r));
}

/** The two picked runs once both exist, else null. */
export function comparing(): [RunRecord, RunRecord] | null {
  const [a, b] = picked();
  return a && b && runs().includes(a) && runs().includes(b) ? [a, b] : null;
}
