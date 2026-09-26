/**
 * Metamorphosis state: which interpreters exist and which one is selected.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `selectedInterpreter()` is the absolute path the spawn controller runs.
 * - `refreshInterpreters(brood)` rediscovers candidates when the brood changes.
 *
 * The selection is remembered per brood under the setting `interpreter:<brood>`.
 */
import { createSignal } from "solid-js";

import { brood } from "../app/state";
import {
  discoverInterpreters,
  getSetting,
  pathExists,
  pickFile,
  probeInterpreter,
  probeMl,
  setSetting,
  sysMemory,
  uvPath,
  type Candidate,
  type CandidateSource,
  type MemoryInfo,
  type MlInfo,
  type PythonInfo,
} from "../ipc";

const [candidates, setCandidates] = createSignal<readonly Candidate[]>([]);
const [selectedInterpreter, setSelectedInterpreter] = createSignal<string | null>(null);
const [interpreterInfo, setInterpreterInfo] = createSignal<PythonInfo | null>(null);
const [uvAvailable, setUvAvailable] = createSignal<string | null>(null);
const [refreshing, setRefreshing] = createSignal(false);
const [envError, setEnvError] = createSignal<string | null>(null);
const [metamorphosisOpen, setMetamorphosisOpen] = createSignal(false);
const [mlInfo, setMlInfo] = createSignal<MlInfo | null>(null);
const [mlProbing, setMlProbing] = createSignal(false);
const [mlError, setMlError] = createSignal<string | null>(null);
const [memory, setMemory] = createSignal<MemoryInfo | null>(null);

export {
  candidates,
  setCandidates,
  selectedInterpreter,
  setSelectedInterpreter,
  interpreterInfo,
  setInterpreterInfo,
  uvAvailable,
  refreshing,
  envError,
  metamorphosisOpen,
  setMetamorphosisOpen,
  mlInfo,
  mlProbing,
  mlError,
  memory,
};

function settingKey(root: string | null): string {
  return `interpreter:${root ?? ""}`;
}

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  broodVenv: ".venv",
  uv: "uv",
  path: "PATH",
  custom: "chosen",
};

/** The candidate record for the current selection, if it is one. */
export function selectedCandidate(): Candidate | null {
  const path = selectedInterpreter();
  return candidates().find((c) => c.path === path) ?? null;
}

export async function refreshInterpreters(root: string | null): Promise<void> {
  setRefreshing(true);
  setEnvError(null);
  try {
    const [found, uv] = await Promise.all([discoverInterpreters(root), uvPath()]);
    setUvAvailable(uv);
    const saved = await getSetting<string | null>(settingKey(root), null);
    // A remembered interpreter SPAWN would not discover (browsed to by the
    // user) stays available as long as it still exists.
    const list = [...found];
    if (saved && !list.some((c) => c.path === saved) && (await pathExists(saved))) {
      list.push({ path: saved, source: "custom" });
    }
    setCandidates(list);
    const pick = saved && list.some((c) => c.path === saved) ? saved : (list[0]?.path ?? null);
    await selectInterpreter(pick, false);
  } catch (err) {
    setEnvError(describe(err));
  } finally {
    setRefreshing(false);
  }
}

/** Let the user point at any interpreter, e.g. a venv outside the brood. */
export async function browseInterpreter(): Promise<void> {
  const picked = await pickFile();
  if (!picked) return;
  if (!candidates().some((c) => c.path === picked)) {
    setCandidates([...candidates(), { path: picked, source: "custom" }]);
  }
  await selectInterpreter(picked);
}

/** Pick an interpreter; probes it for version info. */
export async function selectInterpreter(path: string | null, persist = true): Promise<void> {
  setSelectedInterpreter(path);
  setInterpreterInfo(null);
  if (persist) await setSetting(settingKey(brood()), path);
  if (!path) {
    setMlInfo(null);
    return;
  }
  try {
    const info = await probeInterpreter(path);
    // Ignore a late answer if the user has already moved on.
    if (selectedInterpreter() === path) setInterpreterInfo(info);
  } catch (err) {
    setEnvError(describe(err));
  }
  void refreshMlInfo();
}

/**
 * Ask the selected interpreter about numpy, pandas, torch, jax and its device.
 * Slow (imports torch) so it runs in the background; a failure is shown in the
 * chrome, never thrown at the caller.
 */
export async function refreshMlInfo(): Promise<void> {
  const path = selectedInterpreter();
  if (!path) {
    setMlInfo(null);
    return;
  }
  setMlProbing(true);
  setMlError(null);
  try {
    const info = await probeMl(path);
    if (selectedInterpreter() === path) setMlInfo(info);
  } catch (err) {
    if (selectedInterpreter() === path) {
      setMlInfo(null);
      setMlError(describe(err));
    }
  } finally {
    setMlProbing(false);
  }
}

const MEMORY_POLL_MS = 5000;

export async function refreshMemory(): Promise<void> {
  try {
    setMemory(await sysMemory());
  } catch {
    setMemory(null);
  }
}

/** Poll system memory while the window is visible. Returns a stop function. */
export function startMemoryPolling(): () => void {
  const tick = () => {
    if (document.visibilityState === "visible") void refreshMemory();
  };
  tick();
  const timer = setInterval(tick, MEMORY_POLL_MS);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", tick);
  };
}

export function toggleMetamorphosis(open?: boolean): void {
  setMetamorphosisOpen(open ?? !metamorphosisOpen());
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
