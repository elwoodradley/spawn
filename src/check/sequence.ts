/**
 * The order of the pre-submit checks and how each one gets its facts.
 * Everything it needs from the app (files, processes, the interpreter)
 * comes in through `CheckPorts`, so the whole sequence runs in a test with
 * fakes. `runner.ts` wires the real ports.
 */
import type { SpawnRequest } from "../ipc";
import { freshRunItem } from "./freshRun";
import { CHECK_TITLES, type CheckItem, type CheckRow } from "./model";
import { classifyPath, isAbsolutePath, pathsItem, scanPaths } from "./paths";
import type { RunResult } from "./process";
import { expectedPython, pythonVersionItem } from "./pythonVersion";
import { buildTestCommand, findTestTargets, hasTests, testsItem } from "./tests";

export interface CheckPorts {
  file: string;
  root: string | null;
  python: string | null;
  pythonVersion: string | null;
  /** Where the run starts, and the other candidate folder (root or file dir). */
  cwd: string;
  cwdLabel: string;
  otherDir: string | null;
  otherLabel: string | null;
  projectJsonVersion: string | null;
  testCommand: readonly string[] | null;
  timeoutMs: number;
  readText(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<ReadonlyArray<{ name: string; isDirectory: boolean }>>;
  join(...parts: string[]): string;
  run(request: SpawnRequest, timeoutMs: number): Promise<RunResult>;
  emit(item: CheckItem): void;
  signal: AbortSignal;
}

const PYTEST_PROBE_MS = 30_000;

async function readOrNull(ports: CheckPorts, path: string): Promise<string | null> {
  try {
    return (await ports.exists(path)) ? await ports.readText(path) : null;
  } catch {
    return null;
  }
}

async function checkPythonVersion(ports: CheckPorts): Promise<void> {
  const root = ports.root;
  const expectation = expectedPython({
    pyproject: root ? await readOrNull(ports, ports.join(root, "pyproject.toml")) : null,
    pythonVersionFile: root ? await readOrNull(ports, ports.join(root, ".python-version")) : null,
    projectJsonVersion: ports.projectJsonVersion,
  });
  ports.emit(pythonVersionItem(expectation, ports.pythonVersion));
}

async function checkPaths(ports: CheckPorts): Promise<void> {
  ports.emit({ id: "paths", state: "running", title: CHECK_TITLES.paths });
  let source: string;
  try {
    source = await ports.readText(ports.file);
  } catch (err) {
    ports.emit({
      id: "paths",
      state: "warn",
      title: `File paths: could not read the file (${describe(err)})`,
    });
    return;
  }
  const ctx = { file: ports.file, cwdLabel: ports.cwdLabel, otherLabel: ports.otherLabel };
  const rows: CheckRow[] = [];
  for (const ref of scanPaths(source)) {
    if (ports.signal.aborted) return;
    const needsLookup = !isAbsolutePath(ref.path) && ref.use !== "write";
    const fromCwd = needsLookup ? await safeExists(ports, ports.join(ports.cwd, ref.path)) : false;
    const fromOther =
      needsLookup && ports.otherDir !== null
        ? await safeExists(ports, ports.join(ports.otherDir, ref.path))
        : null;
    rows.push(classifyPath(ref, { fromCwd, fromOther }, ctx));
  }
  ports.emit(pathsItem(rows));
}

async function safeExists(ports: CheckPorts, path: string): Promise<boolean> {
  try {
    return await ports.exists(path);
  } catch {
    return false;
  }
}

async function checkFreshRun(ports: CheckPorts): Promise<void> {
  if (!ports.python) {
    ports.emit({
      id: "fresh",
      state: "fail",
      title: "No Python Interpreter selected, so the file could not be run",
      action: { label: "Select Python Interpreter", command: "metamorphosis.open" },
    });
    return;
  }
  ports.emit({
    id: "fresh",
    state: "running",
    title: `${CHECK_TITLES.fresh}: running python -u ${baseName(ports.file)}`,
  });
  const result = await ports.run(
    { program: ports.python, args: ["-u", ports.file], cwd: ports.cwd },
    ports.timeoutMs,
  );
  ports.emit(
    freshRunItem(result, {
      file: ports.file,
      root: ports.root,
      timeoutSeconds: ports.timeoutMs / 1000,
    }),
  );
}

async function checkTests(ports: CheckPorts): Promise<void> {
  if (!ports.root) {
    ports.emit({
      id: "tests",
      state: "skip",
      title: "Tests: open the project folder (not just the file) to have tests found and run",
    });
    return;
  }
  if (!ports.python) {
    ports.emit({ id: "tests", state: "skip", title: "Tests: no Python Interpreter selected" });
    return;
  }
  let targets;
  try {
    targets = findTestTargets(await ports.listDir(ports.root));
  } catch (err) {
    ports.emit({
      id: "tests",
      state: "warn",
      title: `Tests: could not list the project (${describe(err)})`,
    });
    return;
  }
  const custom = ports.testCommand && ports.testCommand.length > 0 ? ports.testCommand : null;
  if (!custom && !hasTests(targets)) {
    ports.emit(testsItem({ command: null, code: null, output: "" }));
    return;
  }
  ports.emit({ id: "tests", state: "running", title: `${CHECK_TITLES.tests}: looking for pytest` });
  const hasPytest = custom
    ? false
    : (
        await ports.run(
          { program: ports.python, args: ["-c", "import pytest"], cwd: ports.root },
          PYTEST_PROBE_MS,
        )
      ).code === 0;
  if (ports.signal.aborted) return;
  const command = buildTestCommand({ python: ports.python, targets, hasPytest, custom });
  if (!command) return;
  ports.emit({ id: "tests", state: "running", title: `${CHECK_TITLES.tests}: ${command.label}` });
  const result = await ports.run(
    { program: command.program, args: command.args, cwd: ports.root },
    ports.timeoutMs,
  );
  ports.emit(
    testsItem({
      command,
      code: result.code,
      output: [result.stdout, result.stderr].filter((s) => s.length > 0).join("\n"),
      timedOut: result.timedOut,
      startFailure: result.startFailure,
    }),
  );
}

/** Run every check in order, stopping quietly when the signal aborts. */
export async function runChecks(ports: CheckPorts): Promise<void> {
  const steps = [checkPythonVersion, checkPaths, checkFreshRun, checkTests];
  for (const step of steps) {
    if (ports.signal.aborted) return;
    await step(ports);
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
