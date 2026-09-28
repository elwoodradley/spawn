/**
 * Compare mode for the runs strip: the user turns it on, ticks two kept
 * runs, and the Metrics tab swaps its charts for the comparison until it is
 * closed. Module-level signals so the strip and the view stay in step.
 */
import { createSignal } from "solid-js";

import { runs, type RunRecord } from "../spawn/runHistory";

const [compareMode, setCompareMode] = createSignal(false);
const [picked, setPicked] = createSignal<readonly number[]>([]);
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
    const live = list.filter((x) => runs().some((r) => r.id === x));
    if (live.includes(id)) return live.filter((x) => x !== id);
    return [...live.slice(-1), id];
  });
}

export function isPicked(id: number): boolean {
  return picked().includes(id);
}

/** The two picked runs once both exist, else null. */
export function comparing(): [RunRecord, RunRecord] | null {
  const [x, y] = picked();
  if (x === undefined || y === undefined) return null;
  const a = runs().find((r) => r.id === x);
  const b = runs().find((r) => r.id === y);
  return a && b ? [a, b] : null;
}
