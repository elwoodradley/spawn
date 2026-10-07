import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import type { ProcEvent, SpawnRequest } from "../ipc";

const spawned: SpawnRequest[] = [];
const env = vi.hoisted(() => ({ select: (_path: string) => {} }));

vi.mock("../ipc", () => ({
  dirName: (p: string) => p.slice(0, p.lastIndexOf("/")),
  joinPath: (...parts: string[]) => parts.join("/"),
  pathExists: () => Promise.resolve(false),
  spawnProcess: (request: SpawnRequest, onEvent: (e: ProcEvent) => void) => {
    spawned.push(request);
    queueMicrotask(() => onEvent({ kind: "exit", code: 0, signal: null }));
    return Promise.resolve({ id: 1, write: vi.fn(), closeStdin: vi.fn(), kill: vi.fn() });
  },
}));
vi.mock("../env/store", () => {
  const [python, setPython] = createSignal("/home/me/a/.venv/bin/python");
  env.select = setPython;
  return {
    selectedInterpreter: python,
    selectedCandidate: () => ({ path: python(), source: "custom" }),
    toggleMetamorphosis: vi.fn(),
    uvAvailable: () => "/usr/bin/uv",
  };
});
vi.mock("../app/project", () => ({
  resolveWorkingDirectory: vi.fn(),
  updateProjectSettings: vi.fn(),
}));
vi.mock("../app/state", () => ({ brood: () => "/home/me/a" }));
vi.mock("../pool/variables", () => ({ variables: { list: [] } }));
vi.mock("../spawn/controller", () => ({
  output: { append: vi.fn(), system: vi.fn() },
  spawnCommand: () => null,
  spawnFile: vi.fn(),
}));

const { resolveActions } = await import("./fixes");

const CTX = {
  source: "run" as const,
  cwd: "/home/me/a",
  projectRoot: "/home/me/a",
  consoleVariables: [],
};
const SPEC = { kind: "install" as const, packageName: "numpy", moduleName: "numpy" };

describe("the Install button", () => {
  it("runs the command its label names", async () => {
    const [action] = await resolveActions([SPEC], CTX);
    expect(action?.label).toBe(
      "Install numpy · runs uv pip install --python /home/me/a/.venv/bin/python numpy",
    );
    expect(await action?.run()).toBe("Installed numpy. Run again.");
    expect(spawned.pop()?.args).toContain("/home/me/a/.venv/bin/python");
  });

  it("does not install into the old interpreter after the student switched", async () => {
    const [action] = await resolveActions([SPEC], CTX);
    env.select("/home/me/b/.venv/bin/python");
    expect(await action?.run()).toMatch(/interpreter changed/i);
    expect(spawned).toHaveLength(0);
  });
});
