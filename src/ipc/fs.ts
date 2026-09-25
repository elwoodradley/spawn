/**
 * Filesystem IPC over the Tauri fs plugin, plus synchronous path helpers.
 *
 * The plugin's own path functions are async invokes; tree building wants
 * cheap string operations, so `joinPath`, `dirName` and `baseName` are done
 * here with the platform separator.
 */
import { sep } from "@tauri-apps/api/path";
import {
  exists as tauriExists,
  readDir,
  readTextFile,
  watch as tauriWatch,
  writeTextFile,
  type WatchEvent,
} from "@tauri-apps/plugin-fs";

export interface Entry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/** Directory listing, folders first, each group sorted case-insensitively. */
export async function listDir(path: string): Promise<Entry[]> {
  const entries = await readDir(path);
  return entries
    .map((entry) => ({
      name: entry.name,
      path: joinPath(path, entry.name),
      isDirectory: entry.isDirectory,
    }))
    .sort(compareEntries);
}

export function compareEntries(a: Entry, b: Entry): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function readText(path: string): Promise<string> {
  return readTextFile(path);
}

export function writeText(path: string, contents: string): Promise<void> {
  return writeTextFile(path, contents);
}

export function pathExists(path: string): Promise<boolean> {
  return tauriExists(path);
}

export type Unwatch = () => void;

/** Debounced recursive watch. Returns a function that stops watching. */
export async function watchTree(
  path: string,
  onChange: (event: WatchEvent) => void,
): Promise<Unwatch> {
  return tauriWatch(path, onChange, { recursive: true, delayMs: 250 });
}

let cachedSep: string | null = null;
function separator(): string {
  if (cachedSep === null) {
    try {
      cachedSep = sep();
    } catch {
      // Outside Tauri (tests) there is no runtime; assume POSIX.
      cachedSep = "/";
    }
  }
  return cachedSep;
}

export function joinPath(...parts: string[]): string {
  const s = separator();
  return parts
    .filter((p) => p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .join(s);
}

export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function dirName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return idx <= 0 ? trimmed.slice(0, 1) : trimmed.slice(0, idx);
}

export function extension(path: string): string {
  const name = baseName(path);
  const idx = name.lastIndexOf(".");
  return idx <= 0 ? "" : name.slice(idx + 1).toLowerCase();
}
