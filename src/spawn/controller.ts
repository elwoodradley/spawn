/**
 * The spawn controller: runs the active file as a child process and feeds
 * its output to the output panel.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `spawnStatus()` is "idle" or "running".
 * - `spawnFile(path)` saves dirty documents, then runs `path` with the
 *   selected interpreter, cwd = brood root (or the file's folder), unbuffered.
 * - `stopSpawn()` kills the running child.
 */
import { createSignal } from "solid-js";

export type SpawnStatus = "idle" | "running";

const [spawnStatus, setSpawnStatus] = createSignal<SpawnStatus>("idle");
export { spawnStatus, setSpawnStatus };

export async function spawnFile(_path: string): Promise<void> {}

export async function stopSpawn(): Promise<void> {}
