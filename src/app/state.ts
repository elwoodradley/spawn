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

export interface Tab {
  path: string;
  /** File name, for the tab strip. */
  name: string;
}

const [brood, setBrood] = createSignal<string | null>(null);
const [tabs, setTabs] = createSignal<readonly Tab[]>([]);
const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);

export { brood, setBrood, tabs, setTabs, activeFilePath, setActiveFilePath };

export const openFile: (path: string, line?: number) => Promise<void> = async () => {
  // Implemented by the editor/brood work; stub keeps the contract compiling.
};

export const closeTab: (path: string) => Promise<void> = async () => {};

export type BroodAccessor = Accessor<string | null>;
