// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProcEvent, ProcHandle, SpawnRequest } from "../ipc";

interface FakeChild {
  request: SpawnRequest;
  emit: (event: ProcEvent) => void;
  kills: number;
  /** Resolve the pending spawnProcess call with this child's handle. */
  resolve: () => void;
}

const children: FakeChild[] = [];

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(() => Promise.resolve()) }));
vi.mock("../ipc", () => ({
  baseName: (p: string) => p.split(/[\\/]/).pop() ?? p,
  notify: vi.fn(() => Promise.resolve()),
  readText: vi.fn(() => Promise.resolve("print('hi')\n")),
  getSetting: vi.fn((_key: string, fallback: unknown) => Promise.resolve(fallback)),
  setSetting: vi.fn(() => Promise.resolve()),
  spawnProcess: (request: SpawnRequest, onEvent: (e: ProcEvent) => void): Promise<ProcHandle> =>
    new Promise((resolve) => {
      const child: FakeChild = {
        request,
        emit: onEvent,
        kills: 0,
        resolve: () =>
          resolve({
            id: children.length,
            write: () => Promise.resolve(),
            closeStdin: () => Promise.resolve(),
            kill: () => {
              child.kills++;
              onEvent({ kind: "exit", code: null, signal: 9 });
              return Promise.resolve();
            },
          }),
      };
      children.push(child);
    }),
}));
vi.mock("../editor/documents", () => ({
  documentText: () => null,
  saveAllDirty: () => new Promise((resolve) => setTimeout(resolve, 5)),
}));
vi.mock("../env/store", () => ({ selectedInterpreter: () => "/venv/bin/python" }));
vi.mock("../app/project", () => ({ resolveWorkingDirectory: () => "/proj" }));
vi.mock("./runHistory", () => ({ recordRun: vi.fn() }));

const { outcome, spawnFile, spawnStatus, stopSpawn } = await import("./controller");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function untilSpawned(count: number): Promise<void> {
  for (let i = 0; i < 50 && children.length < count; i++) await tick();
}

beforeEach(() => {
  children.length = 0;
});

describe("run controller", () => {
  it("starts one process when Run is pressed twice before the first has started", async () => {
    const first = spawnFile("/proj/a.py");
    const second = spawnFile("/proj/a.py");
    await untilSpawned(1);
    children[0]?.resolve();
    await Promise.all([first, second]);
    expect(children).toHaveLength(1);
    expect(spawnStatus()).toBe("running");
    children[0]?.emit({ kind: "exit", code: 0, signal: null });
    expect(spawnStatus()).toBe("idle");
  });

  it("kills the child when Stop is pressed while it is still starting", async () => {
    const run = spawnFile("/proj/a.py");
    await untilSpawned(1);
    expect(spawnStatus()).toBe("running");
    await stopSpawn();
    children[0]?.resolve();
    await run;
    expect(children[0]?.kills).toBe(1);
    expect(spawnStatus()).toBe("idle");
    expect(outcome()).toBe("stopped");
  });

  it("does not keep a dead handle when the exit arrives before the id", async () => {
    const run = spawnFile("/proj/a.py");
    await untilSpawned(1);
    children[0]?.emit({ kind: "exit", code: 0, signal: null });
    children[0]?.resolve();
    await run;
    expect(spawnStatus()).toBe("idle");
    // With no live handle, Stop has nothing to kill.
    await stopSpawn();
    expect(children[0]?.kills).toBe(0);
    // And the next run starts normally.
    const next = spawnFile("/proj/a.py");
    await untilSpawned(2);
    children[1]?.resolve();
    await next;
    expect(spawnStatus()).toBe("running");
    children[1]?.emit({ kind: "exit", code: 0, signal: null });
  });
});
