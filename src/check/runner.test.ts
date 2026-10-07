import { describe, expect, it, vi } from "vitest";

const runChecks = vi.fn(
  (ports: { signal: AbortSignal }) =>
    new Promise<void>((resolve) => ports.signal.addEventListener("abort", () => resolve())),
);

vi.mock("../ipc", () => ({
  dirName: (p: string) => p.slice(0, p.lastIndexOf("/")),
  joinPath: (...parts: string[]) => parts.join("/"),
  listDir: vi.fn(),
  pathExists: vi.fn(),
  readText: vi.fn(),
  getSetting: vi.fn((_key: string, fallback: unknown) => Promise.resolve(fallback)),
  setSetting: vi.fn(() => Promise.resolve()),
}));
vi.mock("../app/project", () => ({
  describeWorkingDirectory: (p: string) => p,
  projectSettings: () => ({}),
  resolveWorkingDirectory: () => "/proj",
}));
vi.mock("../app/state", () => ({ brood: () => "/proj" }));
vi.mock("../editor/documents", () => ({
  saveAllDirty: () => new Promise((resolve) => setTimeout(resolve, 5)),
}));
vi.mock("../env/store", () => ({
  interpreterInfo: () => null,
  selectedCandidate: () => null,
  selectedInterpreter: () => "/venv/bin/python",
}));
vi.mock("./process", () => ({ runToCompletion: vi.fn() }));
vi.mock("./sequence", () => ({ runChecks }));

const { cancelCheck, checkStatus, runCheck } = await import("./runner");

describe("runCheck", () => {
  it("runs one check when F6 is pressed twice while files save, and Cancel ends it", async () => {
    const first = runCheck("/proj/a.py");
    const second = runCheck("/proj/a.py");
    expect(checkStatus()).toBe("running");
    await second;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(runChecks).toHaveBeenCalledTimes(1);
    cancelCheck();
    await first;
    expect(checkStatus()).toBe("idle");
  });
});
