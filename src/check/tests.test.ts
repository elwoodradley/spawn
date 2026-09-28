import { describe, expect, it } from "vitest";

import { buildTestCommand, findTestTargets, hasTests, parseTestSummary, testsItem } from "./tests";

const entry = (name: string, isDirectory = false) => ({ name, isDirectory });

describe("findTestTargets", () => {
  it("recognises tests.py, test_*.py, *_test.py and a tests folder", () => {
    const targets = findTestTargets([
      entry("main.py"),
      entry("tests.py"),
      entry("test_model.py"),
      entry("data_test.py"),
      entry("contest.py"),
      entry("tests", true),
      entry("data", true),
    ]);
    expect(targets).toEqual({
      files: ["tests.py", "test_model.py", "data_test.py"],
      hasTestsDir: true,
    });
    expect(hasTests(findTestTargets([entry("main.py")]))).toBe(false);
  });
});

describe("buildTestCommand", () => {
  const python = "/v/bin/python";
  const files = { files: ["test_a.py"], hasTestsDir: false };

  it("prefers a custom command, then pytest, then unittest", () => {
    expect(
      buildTestCommand({
        python,
        targets: files,
        hasPytest: true,
        custom: ["python", "tester.py"],
      }),
    ).toEqual({
      program: "python",
      args: ["tester.py"],
      label: "python tester.py",
      runner: "custom",
    });
    expect(
      buildTestCommand({ python, targets: files, hasPytest: true, custom: null })?.args,
    ).toEqual(["-m", "pytest", "-q", "--color=no"]);
    expect(
      buildTestCommand({ python, targets: files, hasPytest: false, custom: null })?.args,
    ).toEqual(["-m", "unittest", "discover", "-p", "*test*.py"]);
  });

  it("points unittest at a bare tests folder and gives up without tests", () => {
    const dirOnly = { files: [], hasTestsDir: true };
    expect(
      buildTestCommand({ python, targets: dirOnly, hasPytest: false, custom: null })?.args,
    ).toEqual(["-m", "unittest", "discover", "-p", "*test*.py", "-s", "tests", "-t", "."]);
    expect(
      buildTestCommand({
        python,
        targets: { files: [], hasTestsDir: false },
        hasPytest: true,
        custom: [],
      }),
    ).toBeNull();
  });
});

describe("parseTestSummary", () => {
  it("reads pytest's summary line", () => {
    expect(
      parseTestSummary("....F\n=========== 4 passed, 1 failed in 0.12s ===========\n"),
    ).toEqual({
      passed: 4,
      failed: 1,
      errors: 0,
      skipped: 0,
      total: 5,
    });
    expect(parseTestSummary("\x1b[32m======= 12 passed in 1.00s =======\x1b[0m")?.total).toBe(12);
    expect(parseTestSummary("== 1 error in 0.1s ==")).toEqual({
      passed: 0,
      failed: 0,
      errors: 1,
      skipped: 0,
      total: 1,
    });
  });

  it("reads unittest's Ran N tests plus OK or FAILED", () => {
    expect(parseTestSummary("...\nRan 3 tests in 0.001s\n\nOK\n")).toEqual({
      passed: 3,
      failed: 0,
      errors: 0,
      skipped: 0,
      total: 3,
    });
    expect(parseTestSummary("Ran 12 tests in 0.5s\n\nFAILED (failures=2, errors=1)")).toEqual({
      passed: 9,
      failed: 2,
      errors: 1,
      skipped: 0,
      total: 12,
    });
    expect(parseTestSummary("Ran 1 test in 0.0s\n\nOK (skipped=1)")?.passed).toBe(0);
    expect(parseTestSummary("nothing here")).toBeNull();
  });
});

describe("testsItem", () => {
  const command = {
    program: "p",
    args: [],
    label: "python -m pytest -q",
    runner: "pytest" as const,
  };

  it("counts passes and failures in plain words", () => {
    expect(testsItem({ command: null, code: null, output: "" }).state).toBe("skip");
    const ok = testsItem({ command, code: 0, output: "= 12 passed in 0.3s =" });
    expect(ok.state).toBe("pass");
    expect(ok.title).toBe("12 tests passed");
    const bad = testsItem({ command, code: 1, output: "= 10 passed, 2 failed in 0.3s =" });
    expect(bad.state).toBe("fail");
    expect(bad.title).toBe("2 of 12 tests failed");
    expect(bad.detail).toContain("2 failed");
  });

  it("handles a custom command by exit code, timeouts and start failures", () => {
    const custom = { ...command, runner: "custom" as const, label: "python tester.py" };
    expect(testsItem({ command: custom, code: 0, output: "all good" }).title).toBe("Tests passed");
    expect(testsItem({ command: custom, code: 2, output: "" }).title).toBe(
      "Tests failed (exit code 2)",
    );
    expect(testsItem({ command, code: null, output: "", timedOut: true }).state).toBe("warn");
    expect(testsItem({ command, code: null, output: "", startFailure: "no such file" }).title).toBe(
      "Tests could not start: no such file",
    );
    expect(testsItem({ command, code: 5, output: "= no tests ran in 0.01s =" }).state).toBe("fail");
  });
});
