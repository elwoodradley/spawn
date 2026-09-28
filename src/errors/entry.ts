/** Helpers shared by the library files. */
import type { LibraryEntry } from "./types";

/** Erase the details type so entries with different details sit in one list. */
export function define<D>(entry: LibraryEntry<D>): LibraryEntry {
  return entry;
}

/** Capture group `i` of a match, or `?` when it did not take part. */
export function g(m: RegExpExecArray, i: number): string {
  return m[i] ?? "?";
}
