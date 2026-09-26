/**
 * Tab navigation as commands: Mod-Tab cycles by most recent use (a frozen
 * snapshot while the modifier is held, like every editor), Mod-PageUp/Down
 * walk the strip, Mod-1..9 jump, and the close-family from the tab menu.
 */
import { createEffect, createRoot, createSignal, on } from "solid-js";

import { registerCommands } from "../app/commands";
import {
  activeFilePath,
  brood,
  closeTab,
  setActiveFilePath,
  setLastCroak,
  tabs,
} from "../app/state";
import { expandDirectory } from "../brood/store";
import { dirName } from "../ipc";
import { mruAt, neighbourIndex, reconcileMru, touchMru } from "./tabOrder";

const [mru, setMru] = createSignal<readonly string[]>([]);
export { mru };

/** Frozen while Mod is held so repeated Mod-Tab walks deeper into history. */
let cycle: { snapshot: readonly string[]; steps: number } | null = null;

function endCycle(): void {
  cycle = null;
}

function cycleBy(direction: 1 | -1): void {
  if (!cycle) cycle = { snapshot: mru(), steps: 0 };
  cycle.steps += direction;
  const target = mruAt(cycle.snapshot, cycle.steps);
  if (target) setActiveFilePath(target);
}

function stepBy(delta: 1 | -1): void {
  const list = tabs();
  const current = list.findIndex((t) => t.path === activeFilePath());
  const next = list[neighbourIndex(list.length, current, delta)];
  if (next) setActiveFilePath(next.path);
}

function jumpTo(n: number): void {
  const target = tabs()[n - 1];
  if (target) setActiveFilePath(target.path);
}

export async function closeOthers(keep: string): Promise<void> {
  for (const tab of tabs().filter((t) => t.path !== keep)) await closeTab(tab.path);
}

export async function closeToRight(from: string): Promise<void> {
  const list = tabs();
  const index = list.findIndex((t) => t.path === from);
  if (index === -1) return;
  for (const tab of list.slice(index + 1)) await closeTab(tab.path);
}

export async function closeAll(): Promise<void> {
  for (const tab of [...tabs()]) await closeTab(tab.path);
}

/** Expand every folder down to the file and scroll the tree row into view. */
export async function revealInTree(path: string): Promise<void> {
  const root = brood();
  if (!root || !path.startsWith(root)) return;
  const dirs: string[] = [];
  for (
    let dir = dirName(path);
    dir.length >= root.length && dir !== dirName(dir);
    dir = dirName(dir)
  ) {
    dirs.unshift(dir);
    if (dir === root) break;
  }
  for (const dir of dirs) await expandDirectory(dir);
  setActiveFilePath(path);
  queueMicrotask(() => {
    document.querySelector(".sp-tree-row.is-active")?.scrollIntoView({ block: "nearest" });
  });
}

/** Call once from the tab strip. Returns a disposer. */
export function registerTabCommands(): () => void {
  const hasTabs = () => tabs().length > 0;
  const dispose = registerCommands([
    {
      id: "tab.next",
      title: "Tab: next",
      keys: "Mod-PageDown",
      enabled: hasTabs,
      run: () => stepBy(1),
    },
    {
      id: "tab.prev",
      title: "Tab: previous",
      keys: "Mod-PageUp",
      enabled: hasTabs,
      run: () => stepBy(-1),
    },
    {
      id: "tab.cycle",
      title: "Tab: most recent",
      keys: "Mod-Tab",
      enabled: hasTabs,
      run: () => cycleBy(1),
    },
    {
      id: "tab.cycleBack",
      title: "Tab: most recent (backwards)",
      keys: "Mod-Shift-Tab",
      enabled: hasTabs,
      run: () => cycleBy(-1),
    },
    {
      id: "tab.closeOthers",
      title: "Tab: close others",
      enabled: () => tabs().length > 1,
      run: () => {
        const keep = activeFilePath();
        return keep ? closeOthers(keep) : undefined;
      },
    },
    { id: "tab.closeAll", title: "Tab: close all", enabled: hasTabs, run: closeAll },
    {
      id: "tab.reveal",
      title: "Tab: reveal in brood tree",
      enabled: () => activeFilePath() !== null,
      run: () => {
        const path = activeFilePath();
        return path ? revealInTree(path) : undefined;
      },
    },
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `tab.jump.${i + 1}`,
      title: `Tab: go to tab ${i + 1}`,
      keys: `Mod-${i + 1}`,
      hidden: true,
      enabled: () => tabs().length >= i + 1,
      run: () => jumpTo(i + 1),
    })),
  ]);

  // Keep MRU in step with what is open and what is active.
  const disposeRoot = createRoot((disposeFn) => {
    createEffect(
      on(
        () => tabs().map((t) => t.path),
        (open) => setMru((m) => reconcileMru(m, open)),
      ),
    );
    createEffect(
      on(activeFilePath, (path) => {
        // During a Mod-Tab cycle the snapshot stays frozen; the landing tab is
        // touched when the modifier is released.
        if (path && !cycle) setMru((m) => touchMru(m, path));
      }),
    );
    return disposeFn;
  });

  const onKeyUp = (e: KeyboardEvent) => {
    if (cycle && (e.key === "Control" || e.key === "Meta")) {
      const landed = activeFilePath();
      endCycle();
      if (landed) setMru((m) => touchMru(m, landed));
    }
  };
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", endCycle);

  return () => {
    dispose();
    disposeRoot();
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", endCycle);
  };
}

/** Right-click entries for one tab. */
export function tabMenu(path: string) {
  return [
    { kind: "action" as const, label: "Close", run: () => closeTab(path) },
    { kind: "action" as const, label: "Close others", run: () => closeOthers(path) },
    { kind: "action" as const, label: "Close to the right", run: () => closeToRight(path) },
    { kind: "action" as const, label: "Close all", run: closeAll },
    { kind: "separator" as const },
    {
      kind: "action" as const,
      label: "Copy path",
      run: async () => {
        try {
          await navigator.clipboard.writeText(path);
        } catch {
          setLastCroak("Could not access the clipboard");
        }
      },
    },
    { kind: "action" as const, label: "Reveal in brood tree", run: () => revealInTree(path) },
  ];
}
