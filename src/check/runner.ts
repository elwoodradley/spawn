/**
 * Check Before Submitting: state and the entry points the command and the
 * panel use. `runCheck(file)` saves, wires the real ports (interpreter,
 * working directory, filesystem, processes) and runs the sequence; items
 * land in `checkItems()` as they finish. `cancelCheck()` kills whatever is
 * running. Output is captured privately: the Output panel and Metrics
 * never see a check's run.
 */
import { createSignal } from "solid-js";

import { describeWorkingDirectory, projectSettings, resolveWorkingDirectory } from "../app/project";
import { settings } from "../app/settings";
import { brood } from "../app/state";
import { saveAllDirty } from "../editor/documents";
import { interpreterInfo, selectedCandidate, selectedInterpreter } from "../env/store";
import { dirName, joinPath, listDir, pathExists, readText } from "../ipc";
import { summarize, type CheckItem } from "./model";
import { runToCompletion } from "./process";
import { runChecks, type CheckPorts } from "./sequence";

export type CheckStatus = "idle" | "running";

const [checkItems, setCheckItems] = createSignal<readonly CheckItem[]>([]);
const [checkStatus, setCheckStatus] = createSignal<CheckStatus>("idle");
const [checkedFile, setCheckedFile] = createSignal<string | null>(null);

export { checkItems, checkStatus, checkedFile };

export const checkSummary = () => summarize(checkItems(), checkStatus() === "running");

let controller: AbortController | null = null;

/** Replace the item with the same id, or append. */
function emit(item: CheckItem): void {
  setCheckItems((current) => {
    const index = current.findIndex((i) => i.id === item.id);
    if (index === -1) return [...current, item];
    const next = [...current];
    next[index] = item;
    return next;
  });
}

export async function runCheck(file: string): Promise<void> {
  if (checkStatus() === "running") return;
  if (settings().spawn.saveBeforeSpawn) await saveAllDirty();

  controller = new AbortController();
  const { signal } = controller;
  setCheckItems([]);
  setCheckedFile(file);
  setCheckStatus("running");

  const root = brood();
  const cwd = resolveWorkingDirectory(file);
  const fileDir = dirName(file);
  const otherDir = root && root !== cwd ? root : fileDir !== cwd ? fileDir : null;
  const project = projectSettings();

  const ports: CheckPorts = {
    file,
    root,
    python: selectedInterpreter(),
    pythonVersion: interpreterInfo()?.version ?? selectedCandidate()?.version ?? null,
    cwd,
    cwdLabel: describeWorkingDirectory(cwd, root),
    otherDir,
    otherLabel: otherDir ? describeWorkingDirectory(otherDir, root) : null,
    projectJsonVersion: project.pythonVersion ?? null,
    testCommand: project.testCommand ?? null,
    timeoutMs: settings().check.timeoutSeconds * 1000,
    readText,
    exists: pathExists,
    listDir,
    join: joinPath,
    run: (request, timeoutMs) => runToCompletion(request, { timeoutMs, signal }),
    emit: (item) => {
      if (!signal.aborted || item.state !== "running") emit(item);
    },
    signal,
  };

  try {
    await runChecks(ports);
  } finally {
    if (signal.aborted) {
      setCheckItems((items) => items.filter((i) => i.state !== "running"));
    }
    controller = null;
    setCheckStatus("idle");
  }
}

export function cancelCheck(): void {
  controller?.abort();
}
