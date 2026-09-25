/**
 * The brood tree as reactive state: lists directories on demand, and reloads
 * what is loaded when the filesystem watcher reports a change.
 */
import { createEffect, createMemo, createRoot, on, onCleanup } from "solid-js";
import { createStore, produce } from "solid-js/store";

import { brood } from "../app/state";
import { baseName, listDir, watchTree, type Unwatch } from "../ipc";
import {
  findNode,
  flatten,
  loadedDirectories,
  mergeChildren,
  rootNode,
  type TreeNode,
} from "./tree";

const [tree, setTree] = createStore<{ root: TreeNode | null }>({ root: null });

// A memo that lives for the whole app; created in its own root so Solid does
// not warn about a computation outside a render tree.
export const treeRows = createRoot(() => createMemo(() => flatten(tree.root)));
export const treeRoot = () => tree.root;

export async function loadDirectory(path: string): Promise<void> {
  let entries;
  try {
    entries = await listDir(path);
  } catch {
    return; // Vanished between the watch event and the listing; the next event fixes it.
  }
  setTree(
    produce((draft) => {
      const node = findNode(draft.root, path);
      if (node) node.children = mergeChildren(node, entries);
    }),
  );
}

export async function toggleDirectory(path: string): Promise<void> {
  let needsLoad = false;
  setTree(
    produce((draft) => {
      const node = findNode(draft.root, path);
      if (!node?.isDirectory) return;
      node.expanded = !node.expanded;
      needsLoad = node.expanded && node.children === null;
    }),
  );
  if (needsLoad) await loadDirectory(path);
}

export async function refreshTree(): Promise<void> {
  await Promise.all(loadedDirectories(tree.root).map(loadDirectory));
}

/** Follow the brood signal: rebuild the root and watch it. Call in a root. */
export function startBroodTree(): void {
  let unwatch: Unwatch | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    unwatch?.();
    unwatch = null;
    if (timer) clearTimeout(timer);
  };

  createEffect(
    on(brood, (root) => {
      stop();
      if (!root) {
        setTree({ root: null });
        return;
      }
      setTree({ root: rootNode(root, baseName(root)) });
      void loadDirectory(root);
      void watchTree(root, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refreshTree(), 200);
      }).then((fn) => {
        unwatch = fn;
      });
    }),
  );

  onCleanup(stop);
}
