import { describe, expect, it } from "vitest";

import type { SpawnRequest } from "../ipc";
import type { CheckItem } from "./model";
import { summarize } from "./model";
import type { RunResult } from "./process";
import { runChecks, type CheckPorts } from "./sequence";

interface World {
  files: Record<string, string>;
  dirs: Set<string>;
  runs: SpawnRequest[];
  results: Array<Partial<RunResult>>;
  emitted: CheckItem[];
}

function world(patch: Partial<World> = {}): World {
  return { files: {}, dirs: new Set(), runs: [], results: [], emitted: [], ...patch };
}

function portsFor(w: World, patch: Partial<CheckPorts> = {}): CheckPorts {
  const join = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");
  return {
    file: "/hw/main.py",
    root: "/hw",
    python: "/v/bin/python",
    pythonVersion: "3.12.3",
    cwd: "/hw",
    cwdLabel: "hw/",
    otherDir: null,
    otherLabel: null,
    projectJsonVersion: null,
    testCommand: null,
    timeoutMs: 120_000,
    readText: (path) => {
      const text = w.files[path];
      return text === undefined ? Promise.reject(new Error("missing")) : Promise.resolve(text);
    },
    exists: (path) => Promise.resolve(path in w.files || w.dirs.has(path)),
    listDir: (path) =>
      Promise.resolve(
        [...Object.keys(w.files), ...w.dirs]
          .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/"))
          .map((p) => ({ name: p.slice(path.length + 1), isDirectory: w.dirs.has(p) })),
      ),
    join,
    run: (request) => {
      w.runs.push(request);
      const next = w.results.shift() ?? {};
      return Promise.resolve({
        stdout: "",
        stderr: "",
        code: 0,
        timedOut: false,
        cancelled: false,
        startFailure: null,
        ...next,
      });
    },
    emit: (item) => {
      w.emitted.push(item);
    },
    signal: new AbortController().signal,
    ...patch,
  };
}

const finalById = (items: CheckItem[]) =>
  Object.fromEntries(items.map((i) => [i.id, i])) as Record<CheckItem["id"], CheckItem>;

describe("runChecks", () => {
  it("runs all four checks in order and reports a clean project", async () => {
    const w = world({
      files: {
        "/hw/main.py": 'df = pd.read_csv("data/train.csv")\n',
        "/hw/data/train.csv": "",
        "/hw/pyproject.toml": 'requires-python = ">=3.11"\n',
        "/hw/test_main.py": "",
      },
      results: [
        { code: 0, stdout: "ok\n" },
        { code: 0 },
        { code: 0, stdout: "= 3 passed in 0.1s =" },
      ],
    });
    await runChecks(portsFor(w));
    const final = finalById(w.emitted);
    expect(w.emitted.map((i) => i.id)).toEqual([
      "python",
      "paths",
      "paths",
      "fresh",
      "fresh",
      "tests",
      "tests",
      "tests",
    ]);
    expect(final.python.state).toBe("pass");
    expect(final.paths.state).toBe("pass");
    expect(final.fresh.state).toBe("pass");
    expect(final.tests.title).toBe("3 tests passed");
    expect(w.runs.map((r) => r.args)).toEqual([
      ["-u", "/hw/main.py"],
      ["-c", "import pytest"],
      ["-m", "pytest", "-q", "--color=no"],
    ]);
    expect(w.runs[0]?.cwd).toBe("/hw");
    expect(
      summarize(
        w.emitted.filter((i) => i.state !== "running"),
        false,
      ),
    ).toContain("passed");
  });

  it("finds a path that only resolves from the project root", async () => {
    const w = world({
      files: { "/hw/src/main.py": 'open("data/x.csv")\n', "/hw/data/x.csv": "" },
    });
    await runChecks(
      portsFor(w, {
        file: "/hw/src/main.py",
        cwd: "/hw/src",
        cwdLabel: "src/",
        otherDir: "/hw",
        otherLabel: "hw/",
      }),
    );
    const paths = finalById(w.emitted).paths;
    expect(paths.state).toBe("fail");
    expect(paths.rows?.[0]?.text).toContain("exists from hw/");
  });

  it("skips tests without a project and fails the fresh run without an interpreter", async () => {
    const w = world({ files: { "/hw/main.py": "print(1)\n" } });
    await runChecks(portsFor(w, { root: null, python: null }));
    const final = finalById(w.emitted);
    expect(final.python.state).toBe("skip");
    expect(final.fresh.state).toBe("fail");
    expect(final.fresh.action?.command).toBe("metamorphosis.open");
    expect(final.tests.state).toBe("skip");
    expect(w.runs).toHaveLength(0);
  });

  it("uses a custom test command without probing pytest, and falls back to unittest", async () => {
    const w = world({
      files: { "/hw/main.py": "", "/hw/tests.py": "" },
      results: [{ code: 0 }, { code: 0, stderr: "Ran 2 tests in 0.0s\n\nOK\n" }],
    });
    await runChecks(portsFor(w, { testCommand: ["python", "tests.py"] }));
    expect(w.runs[1]).toMatchObject({ program: "python", args: ["tests.py"], cwd: "/hw" });
    expect(finalById(w.emitted).tests.title).toBe("2 tests passed");

    const w2 = world({
      files: { "/hw/main.py": "", "/hw/tests.py": "" },
      results: [
        { code: 0 },
        { code: 1 },
        { code: 1, stderr: "Ran 2 tests in 0.0s\n\nFAILED (failures=1)" },
      ],
    });
    await runChecks(portsFor(w2));
    expect(w2.runs[2]?.args).toEqual(["-m", "unittest", "discover", "-p", "*test*.py"]);
    expect(finalById(w2.emitted).tests.title).toBe("1 of 2 tests failed");
  });

  it("stops after the current step when cancelled", async () => {
    const controller = new AbortController();
    const w = world({ files: { "/hw/main.py": "" } });
    const ports = portsFor(w, {
      signal: controller.signal,
      run: (request) => {
        w.runs.push(request);
        controller.abort();
        return Promise.resolve({
          stdout: "",
          stderr: "",
          code: null,
          timedOut: false,
          cancelled: true,
          startFailure: null,
        });
      },
    });
    await runChecks(ports);
    expect(w.runs).toHaveLength(1);
    expect(w.emitted.map((i) => i.id)).not.toContain("tests");
  });
});

describe("summarize", () => {
  const item = (state: CheckItem["state"]): CheckItem => ({ id: "fresh", state, title: "" });

  it("counts passes over non-skipped checks", () => {
    expect(summarize([], false)).toBe("");
    expect(summarize([], true)).toBe("Checking…");
    expect(summarize([item("pass"), item("running")], true)).toBe("Checking… 1 passed so far");
    expect(summarize([item("pass"), item("pass"), item("fail"), item("skip")], false)).toBe(
      "2 of 3 checks passed · 1 failed",
    );
    expect(summarize([item("pass"), item("warn")], false)).toBe(
      "1 of 2 checks passed · 1 to look at",
    );
    expect(summarize([item("skip")], false)).toBe("Nothing to check");
  });
});
