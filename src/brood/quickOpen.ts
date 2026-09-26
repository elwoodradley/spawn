/**
 * Quick open: every file in the brood, ranked against what the user types.
 *
 * The walk is breadth-first over `listDir`, skipping folders that are never
 * worth opening, and cached per brood for a few seconds so reopening the
 * finder does not hit the disk again. Ranking is pure and tested.
 */
import { listDir } from "../ipc";
import { fuzzyScore } from "../ui/fuzzy";

export const SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".ipynb_checkpoints",
  "dist",
  "build",
  "target",
]);

export const FILE_CAP = 20_000;

export interface CancelToken {
  cancelled: boolean;
}

/** Breadth-first list of file paths under `root`, capped, cancellable. */
export async function listFiles(
  root: string,
  token: CancelToken = { cancelled: false },
  cap = FILE_CAP,
): Promise<string[]> {
  const files: string[] = [];
  const queue: string[] = [root];
  while (queue.length > 0 && files.length < cap && !token.cancelled) {
    const dir = queue.shift();
    if (dir === undefined) break;
    let entries;
    try {
      entries = await listDir(dir);
    } catch {
      continue; // unreadable folder: skip it, keep going
    }
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(entry.path);
      } else if (files.length < cap) {
        files.push(entry.path);
      }
    }
  }
  return files;
}

export interface RankedFile {
  path: string;
  /** Path relative to the brood root, with forward slashes. */
  rel: string;
  score: number;
}

export function relativeTo(root: string, path: string): string {
  const rel = path.startsWith(root) ? path.slice(root.length) : path;
  return rel.replace(/^[\\/]+/, "").replace(/\\/g, "/");
}

function baseOf(rel: string): string {
  const idx = rel.lastIndexOf("/");
  return idx === -1 ? rel : rel.slice(idx + 1);
}

/**
 * Rank files for a query. With no query, recently opened files come first
 * (most recent first) and the rest follow alphabetically. With a query, a
 * match on the file name beats a match elsewhere in the path.
 */
export function rankFiles(
  files: readonly string[],
  root: string,
  query: string,
  recents: readonly string[] = [],
  limit = 60,
): RankedFile[] {
  const q = query.trim();
  if (q.length === 0) {
    const present = new Set(files);
    const recent = recents.filter((p) => present.has(p));
    const recentSet = new Set(recent);
    const rest = files.filter((p) => !recentSet.has(p)).sort((a, b) => a.localeCompare(b));
    return [...recent, ...rest]
      .slice(0, limit)
      .map((path) => ({ path, rel: relativeTo(root, path), score: 0 }));
  }

  const ranked: RankedFile[] = [];
  for (const path of files) {
    const rel = relativeTo(root, path);
    const base = baseOf(rel);
    const baseScore = fuzzyScore(q, base);
    const relScore = fuzzyScore(q, rel);
    if (baseScore === null && relScore === null) continue;
    // A file-name hit is what people mean; a path-only hit is a fallback.
    const score = baseScore !== null ? baseScore : (relScore ?? 0) + 1000;
    ranked.push({ path, rel, score });
  }
  return ranked
    .sort((a, b) => a.score - b.score || a.rel.length - b.rel.length || a.rel.localeCompare(b.rel))
    .slice(0, limit);
}

interface Cache {
  root: string;
  files: string[];
  at: number;
}

let cache: Cache | null = null;
const CACHE_MS = 4000;

/** Files for a brood, from a short-lived cache when fresh. */
export async function broodFiles(root: string, token?: CancelToken): Promise<string[]> {
  if (cache && cache.root === root && Date.now() - cache.at < CACHE_MS) return cache.files;
  const files = await listFiles(root, token);
  if (!token?.cancelled) cache = { root, files, at: Date.now() };
  return files;
}

export function invalidateFileCache(): void {
  cache = null;
}
