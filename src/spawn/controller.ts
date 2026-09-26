/**
 * The spawn controller: runs the active file as a child process and feeds
 * its output to the output panel.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `spawnStatus()` is "idle" or "running".
 * - `spawnFile(path)` saves dirty documents, then runs `path` with the
 *   selected interpreter, cwd = brood root (or the file's folder), unbuffered.
 * - `stopSpawn()` kills the running child.
 *
 * Python runs with `-u` and PYTHONUNBUFFERED so prompts from input() reach
 * the panel before the program blocks waiting for the answer.
 */
import { createSignal } from "solid-js";

import { brood } from "../app/state";
import { saveAllDirty } from "../editor/documents";
import { selectedInterpreter } from "../env/store";
import {
  baseName,
  dirName,
  getSetting,
  spawnProcess,
  type ProcEvent,
  type ProcHandle,
} from "../ipc";
import { MetricsModel, type UserPattern } from "./metrics";
import { OutputModel } from "./output";

export type SpawnStatus = "idle" | "running";
export type SpawnOutcome = "none" | "ok" | "croak" | "stopped";

export interface SpawnCommand {
  program: string;
  args: string[];
  cwd: string;
}

const schedule = (flush: () => void) =>
  typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(flush)
    : setTimeout(flush, 16);

/** Everything the output panel renders. */
export const output = new OutputModel({ schedule });
/** Series, progress and rate scraped from the same output, for the run panel. */
export const metrics = new MetricsModel();

/** Load the user's extra metric patterns from settings (key `run.patterns`). */
export async function loadRunPatterns(): Promise<void> {
  const raw = await getSetting<unknown>("run.patterns", []);
  const list = Array.isArray(raw)
    ? raw.filter(
        (p): p is UserPattern =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as UserPattern).name === "string" &&
          typeof (p as UserPattern).regex === "string",
      )
    : [];
  metrics.setPatterns(list);
}

const [spawnStatus, setSpawnStatus] = createSignal<SpawnStatus>("idle");
const [spawnCommand, setSpawnCommand] = createSignal<SpawnCommand | null>(null);
const [elapsedMs, setElapsedMs] = createSignal(0);
const [exitCode, setExitCode] = createSignal<number | null>(null);
const [outcome, setOutcome] = createSignal<SpawnOutcome>("none");
/** Bumped whenever the stdin row should take focus. */
const [stdinFocusTick, setStdinFocusTick] = createSignal(0);

export { spawnStatus, setSpawnStatus, spawnCommand, elapsedMs, exitCode, outcome, stdinFocusTick };

let handle: ProcHandle | null = null;
let stoppedByUser = false;
let startedAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export async function spawnFile(path: string): Promise<void> {
  if (spawnStatus() === "running") {
    output.system("A spawn is already running. Stop it first.");
    return;
  }
  await saveAllDirty();

  const program = selectedInterpreter();
  if (!program) {
    output.append("croak", "No Python interpreter selected. Open metamorphosis to pick one.\n");
    return;
  }

  const cwd = brood() ?? dirName(path);
  const command: SpawnCommand = { program, args: ["-u", path], cwd };
  setSpawnCommand(command);
  setExitCode(null);
  setOutcome("none");
  metrics.reset();
  output.system(`spawn ${baseName(path)} · ${program} · in ${cwd}`);

  stoppedByUser = false;
  setSpawnStatus("running");
  startTimer();

  try {
    handle = await spawnProcess(
      { ...command, env: { PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" } },
      onEvent,
    );
    requestStdinFocus();
  } catch (err) {
    finish(null, null, `could not spawn ${program}: ${describe(err)}`);
  }
}

export async function stopSpawn(): Promise<void> {
  if (!handle) return;
  stoppedByUser = true;
  output.system("stopping…");
  try {
    await handle.kill();
  } catch (err) {
    output.append("croak", `could not stop: ${describe(err)}\n`);
  }
}

/** Send one line to the child's stdin and echo it in the panel. */
export async function writeStdin(text: string): Promise<void> {
  if (!handle) return;
  output.append("stdin", `${text}\n`);
  try {
    await handle.write(`${text}\n`);
  } catch (err) {
    output.append("croak", `stdin: ${describe(err)}\n`);
  }
}

/** Send EOF; input() in the child raises EOFError from here on. */
export async function closeStdin(): Promise<void> {
  if (!handle) return;
  output.system("stdin closed (EOF)");
  try {
    await handle.closeStdin();
  } catch (err) {
    output.append("croak", `stdin: ${describe(err)}\n`);
  }
}

export function requestStdinFocus(): void {
  setStdinFocusTick((t) => t + 1);
}

function onEvent(event: ProcEvent): void {
  switch (event.kind) {
    case "started":
      break;
    case "stdout":
      output.append("stdout", event.text);
      metrics.feed(event.text);
      break;
    case "stderr":
      output.append("stderr", event.text);
      metrics.feed(event.text);
      break;
    case "croak":
      output.append("croak", `${event.message}\n`);
      break;
    case "exit":
      finish(event.code, event.signal);
      break;
  }
}

function finish(code: number | null, signal: number | null, failure?: string): void {
  stopTimer();
  metrics.flush();
  handle = null;
  setSpawnStatus("idle");
  setExitCode(code);
  const seconds = (elapsedMs() / 1000).toFixed(1);

  if (failure !== undefined) {
    setOutcome("croak");
    output.append("croak", `${failure}\n`);
  } else if (stoppedByUser) {
    setOutcome("stopped");
    output.system(`stopped after ${seconds}s`);
  } else if (code === 0) {
    setOutcome("ok");
    output.system(`exited with code 0 after ${seconds}s`);
  } else {
    setOutcome("croak");
    const how = code === null ? `killed by signal ${signal ?? "?"}` : `exited with code ${code}`;
    output.system(`${how} after ${seconds}s`);
  }
}

function startTimer(): void {
  startedAt = Date.now();
  setElapsedMs(0);
  timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
}

function stopTimer(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  setElapsedMs(Date.now() - startedAt);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
