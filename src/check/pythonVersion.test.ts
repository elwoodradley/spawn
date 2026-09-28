import { describe, expect, it } from "vitest";

import {
  expectedPython,
  parseVersion,
  pythonVersionItem,
  requiresPythonFrom,
  satisfies,
  specFromBare,
} from "./pythonVersion";

describe("parseVersion", () => {
  it("reads plain, prefixed and pyenv-style versions", () => {
    expect(parseVersion("3.12.3")).toEqual([3, 12, 3]);
    expect(parseVersion("Python 3.9.6")).toEqual([3, 9, 6]);
    expect(parseVersion("cpython@3.11")).toEqual([3, 11]);
    expect(parseVersion("none")).toBeNull();
  });
});

describe("satisfies", () => {
  it("handles every PEP 440 operator", () => {
    expect(satisfies("3.12.3", ">=3.11")).toBe(true);
    expect(satisfies("3.9.6", ">=3.11")).toBe(false);
    expect(satisfies("3.11.0", ">3.11")).toBe(false);
    expect(satisfies("3.11.1", ">3.11")).toBe(true);
    expect(satisfies("3.11.4", "==3.11.4")).toBe(true);
    expect(satisfies("3.11.5", "==3.11.4")).toBe(false);
    expect(satisfies("3.11.5", "==3.11.*")).toBe(true);
    expect(satisfies("3.12.0", "==3.11.*")).toBe(false);
    expect(satisfies("3.11.9", "~=3.11.4")).toBe(true);
    expect(satisfies("3.12.0", "~=3.11.4")).toBe(false);
    expect(satisfies("3.12.0", "~=3.11")).toBe(true);
    expect(satisfies("4.0.0", "~=3.11")).toBe(false);
    expect(satisfies("3.10.0", "<3.11")).toBe(true);
    expect(satisfies("3.11.0", "<=3.11")).toBe(true);
    expect(satisfies("3.9.6", "!=3.9.6")).toBe(false);
    expect(satisfies("3.9.7", "!=3.9.*")).toBe(false);
  });

  it("requires every comma-separated clause", () => {
    expect(satisfies("3.11.2", ">=3.10, <3.13")).toBe(true);
    expect(satisfies("3.13.0", ">=3.10,<3.13")).toBe(false);
    expect(satisfies("3.9.0", ">=3.8, !=3.9.*")).toBe(false);
  });

  it("is null for things it cannot read", () => {
    expect(satisfies("3.11", "latest")).toBeNull();
    expect(satisfies("?", ">=3.11")).toBeNull();
    expect(satisfies("3.11", "")).toBeNull();
    expect(satisfies("3.11", "~=3")).toBeNull();
  });
});

describe("expectedPython", () => {
  it("reads requires-python from pyproject first", () => {
    const pyproject = '[project]\nname = "hw"\nrequires-python = ">=3.11"\n';
    expect(requiresPythonFrom(pyproject)).toBe(">=3.11");
    expect(expectedPython({ pyproject, pythonVersionFile: "3.9" })).toEqual({
      spec: ">=3.11",
      display: ">=3.11",
      source: "pyproject.toml",
    });
  });

  it("turns a bare .python-version into a compatible-release spec", () => {
    expect(specFromBare("3.11")).toBe("~=3.11.0");
    expect(specFromBare("3.11.4")).toBe("~=3.11.4");
    expect(specFromBare("3")).toBe("==3.*");
    expect(specFromBare(">=3.10")).toBe(">=3.10");
    expect(specFromBare("")).toBeNull();
    expect(expectedPython({ pythonVersionFile: "# pinned\n3.11\n" })).toEqual({
      spec: "~=3.11.0",
      display: "3.11",
      source: ".python-version",
    });
  });

  it("falls back to project.json and then to nothing", () => {
    expect(expectedPython({ projectJsonVersion: ">=3.10" })?.source).toBe(".spawn/project.json");
    expect(expectedPython({})).toBeNull();
  });
});

describe("pythonVersionItem", () => {
  const expectation = { spec: ">=3.11", display: ">=3.11", source: "pyproject.toml" as const };

  it("is green on a match, red on a mismatch with a hint to pick an interpreter", () => {
    const ok = pythonVersionItem(expectation, "3.12.3");
    expect(ok.state).toBe("pass");
    expect(ok.title).toBe("Python 3.12.3 matches >=3.11 (pyproject.toml)");
    const bad = pythonVersionItem(expectation, "3.9.6");
    expect(bad.state).toBe("fail");
    expect(bad.title).toBe("Course expects Python >=3.11 but you are running 3.9.6");
    expect(bad.action?.command).toBe("metamorphosis.open");
  });

  it("is skipped without an expectation and yellow without a version", () => {
    expect(pythonVersionItem(null, "3.12.3").state).toBe("skip");
    expect(pythonVersionItem(expectation, null).state).toBe("warn");
    expect(pythonVersionItem({ ...expectation, spec: "latest" }, "3.12.3").state).toBe("warn");
  });
});
