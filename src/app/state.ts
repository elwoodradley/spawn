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

import { closeDocument, isDirty, openDocument, renameDocument, reveal } from "../editor/documents";
import { baseName, confirm, pathExists } from "../ipc";
import { isViewerPath } from "../viewer/docx";
import { croakToast } from "./toast";
import { addRecentBrood, addRecentFile, forgetRecent } from "./recent";

export interface Tab {
  path: string;
  /** File name, for the tab strip. */
  name: string;
}

const [brood, setBrood] = createSignal<string | null>(null);
const [tabs, setTabs] = createSignal<readonly Tab[]>([]);
const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);
const [lastCroak, setLastCroakSignal] = createSignal<string | null>(null);

/** Record a user-facing error and show it as a toast. */
function setLastCroak(message: string | null): void {
  setLastCroakSignal(message);
  if (message) croakToast(message);
}

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
  addRecentBrood(path);
}

/**
 * Open a project from a recent list. The folder may have been moved or
 * deleted since; say so and drop it from the list instead of opening an
 * empty, broken project.
 */
export async function openRecentBrood(path: string): Promise<void> {
  if (await pathExists(path)) {
    openBrood(path);
    return;
  }
  forgetRecent(path);
  setLastCroak(`The project folder ${path} no longer exists`);
}

export const openFile = async (path: string, line?: number): Promise<void> => {
  if (isViewerPath(path)) {
    // Read-only viewer tab (a .docx handout): no editor document behind it.
    if (!tabs().some((t) => t.path === path)) {
      setTabs([...tabs(), { path, name: baseName(path) }]);
    }
    setActiveFilePath(path);
    addRecentFile(path);
    return;
  }
  try {
    await openDocument(path);
  } catch (err) {
    forgetRecent(path);
    setLastCroak(`Could not open ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  if (!tabs().some((t) => t.path === path)) {
    setTabs([...tabs(), { path, name: baseName(path) }]);
  }
  setActiveFilePath(path);
  addRecentFile(path);
  if (line !== undefined) reveal(path, line);
};

/** Remove a tab without asking; the caller has already decided. */
function dropTab(path: string): void {
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
}

export const closeTab = async (path: string): Promise<void> => {
  if (isDirty(path)) {
    const ok = await confirm(`Close ${baseName(path)} without saving?`);
    if (!ok) return;
  }
  dropTab(path);
};

/** A path (file or folder) was deleted on disk: close every tab under it. */
export function forgetPath(path: string): void {
  const under = (p: string) => p === path || p.startsWith(`${path}/`) || p.startsWith(`${path}\\`);
  for (const tab of tabs().filter((t) => under(t.path))) dropTab(tab.path);
  forgetRecent(path);
}

/** A path was renamed on disk: keep tabs and documents pointing at it. */
export function relocatePath(from: string, to: string): void {
  const moved = (p: string) => {
    if (p === from) return to;
    for (const sep of ["/", "\\"]) {
      if (p.startsWith(from + sep)) return to + p.slice(from.length);
    }
    return null;
  };
  setTabs(
    tabs().map((tab) => {
      const next = moved(tab.path);
      if (next === null) return tab;
      renameDocument(tab.path, next);
      return { path: next, name: baseName(next) };
    }),
  );
  const active = activeFilePath();
  const nextActive = active ? moved(active) : null;
  if (nextActive) setActiveFilePath(nextActive);
}
