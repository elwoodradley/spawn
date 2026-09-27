import { describe, expect, it } from "vitest";

import {
  describeWorkingDirectory,
  normalizeProjectSettings,
  resolveWorkingDirectory,
} from "./project";

describe("normalizeProjectSettings", () => {
  it("keeps valid keys and unknown ones, drops invalid values", () => {
    const out = normalizeProjectSettings({
      workingDirectory: "project",
      pythonPath: "/v/bin/python",
      testCommand: ["python", "tester.py"],
      future: { keep: true },
    });
    expect(out.workingDirectory).toBe("project");
    expect(out.pythonPath).toBe("/v/bin/python");
    expect(out.testCommand).toEqual(["python", "tester.py"]);
    expect((out as Record<string, unknown>).future).toEqual({ keep: true });
    expect(normalizeProjectSettings({ workingDirectory: "elsewhere" })).toEqual({});
    expect(normalizeProjectSettings("junk")).toEqual({});
  });
});

describe("resolveWorkingDirectory", () => {
  const root = "/home/me/hw3";
  const file = "/home/me/hw3/puzzles/tester.py";

  it("uses the file's own folder in file mode", () => {
    expect(resolveWorkingDirectory(file, "file", root)).toBe("/home/me/hw3/puzzles");
  });

  it("uses the project root in project mode", () => {
    expect(resolveWorkingDirectory(file, "project", root)).toBe(root);
  });

  it("falls back to the file's folder without a project", () => {
    expect(resolveWorkingDirectory(file, "project", null)).toBe("/home/me/hw3/puzzles");
  });
});

describe("describeWorkingDirectory", () => {
  const root = "/home/me/hw3";
  it("shows a relative folder inside the project and the full path outside", () => {
    expect(describeWorkingDirectory("/home/me/hw3/puzzles", root)).toBe("puzzles/");
    expect(describeWorkingDirectory("/home/me/hw3", root)).toBe("hw3/");
    expect(describeWorkingDirectory("/tmp/other", root)).toBe("/tmp/other");
    expect(describeWorkingDirectory("/tmp/other", null)).toBe("/tmp/other");
  });
});
