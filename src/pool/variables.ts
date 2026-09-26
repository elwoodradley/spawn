/**
 * What lives in the pool right now. Refreshed after each exec; a variable
 * whose summary changed since the last refresh is marked so the pane can
 * float it to the top.
 */
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

import { pool } from "./client";
import type { VariableInfo } from "./protocol";

export interface VariablesState {
  list: VariableInfo[];
  /** When a variable last appeared or changed, by name. */
  changedAt: Record<string, number>;
  refreshing: boolean;
  error: string | null;
  /** Bumped each refresh so "recently changed" means "since the previous one". */
  generation: number;
}

const [state, setState] = createStore<VariablesState>({
  list: [],
  changedAt: {},
  refreshing: false,
  error: null,
  generation: 0,
});
const [filter, setFilter] = createSignal("");

export { state as variables, filter as variableFilter, setFilter as setVariableFilter };

/** Names whose summary differs from what we had, plus names that are new. */
export function changedNames(
  previous: readonly VariableInfo[],
  next: readonly VariableInfo[],
): string[] {
  const before = new Map(previous.map((v) => [v.name, v.summary]));
  return next.filter((v) => before.get(v.name) !== v.summary).map((v) => v.name);
}

/** Recently changed first (newest change on top), then everything by name. */
export function sortVariables(
  list: readonly VariableInfo[],
  changedAt: Record<string, number>,
  since: number,
): VariableInfo[] {
  const recent = (v: VariableInfo) => (changedAt[v.name] ?? 0) >= since;
  return [...list].sort((a, b) => {
    const ra = recent(a);
    const rb = recent(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra && rb) {
      const d = (changedAt[b.name] ?? 0) - (changedAt[a.name] ?? 0);
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
  });
}

export function filterVariables(list: readonly VariableInfo[], query: string): VariableInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...list];
  return list.filter(
    (v) =>
      v.name.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q) ||
      v.summary.toLowerCase().includes(q),
  );
}

/** Marker timestamp: variables changed at or after this are "recent". */
const [lastRefreshAt, setLastRefreshAt] = createSignal(0);
export { lastRefreshAt };

export async function refreshVariables(now: () => number = Date.now): Promise<void> {
  setState("refreshing", true);
  setState("error", null);
  try {
    const next = await pool().variables();
    const stamp = now();
    const changed = changedNames(state.list, next);
    const changedAt = { ...state.changedAt };
    for (const name of Object.keys(changedAt)) {
      if (!next.some((v) => v.name === name)) delete changedAt[name];
    }
    for (const name of changed) changedAt[name] = stamp;
    setLastRefreshAt(stamp);
    setState({ list: next, changedAt, generation: state.generation + 1 });
  } catch (err) {
    setState("error", err instanceof Error ? err.message : String(err));
  } finally {
    setState("refreshing", false);
  }
}

export function clearVariables(): void {
  setState({ list: [], changedAt: {}, error: null });
}

/** A class for the type badge, so the pane colours by kind with tokens. */
export function typeClass(type: string): string {
  const t = type.toLowerCase();
  if (/dataframe|series/.test(t)) return "is-table";
  if (/ndarray|tensor|array/.test(t)) return "is-array";
  if (/^(int|float|bool|complex)$/.test(t)) return "is-number";
  if (/^str$/.test(t)) return "is-string";
  if (/function|module|type|class|method/.test(t)) return "is-code";
  return "is-other";
}
