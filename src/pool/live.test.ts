import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { ProcEvent } from "../ipc";

interface FakeKernel {
  id: number;
  onProc: (event: ProcEvent) => void;
  onMessage: (line: string) => void;
}

const kernels: FakeKernel[] = [];
/** When set, poolStart waits for this before returning the id. */
let gate: Promise<void> | null = null;

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("../ipc", () => ({
  poolStart: async (
    _request: unknown,
    onProc: (event: ProcEvent) => void,
    onMessage: (line: string) => void,
  ): Promise<number> => {
    const kernel = { id: kernels.length + 1, onProc, onMessage };
    kernels.push(kernel);
    if (gate) await gate;
    return kernel.id;
  },
  poolSend: vi.fn(() => Promise.resolve()),
  poolInterrupt: vi.fn(() => Promise.resolve()),
}));
vi.mock("../app/state", () => ({ brood: () => "/proj" }));
vi.mock("../env/store", () => {
  const [python] = createSignal("/venv/bin/python");
  return { selectedInterpreter: python };
});
vi.mock("../spawn/controller", () => ({
  output: { append: vi.fn(), system: vi.fn() },
  setStdinFallback: vi.fn(),
}));
vi.mock("../theme/store", () => {
  const [theme] = createSignal({ plot: {} });
  return { currentTheme: theme };
});

const { installLivePool, poolProcId } = await import("./live");
const { pool, poolStatus } = await import("./client");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const ready = (k: FakeKernel | undefined) =>
  k?.onMessage(JSON.stringify({ event: "ready", python: "3.12.1" }));

describe("Interactive Console restart", () => {
  installLivePool();

  it("is not torn down by the previous kernel exiting after the restart began", async () => {
    const first = pool().restart();
    await tick();
    ready(kernels[0]);
    await first;
    expect(poolProcId()).toBe(1);

    const second = pool().restart();
    await tick();
    // The old kernel's exit and closed notice arrive while the new one starts.
    kernels[0]?.onProc({ kind: "exit", code: 0, signal: null });
    kernels[0]?.onMessage(JSON.stringify({ event: "closed" }));
    ready(kernels[1]);
    await second;

    expect(kernels).toHaveLength(2);
    expect(poolProcId()).toBe(2);
    expect(poolStatus()).toBe("idle");
  });

  it("does not wait forever when the kernel dies before its id arrives", async () => {
    await pool().shutdown();
    let open = () => {};
    gate = new Promise<void>((resolve) => (open = resolve));
    const run = pool().exec({ code: "1", file: null, startLine: 1, scope: "cell", cwd: null });
    await tick();
    kernels[kernels.length - 1]?.onProc({ kind: "exit", code: 1, signal: null });
    open();
    gate = null;
    const result = await run;
    expect(result.ok).toBe(false);
    expect(poolProcId()).toBeNull();
    expect(poolStatus()).toBe("croaked");
  });

  it("stays busy until the last queued cell is done", async () => {
    const { poolSend } = await import("../ipc");
    const sent = () =>
      vi
        .mocked(poolSend)
        .mock.calls.map(([, line]) => JSON.parse(line) as { id?: number; op: string })
        .filter((m) => m.op === "exec");
    const cell = { code: "1", file: null, startLine: 1, scope: "cell" as const, cwd: null };
    const first = pool().exec(cell);
    await tick();
    const kernel = kernels[kernels.length - 1];
    ready(kernel);
    await tick();
    const second = pool().exec(cell);
    await tick();
    const [a, b] = sent().slice(-2);
    kernel?.onMessage(JSON.stringify({ event: "done", id: a?.id, ok: true }));
    await first;
    expect(poolStatus()).toBe("busy");
    kernel?.onMessage(JSON.stringify({ event: "done", id: b?.id, ok: true }));
    await second;
    expect(poolStatus()).toBe("idle");
  });
});
