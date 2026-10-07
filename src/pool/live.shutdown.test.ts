import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcEvent } from "../ipc";

interface Started {
  id: number;
  onProc: (event: ProcEvent) => void;
  onMessage: (line: string) => void;
}

const started: Started[] = [];
const killed: number[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args: { id: number }) => {
    if (cmd === "proc_kill") killed.push(args.id);
    return Promise.resolve();
  }),
}));
vi.mock("../ipc", () => ({
  poolStart: vi.fn((_req: unknown, onProc: Started["onProc"], onMessage: Started["onMessage"]) => {
    const id = started.length + 1;
    started.push({ id, onProc, onMessage });
    return Promise.resolve(id);
  }),
  poolSend: vi.fn(() => Promise.resolve()),
  poolInterrupt: vi.fn(() => Promise.resolve()),
}));
vi.mock("../env/store", () => ({ selectedInterpreter: () => "/usr/bin/python3" }));
vi.mock("../app/state", () => ({ brood: () => "/project" }));
vi.mock("../spawn/controller", () => ({
  output: { system: vi.fn(), append: vi.fn() },
  setStdinFallback: vi.fn(),
}));
vi.mock("../theme/store", () => ({ currentTheme: () => ({ plot: {} }) }));

const { installLivePool, poolProcId } = await import("./live");
const { pool, poolStatus } = await import("./client");

const cell = (code: string) =>
  ({ code, file: "t.py", startLine: 1, scope: "cell", cwd: null }) as const;

/** Exec through the client and answer the kernel's ready message. */
async function startKernel(code: string): Promise<Started> {
  const before = started.length;
  void pool().exec(cell(code));
  await vi.waitFor(() => expect(started.length).toBe(before + 1));
  const kernel = started[before];
  if (!kernel) throw new Error("no kernel started");
  kernel.onMessage(JSON.stringify({ event: "ready", python: "3.12.0" }));
  await vi.waitFor(() => expect(poolProcId()).toBe(kernel.id));
  return kernel;
}

describe("live console lifecycle", () => {
  let uninstall: () => void;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    uninstall = installLivePool();
  });
  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it("kills a kernel still busy in a cell after shutdown", async () => {
    const kernel = await startKernel("while True: pass");
    await pool().shutdown();
    vi.advanceTimersByTime(2000);
    expect(killed).toContain(kernel.id);
  });

  it("an old kernel exiting after a restart leaves the new one alone", async () => {
    const old = await startKernel("1");
    await pool().shutdown();
    const fresh = await startKernel("2");
    // The old process finishes exiting only now.
    old.onProc({ kind: "exit", code: 0, signal: null });
    old.onMessage(JSON.stringify({ event: "closed" }));
    expect(poolProcId()).toBe(fresh.id);
    expect(["idle", "busy"]).toContain(poolStatus());
  });
});
