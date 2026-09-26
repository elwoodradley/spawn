/**
 * Recently opened broods and files, most recent first, persisted in settings
 * so the File menu and the welcome screen can offer them.
 */
import { createSignal } from "solid-js";

import { getSetting, setSetting } from "../ipc";

export const RECENT_MAX = 10;
const BROODS_KEY = "recent.broods";
const FILES_KEY = "recent.files";

/** Move `item` to the front, dropping duplicates and anything past `max`. */
export function pushRecent(list: readonly string[], item: string, max = RECENT_MAX): string[] {
  return [item, ...list.filter((entry) => entry !== item)].slice(0, max);
}

export function removeRecent(list: readonly string[], item: string): string[] {
  return list.filter((entry) => entry !== item);
}

function onlyStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

const [recentBroods, setRecentBroods] = createSignal<readonly string[]>([]);
const [recentFiles, setRecentFiles] = createSignal<readonly string[]>([]);
export { recentBroods, recentFiles };

export async function loadRecent(): Promise<void> {
  setRecentBroods(onlyStrings(await getSetting<unknown>(BROODS_KEY, [])));
  setRecentFiles(onlyStrings(await getSetting<unknown>(FILES_KEY, [])));
}

export function addRecentBrood(path: string): void {
  setRecentBroods((list) => pushRecent(list, path));
  void setSetting(BROODS_KEY, recentBroods());
}

export function addRecentFile(path: string): void {
  setRecentFiles((list) => pushRecent(list, path));
  void setSetting(FILES_KEY, recentFiles());
}

/** Drop an entry that no longer exists on disk. */
export function forgetRecent(path: string): void {
  setRecentBroods((list) => removeRecent(list, path));
  setRecentFiles((list) => removeRecent(list, path));
  void setSetting(BROODS_KEY, recentBroods());
  void setSetting(FILES_KEY, recentFiles());
}
