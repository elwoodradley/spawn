import { afterEach, describe, expect, it, vi } from "vitest";

import type { TransportHooks } from "./transport";

interface FakeProc {
  id: number;
  stopped: boolean;
  hooks: TransportHooks;
}
const procs: FakeProc[] = [];

vi.mock("../ipc", () => ({
  which: () => Promise.resolve("/usr/bin/pyright-langserver"),
  uvPath: () => Promise.resolve(null),
  getSetting: <T>(_key: string, fallback: T) => Promise.resolve(fallback),
  setSetting: () => Promise.resolve(),
}));

vi.mock("../env/store", () => ({ selectedInterpreter: () => "/p/.venv/bin/python" }));

vi.mock("./transport", () => ({
  startServerProcess: (_request: unknown, hooks: TransportHooks) => {
    const proc: FakeProc = { id: procs.length + 1, stopped: false, hooks };
    procs.push(proc);
    return Promise.resolve({
      id: proc.id,
      transport: { send() {}, subscribe() {}, unsubscribe() {} },
      stop: () => {
        proc.stopped = true;
        return Promise.resolve();
      },
    });
  },
}));

vi.mock("./client", () => ({
  createClient: () => ({
    connect() {},
    disconnect() {},
    notification() {},
    initializing: Promise.resolve(),
  }),
}));

const { setBrood } = await import("../app/state");
const { lspStatus, restartServer } = await import("./server");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  procs.length = 0;
});

describe("language server lifecycle", () => {
  it("leaves exactly one server running when two starts overlap", async () => {
    setBrood("/p");
    await Promise.all([restartServer(), restartServer()]);
    const running = procs.filter((p) => !p.stopped);
    expect(running).toHaveLength(1);
    expect(lspStatus()).toBe("ready");
  });

  it("stops restarting a server that crashes right after starting", async () => {
    setBrood("/p");
    await restartServer();
    for (let i = 0; i < 10; i++) {
      const live = procs.filter((p) => !p.stopped).at(-1);
      if (!live) break;
      live.hooks.onExit?.(1);
      live.stopped = true;
      await flush();
    }
    // The first start plus at most three automatic restarts.
    expect(procs.length).toBeLessThanOrEqual(4);
    expect(lspStatus()).toBe("error");
  });
});
