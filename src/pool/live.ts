/**
 * The live pool client: a kernel process behind the protocol in protocol.ts.
 *
 * Starts lazily on the first exec with the interpreter metamorphosis chose,
 * in the brood as working directory. Requests get incrementing ids; replies
 * are matched by id from the JSON lines Rust forwards. Display events go out
 * through `emitPoolEvent` so the output model renders them in order.
 */
import { createEffect, createRoot, createSignal, on } from "solid-js";

import { brood } from "../app/state";
import { selectedInterpreter } from "../env/store";
import { invoke } from "@tauri-apps/api/core";
import { poolInterrupt, poolSend, poolStart, type ProcEvent } from "../ipc";
import { output, setStdinFallback } from "../spawn/controller";
import { currentTheme } from "../theme/store";
import { emitPoolEvent, poolStatus, setPoolClient, setPoolStatus } from "./client";
import { notifyExecFinished } from "./hooks";
import type {
  Cell,
  DatasetHealth,
  DisplayPayload,
  ExecRequest,
  ExecResult,
  PoolClient,
  VariableInfo,
} from "./protocol";

interface Pending {
  resolveDone?: (result: ExecResult) => void;
  resolveResult?: (data: unknown) => void;
  /** The exec request, so listeners learn what ran. */
  request?: ExecRequest;
}

interface Message {
  id?: number;
  event: "ready" | "display" | "done" | "result" | "croak" | "closed";
  payload?: DisplayPayload;
  ok?: boolean;
  durationMs?: number;
  data?: unknown;
  message?: string;
  python?: string;
}

let procId: number | null = null;
/**
 * Bumped for every kernel start and every shutdown. Events carry the
 * generation they were started with, so a kernel that is shutting down (its
 * exit arrives after a restart has begun) cannot tear down its successor.
 */
let generation = 0;
let nextId = 0;
/** Bumped every time an exec finishes, so caches keyed on pool state can expire. */
const [execGeneration, setExecGeneration] = createSignal(0);
export { execGeneration };
const pending = new Map<number, Pending>();
let readyResolvers: Array<() => void> = [];

/** The pool's process id while it runs, so stdin can be routed to it. */
export function poolProcId(): number | null {
  return procId;
}

function onProc(event: ProcEvent): void {
  switch (event.kind) {
    case "stdout":
      output.append("stdout", event.text);
      break;
    case "stderr":
      output.append("stderr", event.text);
      break;
    case "croak":
      output.append("croak", `${event.message}\n`);
      break;
    case "exit":
      output.system(
        event.code === 0
          ? "console exited"
          : `console stopped unexpectedly (${event.code ?? `signal ${event.signal ?? "?"}`})`,
      );
      teardown(event.code === 0 ? "cold" : "croaked");
      break;
    case "started":
      break;
  }
}

function onMessage(line: string): void {
  let msg: Message;
  try {
    msg = JSON.parse(line) as Message;
  } catch {
    return;
  }
  switch (msg.event) {
    case "ready":
      setPoolStatus("idle");
      output.system(`console ready · Python ${msg.python ?? "?"}`);
      readyResolvers.forEach((r) => r());
      readyResolvers = [];
      void configure();
      break;
    case "display":
      if (msg.id !== undefined && msg.payload)
        emitPoolEvent({ exec: msg.id, payload: msg.payload });
      break;
    case "done": {
      if (msg.id === undefined) break;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      // Shift+Enter pressed again while a cell ran queues the next exec; the
      // console is still busy until the last one is done.
      setPoolStatus([...pending.values()].some((q) => q.resolveDone) ? "busy" : "idle");
      setExecGeneration((g) => g + 1);
      const result = { exec: msg.id, ok: msg.ok ?? false, durationMs: msg.durationMs ?? 0 };
      p?.resolveDone?.(result);
      if (p?.request) void announce(p.request, result);
      break;
    }
    case "result": {
      if (msg.id === undefined) break;
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      p?.resolveResult?.(msg.data ?? null);
      break;
    }
    case "croak":
      output.append("croak", `console: ${msg.message ?? "unknown problem"}\n`);
      teardown("croaked");
      break;
    case "closed":
      if (poolStatus() !== "cold") teardown("croaked");
      break;
  }
}

function teardown(status: "cold" | "croaked"): void {
  procId = null;
  for (const [, p] of pending) {
    p.resolveDone?.({ exec: -1, ok: false, durationMs: 0 });
    p.resolveResult?.(null);
  }
  pending.clear();
  readyResolvers.forEach((r) => r());
  readyResolvers = [];
  setPoolStatus(status);
}

async function ensureStarted(): Promise<boolean> {
  if (procId !== null && poolStatus() !== "starting") return true;
  if (poolStatus() === "starting") {
    await new Promise<void>((resolve) => readyResolvers.push(resolve));
    return procId !== null;
  }
  const python = selectedInterpreter();
  if (!python) {
    output.append("croak", "No Python interpreter selected. Choose one from the status bar.\n");
    return false;
  }
  setPoolStatus("starting");
  output.system(`console starting · ${python}`);
  const started = ++generation;
  const current = () => started === generation;
  try {
    procId = await poolStart(
      { python, cwd: brood() },
      (event) => {
        if (current()) onProc(event);
      },
      (line) => {
        if (current()) onMessage(line);
      },
    );
  } catch (err) {
    output.append("croak", `could not start the Interactive Console: ${describe(err)}\n`);
    teardown("croaked");
    return false;
  }
  // The kernel may already have died (a broken interpreter exits at once)
  // or said ready before its id arrived; waiting then would never end.
  if (poolStatus() === "idle") return true;
  if (!current() || poolStatus() !== "starting") {
    procId = null;
    return false;
  }
  await new Promise<void>((resolve) => readyResolvers.push(resolve));
  return procId !== null && poolStatus() === "idle";
}

function send(op: string, fields: Record<string, unknown>): Promise<unknown> {
  const id = ++nextId;
  return new Promise((resolve) => {
    if (procId === null) {
      resolve(null);
      return;
    }
    pending.set(id, { resolveResult: resolve });
    poolSend(procId, JSON.stringify({ id, op, ...fields })).catch(() => {
      pending.delete(id);
      resolve(null);
    });
  });
}

/** Tell exec listeners what a finished cell left behind. */
async function announce(request: ExecRequest, result: ExecResult): Promise<void> {
  const variables = procId === null ? [] : await live.variables();
  notifyExecFinished({ request, result, variables });
}

async function configure(): Promise<void> {
  await send("configure", { plot: currentTheme().plot });
}

const live: PoolClient = {
  status: poolStatus,

  async exec(request: ExecRequest): Promise<ExecResult> {
    if (!(await ensureStarted()) || procId === null) return { exec: -1, ok: false, durationMs: 0 };
    const id = ++nextId;
    setPoolStatus("busy");
    return new Promise((resolve) => {
      pending.set(id, { resolveDone: resolve, request });
      poolSend(procId as number, JSON.stringify({ id, op: "exec", ...request })).catch((err) => {
        pending.delete(id);
        output.append("croak", `console: ${describe(err)}\n`);
        setPoolStatus("croaked");
        resolve({ exec: id, ok: false, durationMs: 0 });
      });
    });
  },

  async inspect(expression: string): Promise<DisplayPayload | null> {
    if (procId === null) return null;
    return (await send("inspect", { expression })) as DisplayPayload | null;
  },

  async variables(): Promise<VariableInfo[]> {
    if (procId === null) return [];
    const data = await send("variables", {});
    return Array.isArray(data) ? (data as VariableInfo[]) : [];
  },

  async datasetHealth(name: string): Promise<DatasetHealth | null> {
    if (procId === null) return null;
    const data = await send("dataset_health", { name });
    return data && typeof data === "object" ? (data as DatasetHealth) : null;
  },

  async tableRows(ref: string, rowStart: number, count: number): Promise<Cell[][]> {
    if (procId === null) return [];
    const data = await send("table_rows", { ref, rowStart, count });
    return Array.isArray(data) ? (data as Cell[][]) : [];
  },

  async matrixCells(ref: string, row: number, col: number): Promise<number[]> {
    if (procId === null) return [];
    const data = await send("matrix_cells", { ref, row, col });
    return Array.isArray(data) ? (data as number[]) : [];
  },

  async interrupt(): Promise<void> {
    if (procId === null) return;
    output.system("interrupting the console…");
    await poolInterrupt(procId);
  },

  async restart(): Promise<void> {
    await live.shutdown();
    await ensureStarted();
  },

  async shutdown(): Promise<void> {
    if (procId === null) return;
    const id = procId;
    generation++;
    output.system("console shutting down");
    try {
      await poolSend(id, JSON.stringify({ op: "shutdown" }));
    } catch {
      // Already gone.
    }
    // Belt and braces: if the interpreter ignores the shutdown, kill it.
    setTimeout(() => {
      if (procId === id) void invoke("proc_kill", { id }).catch(() => undefined);
    }, 1500);
    teardown("cold");
  },
};

/** Swap the live client in and react to interpreter and theme changes. */
export function installLivePool(): () => void {
  setPoolClient(live);
  setStdinFallback(poolProcId);
  const dispose = createRoot((disposeRoot) => {
    createEffect(on(selectedInterpreter, () => void live.shutdown(), { defer: true }));
    createEffect(on(currentTheme, () => void configure(), { defer: true }));
    return disposeRoot;
  });
  return () => {
    dispose();
    void live.shutdown();
    setStdinFallback(null);
    setPoolClient(null);
  };
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
