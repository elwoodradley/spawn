/**
 * Pure model for the brood tree. No IO, no Solid: the store feeds it
 * directory listings and asks it for the rows to draw.
 */
import type { Entry } from "../ipc";

export interface TreeNode {
  path: string;
  name: string;
  isDirectory: boolean;
  expanded: boolean;
  /** `null` until the directory has been listed. */
  children: TreeNode[] | null;
}

export interface TreeRow {
  node: TreeNode;
  depth: number;
}

/** Folders nobody wants in a file tree by default. */
export const HIDDEN_NAMES: ReadonlySet<string> = new Set([
  ".git",
  "__pycache__",
  ".venv",
  "node_modules",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
]);

export function nodeFromEntry(entry: Entry): TreeNode {
  return {
    path: entry.path,
    name: entry.name,
    isDirectory: entry.isDirectory,
    expanded: false,
    children: null,
  };
}

export function rootNode(path: string, name: string): TreeNode {
  return { path, name, isDirectory: true, expanded: true, children: null };
}

export function visibleEntries(entries: readonly Entry[]): Entry[] {
  return entries.filter((e) => !HIDDEN_NAMES.has(e.name));
}

/** Depth-first rows for every expanded node, root's children first. */
export function flatten(root: TreeNode | null): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (node: TreeNode, depth: number) => {
    for (const child of node.children ?? []) {
      rows.push({ node: child, depth });
      if (child.isDirectory && child.expanded) walk(child, depth + 1);
    }
  };
  if (root) walk(root, 0);
  return rows;
}

/** Find a node by path, or null. */
export function findNode(root: TreeNode | null, path: string): TreeNode | null {
  if (!root) return null;
  if (root.path === path) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

/**
 * Replace a directory's children with fresh entries, keeping the expansion
 * state and already-loaded children of directories that still exist.
 */
export function mergeChildren(node: TreeNode, entries: readonly Entry[]): TreeNode[] {
  const previous = new Map((node.children ?? []).map((c) => [c.path, c]));
  return visibleEntries(entries).map((entry) => {
    const old = previous.get(entry.path);
    if (old && old.isDirectory === entry.isDirectory) return old;
    return nodeFromEntry(entry);
  });
}

/** Paths of every directory that has been listed, root included. */
export function loadedDirectories(root: TreeNode | null): string[] {
  const out: string[] = [];
  const walk = (node: TreeNode) => {
    if (!node.isDirectory || node.children === null) return;
    out.push(node.path);
    node.children.forEach(walk);
  };
  if (root) walk(root);
  return out;
}
