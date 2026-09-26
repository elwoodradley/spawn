/**
 * Window-level hooks: refuse to close with unsaved work, and accept files or
 * folders dropped from the desktop.
 */
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal } from "solid-js";

import { dirtyPaths } from "../editor/documents";
import { confirm, isDirectory } from "../ipc";
import { openBrood, openFile, setLastCroak } from "./state";

const [dropHover, setDropHover] = createSignal(false);
export { dropHover };

/** Quit now, or ask first when something is unsaved. */
export async function requestQuit(): Promise<void> {
  const dirty = dirtyPaths().size;
  if (dirty > 0) {
    const ok = await confirm(
      `${dirty} file${dirty === 1 ? " has" : "s have"} unsaved changes. Quit without saving?`,
    );
    if (!ok) return;
  }
  await getCurrentWindow().destroy();
}

export async function installCloseGuard(): Promise<() => void> {
  return getCurrentWindow().onCloseRequested(async (event) => {
    if (dirtyPaths().size === 0) return;
    event.preventDefault();
    await requestQuit();
  });
}

/** Open whatever lands on the window: folders become the brood, files open. */
export async function openDropped(paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    try {
      if (await isDirectory(path)) openBrood(path);
      else await openFile(path);
    } catch (err) {
      setLastCroak(`Could not open ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export async function installDragDrop(): Promise<() => void> {
  return getCurrentWebview().onDragDropEvent((event) => {
    const payload = event.payload;
    if (payload.type === "enter") setDropHover(true);
    else if (payload.type === "leave") setDropHover(false);
    else if (payload.type === "drop") {
      setDropHover(false);
      void openDropped(payload.paths);
    }
  });
}
