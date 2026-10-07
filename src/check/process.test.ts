import { describe, expect, it } from "vitest";

import type { ProcEvent, ProcHandle, SpawnRequest } from "../ipc";
import { runToCompletion } from "./process";

/** A fake child: the test scripts its events and records what was asked of it. */
function fakeSpawn(script: (emit: (e: ProcEvent) => void, log: string[]) => void) {
  const log: string[] = [];
  const requests: SpawnRequest[] = [];
  const spawn = (request: SpawnRequest, onEvent: (e: ProcEvent) => void): Promise<ProcHandle> => {
    requests.push(request);
    const handle: ProcHandle = {
      id: 1,
      write: () => Promise.resolve(),
      closeStdin: () => {
        log.push("closeStdin");
        return Promise.resolve();
      },
      kill: () => {
        log.push("kill");
        onEvent({ kind: "exit", code: null, signal: 9 });
        return Promise.resolve();
      },
    };
    queueMicrotask(() => script(onEvent, log));
    return Promise.resolve(handle);
  };
  return { spawn, log, requests };
}

describe("runToCompletion", () => {
  it("closes stdin, buffers both streams in order and reports the exit code", async () => {
    const fake = fakeSpawn((emit) => {
      emit({ kind: "started", pid: 7 });
      emit({ kind: "stdout", text: "a\n" });
      emit({ kind: "stderr", text: "warn\n" });
      emit({ kind: "stdout", text: "b\n" });
      emit({ kind: "exit", code: 0, signal: null });
    });
    const out = await runToCompletion(
      { program: "python", args: ["-u", "x.py"], cwd: "/hw" },
      { timeoutMs: 1000, spawn: fake.spawn },
    );
    expect(out).toEqual({
      stdout: "a\nb\n",
      stderr: "warn\n",
      code: 0,
      timedOut: false,
      cancelled: false,
      startFailure: null,
    });
    expect(fake.log).toEqual(["closeStdin"]);
    expect(fake.requests[0]?.env).toMatchObject({ PYTHONUNBUFFERED: "1" });
  });

  it("kills the child at the time limit", async () => {
    const fake = fakeSpawn((emit) => emit({ kind: "stdout", text: "working" }));
    const out = await runToCompletion(
      { program: "p", args: [] },
      { timeoutMs: 10, spawn: fake.spawn },
    );
    expect(out.timedOut).toBe(true);
    expect(out.code).toBeNull();
    expect(fake.log).toContain("kill");
  });

  it("kills a child whose start outlasted the time limit", async () => {
    const fake = fakeSpawn(() => undefined);
    const slow = (request: SpawnRequest, onEvent: (e: ProcEvent) => void) =>
      new Promise<ProcHandle>((resolve) => {
        setTimeout(() => resolve(fake.spawn(request, onEvent)), 30);
      });
    const out = await runToCompletion({ program: "p", args: [] }, { timeoutMs: 5, spawn: slow });
    expect(out.timedOut).toBe(true);
    expect(fake.log).toContain("kill");
  });

  it("kills the child when the signal aborts", async () => {
    const controller = new AbortController();
    const fake = fakeSpawn(() => controller.abort());
    const out = await runToCompletion(
      { program: "p", args: [] },
      { timeoutMs: 1000, signal: controller.signal, spawn: fake.spawn },
    );
    expect(out.cancelled).toBe(true);
    expect(fake.log).toContain("kill");
  });

  it("caps the buffered output and reports a spawn failure", async () => {
    const fake = fakeSpawn((emit) => {
      emit({ kind: "stdout", text: "x".repeat(50) });
      emit({ kind: "stdout", text: "y".repeat(50) });
      emit({ kind: "exit", code: 0, signal: null });
    });
    const out = await runToCompletion(
      { program: "p", args: [] },
      { timeoutMs: 1000, maxChars: 60, spawn: fake.spawn },
    );
    expect(out.stdout).toHaveLength(60);
    const failed = await runToCompletion(
      { program: "missing", args: [] },
      { timeoutMs: 1000, spawn: () => Promise.reject(new Error("no such program")) },
    );
    expect(failed.startFailure).toBe("no such program");
    expect(failed.code).toBeNull();
  });
});
