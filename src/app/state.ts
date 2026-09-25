/**
 * App-wide state: the open brood, open tabs, and the active file.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `brood()` is the workspace root or null.
 * - `openFile(path, line?)` opens (or focuses) a tab and optionally scrolls
 *   to a 1-based line. The output panel uses this for traceback links.
 * - `activeFilePath()` is what the spawn button runs.
 */
import { createSignal, type Accessor } from "solid-js";

import { closeDocument, isDirty, openDocument, reveal } from "../editor/documents";
import { baseName, confirm } from "../ipc";

export interface Tab {
  path: string;
  /** File name, for the tab strip. */
  name: string;
}

const [brood, setBrood] = createSignal<string | null>(null);
const [tabs, setTabs] = createSignal<readonly Tab[]>([]);
const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);
const [lastCroak, setLastCroak] = createSignal<string | null>(null);

export {
  brood,
  setBrood,
  tabs,
  setTabs,
  activeFilePath,
  setActiveFilePath,
  lastCroak,
  setLastCroak,
};

export type BroodAccessor = Accessor<string | null>;

export function openBrood(path: string): void {
  setBrood(path);
}

export const openFile = async (path: string, line?: number): Promise<void> => {
  try {
    await openDocument(path);
  } catch (err) {
    setLastCroak(`Could not open ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!tabs().some((t) => t.path === path)) {
    setTabs([...tabs(), { path, name: baseName(path) }]);
  }
  setActiveFilePath(path);
  if (line !== undefined) reveal(path, line);
};

export const closeTab = async (path: string): Promise<void> => {
  if (isDirty(path)) {
    const ok = await confirm(`Close ${baseName(path)} without saving?`);
    if (!ok) return;
  }
  const current = tabs();
  const index = current.findIndex((t) => t.path === path);
  if (index === -1) return;
  const remaining = current.filter((t) => t.path !== path);
  setTabs(remaining);
  closeDocument(path);
  if (activeFilePath() === path) {
    const neighbour = remaining[Math.min(index, remaining.length - 1)];
    setActiveFilePath(neighbour?.path ?? null);
  }
};
