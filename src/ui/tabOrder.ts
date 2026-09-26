/**
 * Pure helpers for the tab strip: most-recently-used order for Mod-Tab, and
 * drag reordering. No Solid here so it is tested without a DOM.
 */

/** Move `path` to the front, dropping any earlier occurrence. */
export function touchMru(mru: readonly string[], path: string): string[] {
  return [path, ...mru.filter((p) => p !== path)];
}

export function removeMru(mru: readonly string[], path: string): string[] {
  return mru.filter((p) => p !== path);
}

/**
 * Keep the MRU list consistent with the open tabs: drop closed ones, append
 * unknown ones at the back (least recent), preserving existing order.
 */
export function reconcileMru(mru: readonly string[], open: readonly string[]): string[] {
  const openSet = new Set(open);
  const kept = mru.filter((p) => openSet.has(p));
  const known = new Set(kept);
  return [...kept, ...open.filter((p) => !known.has(p))];
}

/**
 * The tab `steps` presses of Mod-Tab away from the front of a frozen MRU
 * snapshot. Negative steps walk backwards (Mod-Shift-Tab). Wraps.
 */
export function mruAt(snapshot: readonly string[], steps: number): string | null {
  if (snapshot.length === 0) return null;
  const n = snapshot.length;
  const index = ((steps % n) + n) % n;
  return snapshot[index] ?? null;
}

/** Move the item at `from` so it lands at `to` (index in the resulting list). */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  if (item === undefined) return [...list];
  out.splice(Math.max(0, Math.min(to, out.length)), 0, item);
  return out;
}

/** Index of the neighbour `delta` tabs away from `current`, wrapping. */
export function neighbourIndex(count: number, current: number, delta: number): number {
  if (count === 0) return -1;
  const base = current < 0 ? 0 : current;
  return (((base + delta) % count) + count) % count;
}
