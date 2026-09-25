/**
 * Metamorphosis state: which interpreters exist and which one is selected.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `selectedInterpreter()` is the absolute path the spawn controller runs.
 * - `refreshInterpreters(brood)` rediscovers candidates when the brood changes.
 */
import { createSignal } from "solid-js";

import type { Candidate, PythonInfo } from "../ipc";

const [candidates, setCandidates] = createSignal<readonly Candidate[]>([]);
const [selectedInterpreter, setSelectedInterpreter] = createSignal<string | null>(null);
const [interpreterInfo, setInterpreterInfo] = createSignal<PythonInfo | null>(null);

export {
  candidates,
  setCandidates,
  selectedInterpreter,
  setSelectedInterpreter,
  interpreterInfo,
  setInterpreterInfo,
};

export async function refreshInterpreters(_brood: string | null): Promise<void> {}
