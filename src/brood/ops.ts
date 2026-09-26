/**
 * Filesystem operations on the brood, plus the inline-edit state the tree
 * renders (a text box for a new name). Every operation keeps open tabs and
 * documents consistent and refreshes the affected directory.
 */
import { createSignal } from "solid-js";

import { forgetPath, openFile, relocatePath, setLastCroak } from "../app/state";
import {
  baseName,
  confirm,
  createFile,
  dirName,
  joinPath,
  makeDir,
  removePath,
  renamePath,
} from "../ipc";
import { expandDirectory, loadDirectory } from "./store";

export type EditKind = "new-file" | "new-dir" | "rename";

export interface TreeEdit {
  kind: EditKind;
  /** Directory the new entry goes in, or the entry being renamed. */
  path: string;
  initial: string;
}

const [treeEdit, setTreeEdit] = createSignal<TreeEdit | null>(null);
export { treeEdit };

export function beginNewFile(dir: string): void {
  void expandDirectory(dir).then(() =>
    setTreeEdit({ kind: "new-file", path: dir, initial: "untitled.py" }),
  );
}

export function beginNewDir(dir: string): void {
  void expandDirectory(dir).then(() =>
    setTreeEdit({ kind: "new-dir", path: dir, initial: "new-folder" }),
  );
}

export function beginRename(path: string): void {
  setTreeEdit({ kind: "rename", path, initial: baseName(path) });
}

export function cancelEdit(): void {
  setTreeEdit(null);
}

/** Names may not be empty or contain a path separator. */
export function validName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !/[\\/]/.test(trimmed) && trimmed !== "." && trimmed !== "..";
}

function croak(err: unknown): void {
  setLastCroak(err instanceof Error ? err.message : String(err));
}

/** Finish the pending edit with the name the user typed. */
export async function commitEdit(name: string): Promise<void> {
  const edit = treeEdit();
  setTreeEdit(null);
  if (!edit || !validName(name)) return;
  const trimmed = name.trim();
  try {
    switch (edit.kind) {
      case "new-file": {
        const path = joinPath(edit.path, trimmed);
        await createFile(path);
        await loadDirectory(edit.path);
        await openFile(path);
        break;
      }
      case "new-dir": {
        await makeDir(joinPath(edit.path, trimmed));
        await loadDirectory(edit.path);
        break;
      }
      case "rename": {
        if (trimmed === baseName(edit.path)) return;
        const parent = dirName(edit.path);
        const to = joinPath(parent, trimmed);
        await renamePath(edit.path, to);
        relocatePath(edit.path, to);
        await loadDirectory(parent);
        break;
      }
    }
  } catch (err) {
    croak(err);
  }
}

export async function deleteEntry(path: string, isDir: boolean): Promise<void> {
  const what = isDir ? "folder and everything in it" : "file";
  const ok = await confirm(`Delete ${baseName(path)}? This removes the ${what} from disk.`);
  if (!ok) return;
  try {
    await removePath(path);
    forgetPath(path);
    await loadDirectory(dirName(path));
  } catch (err) {
    croak(err);
  }
}

export async function copyPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    setLastCroak("Could not access the clipboard");
  }
}
