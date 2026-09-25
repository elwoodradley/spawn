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
  probeInterpreter,
  setSetting,
  uvPath,
  type Candidate,
  type CandidateSource,
  type PythonInfo,
} from "../ipc";

const [candidates, setCandidates] = createSignal<readonly Candidate[]>([]);
const [selectedInterpreter, setSelectedInterpreter] = createSignal<string | null>(null);
const [interpreterInfo, setInterpreterInfo] = createSignal<PythonInfo | null>(null);
const [uvAvailable, setUvAvailable] = createSignal<string | null>(null);
const [refreshing, setRefreshing] = createSignal(false);
const [envError, setEnvError] = createSignal<string | null>(null);
const [metamorphosisOpen, setMetamorphosisOpen] = createSignal(false);

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
};

function settingKey(root: string | null): string {
  return `interpreter:${root ?? ""}`;
}

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  broodVenv: ".venv",
  uv: "uv",
  path: "PATH",
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
    setCandidates(found);
    setUvAvailable(uv);
    const saved = await getSetting<string | null>(settingKey(root), null);
    const pick = saved && found.some((c) => c.path === saved) ? saved : (found[0]?.path ?? null);
    await selectInterpreter(pick, false);
  } catch (err) {
    setEnvError(describe(err));
  } finally {
    setRefreshing(false);
  }
}

/** Pick an interpreter; probes it for version info. */
export async function selectInterpreter(path: string | null, persist = true): Promise<void> {
  setSelectedInterpreter(path);
  setInterpreterInfo(null);
  if (persist) await setSetting(settingKey(brood()), path);
  if (!path) return;
  try {
    const info = await probeInterpreter(path);
    // Ignore a late answer if the user has already moved on.
    if (selectedInterpreter() === path) setInterpreterInfo(info);
  } catch (err) {
    setEnvError(describe(err));
  }
}

export function toggleMetamorphosis(open?: boolean): void {
  setMetamorphosisOpen(open ?? !metamorphosisOpen());
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
