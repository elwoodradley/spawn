/**
 * The spawn controller: runs the active file as a child process and feeds
 * its output to the output panel.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `spawnStatus()` is "idle" or "running".
 * - `spawnFile(path)` saves dirty documents, then runs `path` with the
 *   selected interpreter, unbuffered, in the working directory the project
 *   settings resolve (the file's own folder by default).
 * - `stopSpawn()` kills the running child.
 *
 * Python runs with `-u` and PYTHONUNBUFFERED so prompts from input() reach
 * the panel before the program blocks waiting for the answer.
 */
import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";

import { resolveWorkingDirectory } from "../app/project";
import { settings, type RunPattern } from "../app/settings";
import { documentText, saveAllDirty } from "../editor/documents";
import { selectedInterpreter } from "../env/store";
import { baseName, notify, readText, spawnProcess, type ProcEvent, type ProcHandle } from "../ipc";
import { MetricsModel } from "./metrics";
import { recordRun, type RunSnapshot } from "./runHistory";
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

/** Hand the user's extra metric patterns (settings `run.patterns`) to the parser. */
export function applyRunPatterns(patterns: readonly RunPattern[]): void {
  metrics.setPatterns(patterns.map((p) => ({ name: p.name, regex: p.regex })));
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
    output.system("A run is already in progress. Stop it first.");
    return;
  }
  if (settings().spawn.saveBeforeSpawn) await saveAllDirty();
  if (settings().spawn.clearOutputOnSpawn) output.clear();

  const program = selectedInterpreter();
  if (!program) {
    output.append("croak", "No Python interpreter selected. Choose one from the status bar.\n");
    return;
  }

  const cwd = resolveWorkingDirectory(path);
  const command: SpawnCommand = { program, args: ["-u", path], cwd };
  snapshot = await takeSnapshot(path, command);
  setSpawnCommand(command);
  setExitCode(null);
  setOutcome("none");
  metrics.reset();
  output.system(`run ${baseName(path)} · ${program} · in ${cwd}`);

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
    finish(null, null, `could not start ${program}: ${describe(err)}`);
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
/** Where stdin goes when no spawn is running: the pool, if one is up. */
let stdinFallback: (() => number | null) | null = null;
export function setStdinFallback(fn: (() => number | null) | null): void {
  stdinFallback = fn;
}

export async function writeStdin(text: string): Promise<void> {
  const target = handle ?? poolStdinHandle();
  if (!target) return;
  output.append("stdin", `${text}\n`);
  try {
    await target.write(`${text}\n`);
  } catch (err) {
    output.append("croak", `stdin: ${describe(err)}\n`);
  }
}

function poolStdinHandle(): Pick<ProcHandle, "write" | "closeStdin"> | null {
  const id = stdinFallback?.();
  if (id === null || id === undefined) return null;
  return {
    write: (data) => invoke("proc_write", { id, data }),
    closeStdin: () => invoke("proc_close_stdin", { id }),
  };
}

/** Send EOF; input() in the child raises EOFError from here on. */
export async function closeStdin(): Promise<void> {
  const target = handle ?? poolStdinHandle();
  if (!target) return;
  output.system("stdin closed (EOF)");
  try {
    await target.closeStdin();
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
  notifyIfAway(code, seconds);
  snapshotRun();
}

/** Keep this run's curves so the next run can be compared against it. */
function snapshotRun(): void {
  const ran = spawnCommand();
  const kind = outcome();
  if (!ran || kind === "none") return;
  recordRun(
    {
      startedAt,
      file: baseName(ran.args[ran.args.length - 1] ?? ""),
      command: `${baseName(ran.program)} ${ran.args.map(baseName).join(" ")}`,
      durationMs: elapsedMs(),
      outcome: kind,
      series: metrics.series,
      snapshot: snapshot ?? undefined,
      xUnit: metrics.xUnit(),
    },
    settings().run.keepRuns,
  );
}

/** The code and launch settings a run started with, for "what changed?". */
let snapshot: RunSnapshot | null = null;

async function takeSnapshot(path: string, command: SpawnCommand): Promise<RunSnapshot | null> {
  try {
    const code = documentText(path) ?? (await readText(path));
    return { path, code, python: command.program, cwd: command.cwd, args: [...command.args] };
  } catch {
    return null;
  }
}

/** A desktop notification when a spawn ends while the user is elsewhere. */
function notifyIfAway(code: number | null, seconds: string): void {
  if (!settings().spawn.notifyWhenDone || document.hasFocus()) return;
  const ran = spawnCommand();
  const file = ran ? baseName(ran.args[ran.args.length - 1] ?? "") : "run";
  const how =
    outcome() === "ok"
      ? `exit 0`
      : outcome() === "stopped"
        ? "stopped"
        : code === null
          ? "killed"
          : `exit ${code}`;
  const verb = outcome() === "croak" ? "failed" : "finished";
  void notify("SPAWN", `run ${verb}: ${file} · ${how} · ${seconds}s`);
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
