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
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  rename,
  stat,
  watch as tauriWatch,
  writeFile,
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

/** Write binary contents (a saved figure, for example). */
export function readBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}

export function writeBytes(path: string, contents: Uint8Array): Promise<void> {
  return writeFile(path, contents);
}

export function pathExists(path: string): Promise<boolean> {
  return tauriExists(path);
}

/** Size in bytes, without reading the file. */
export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

export async function isDirectory(path: string): Promise<boolean> {
  return (await stat(path)).isDirectory;
}

/** Create an empty file. Refuses to truncate one that already exists. */
export async function createFile(path: string): Promise<void> {
  if (await tauriExists(path)) throw new Error(`${baseName(path)} already exists`);
  await writeTextFile(path, "");
}

export async function makeDir(path: string): Promise<void> {
  if (await tauriExists(path)) throw new Error(`${baseName(path)} already exists`);
  await mkdir(path);
}

export async function renamePath(from: string, to: string): Promise<void> {
  if (await tauriExists(to)) throw new Error(`${baseName(to)} already exists`);
  await rename(from, to);
}

/** Delete a file or a whole directory tree. */
export function removePath(path: string): Promise<void> {
  return remove(path, { recursive: true });
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
  const joined = parts
    .filter((p) => p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
    .join(s);
  return normalizePath(joined, s);
}

/**
 * Collapse `.` and `..` segments so `vision/../README.md` becomes
 * `README.md`. The file-system scope refuses paths that still contain `..`,
 * and Python itself resolves them, so the check must see the real target.
 * A leading root (`/` or `C:`) is kept; `..` that would climb above it is kept
 * too, since there is nothing to pop.
 */
export function normalizePath(path: string, sep: string = separator()): string {
  const parts = path.split(/[\\/]/);
  const first = parts[0] ?? "";
  const rooted = first === "" || /^[A-Za-z]:$/.test(first);
  const out: string[] = [];
  for (const [i, part] of parts.entries()) {
    if (i === 0 && rooted) {
      out.push(first);
      continue;
    }
    if (part === "" || part === ".") continue;
    if (part === "..") {
      const last = out[out.length - 1];
      const canPop = out.length > (rooted ? 1 : 0) && last !== "..";
      if (canPop) out.pop();
      else if (!rooted) out.push(part);
      continue;
    }
    out.push(part);
  }
  if (rooted && out.length === 1) return first === "" ? sep : `${first}${sep}`;
  return out.join(sep);
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
