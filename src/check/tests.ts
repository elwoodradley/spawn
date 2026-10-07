/**
 * Check 4: run the project's tests, if it has any.
 *
 * `tests.py`, `test_*.py`, `*_test.py` or a `tests/` folder at the project
 * root count. pytest runs them when the interpreter can import it, else
 * `python -m unittest discover`. A `testCommand` in `.spawn/project.json`
 * replaces both. The summary line is parsed into "12 tests passed" or
 * "2 of 12 tests failed"; the raw output goes in the details block.
 */
import type { CheckItem } from "./model";
import { plural } from "./model";

export interface TestTargets {
  /** Root-level test files, by name. */
  files: string[];
  hasTestsDir: boolean;
}

export interface TestCommand {
  program: string;
  args: string[];
  /** Shown to the student. */
  label: string;
  runner: "pytest" | "unittest" | "custom";
}

export interface TestSummary {
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  total: number;
}

const TEST_FILE = /^(tests\.py|test_.*\.py|.*_test\.py)$/i;

export function findTestTargets(
  entries: ReadonlyArray<{ name: string; isDirectory: boolean }>,
): TestTargets {
  const files = entries.filter((e) => !e.isDirectory && TEST_FILE.test(e.name)).map((e) => e.name);
  const hasTestsDir = entries.some((e) => e.isDirectory && e.name.toLowerCase() === "tests");
  return { files, hasTestsDir };
}

export function hasTests(targets: TestTargets): boolean {
  return targets.files.length > 0 || targets.hasTestsDir;
}

export function buildTestCommand(input: {
  python: string;
  targets: TestTargets;
  hasPytest: boolean;
  custom: readonly string[] | null;
}): TestCommand | null {
  const [head, ...rest] = input.custom ?? [];
  if (head)
    return { program: head, args: rest, label: [head, ...rest].join(" "), runner: "custom" };
  if (!hasTests(input.targets)) return null;
  if (input.hasPytest) {
    return {
      program: input.python,
      args: ["-m", "pytest", "-q", "--color=no"],
      label: "python -m pytest -q",
      runner: "pytest",
    };
  }
  // unittest's discover pattern must be one glob; `*test*.py` catches
  // tests.py, test_x.py and x_test.py. A bare tests/ folder needs -s.
  const args = ["-m", "unittest", "discover", "-p", "*test*.py"];
  if (input.targets.files.length === 0 && input.targets.hasTestsDir) {
    args.push("-s", "tests", "-t", ".");
  }
  return { program: input.python, args, label: `python ${args.join(" ")}`, runner: "unittest" };
}

/** pytest and unittest both exit with this when no test was collected. */
const NO_TESTS_EXIT = 5;

/** pytest's `1 failed, 3 passed in 0.2s` or unittest's `Ran 4 tests` + `OK`/`FAILED (...)`. */
export function parseTestSummary(output: string): TestSummary | null {
  const text = output.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
  // `-q` (what the check runs) prints the line bare; without it, inside `===`.
  const pytest = /^=* ?((?:\d+ [a-z]+|no tests ran)(?:, \d+ [a-z]+)*) in [\d.]+s\b/m.exec(
    text,
  )?.[1];
  if (pytest) {
    const count = (word: string) => Number(new RegExp(`(\\d+) ${word}`).exec(pytest)?.[1] ?? 0);
    const passed = count("passed");
    const failed = count("failed");
    const errors = count("error");
    const skipped = count("skipped");
    return { passed, failed, errors, skipped, total: passed + failed + errors + skipped };
  }
  const ran = /^Ran (\d+) tests? in/m.exec(text);
  if (ran) {
    const total = Number(ran[1]);
    const failed = Number(/failures=(\d+)/.exec(text)?.[1] ?? 0);
    const errors = Number(/errors=(\d+)/.exec(text)?.[1] ?? 0);
    const skipped = Number(/skipped=(\d+)/.exec(text)?.[1] ?? 0);
    return { passed: total - failed - errors - skipped, failed, errors, skipped, total };
  }
  return null;
}

export function testsItem(input: {
  command: TestCommand | null;
  code: number | null;
  output: string;
  timedOut?: boolean;
  startFailure?: string | null;
}): CheckItem {
  const { command } = input;
  if (!command) {
    return {
      id: "tests",
      state: "skip",
      title: "Tests: the project has no tests.py, test_*.py or tests/ folder",
    };
  }
  const detail = input.output.trim().length > 0 ? input.output : undefined;
  if (input.startFailure) {
    return {
      id: "tests",
      state: "fail",
      title: `Tests could not start: ${input.startFailure}`,
      hint: `Command: ${command.label}`,
      detail,
    };
  }
  if (input.timedOut) {
    return {
      id: "tests",
      state: "warn",
      title: "Tests were still running after the time limit and were stopped",
      hint: `Command: ${command.label}`,
      detail,
    };
  }
  const summary = parseTestSummary(input.output);
  const broken = summary ? summary.failed + summary.errors : 0;
  if (input.code === 0 && (!summary || broken === 0)) {
    const title = summary
      ? summary.total === 0
        ? "No tests were found to run"
        : `${plural(summary.total, "test")} passed`
      : "Tests passed";
    return {
      id: "tests",
      state: summary?.total === 0 ? "warn" : "pass",
      title,
      hint: `Command: ${command.label}`,
      detail,
    };
  }
  if (summary && summary.total > 0) {
    return {
      id: "tests",
      state: "fail",
      title: `${broken} of ${plural(summary.total, "test")} failed`,
      hint: `Command: ${command.label}. Open the details to see which ones.`,
      detail,
    };
  }
  // Both runners exit 5 when nothing was collected: files matched the test
  // naming but held no test cases. Worth a look, not a failure.
  if (input.code === NO_TESTS_EXIT && command.runner !== "custom") {
    return {
      id: "tests",
      state: "warn",
      title: "No tests were found to run",
      hint: `${command.label} matched files by name but found no test cases in them.`,
      detail,
    };
  }
  return {
    id: "tests",
    state: "fail",
    title:
      input.code === null
        ? "Tests were stopped before they finished"
        : `Tests failed (exit code ${input.code})`,
    hint: `Command: ${command.label}. Open the details to see the output.`,
    detail,
  };
}
