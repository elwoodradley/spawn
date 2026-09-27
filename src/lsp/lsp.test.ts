import { describe, expect, it } from "vitest";

import { ESSENTIAL_RULES, filterDiagnostics, keepDiagnostic, pyrightSettings } from "./diagnostics";
import { pathToUri, uriToPath } from "./uri";

describe("file URIs", () => {
  it("round-trips POSIX paths with spaces", () => {
    const p = "/home/me/my project/main.py";
    expect(pathToUri(p)).toBe("file:///home/me/my%20project/main.py");
    expect(uriToPath(pathToUri(p))).toBe(p);
  });

  it("handles Windows drive paths", () => {
    expect(pathToUri("C:\\Users\\me\\a.py")).toBe("file:///C:/Users/me/a.py");
    expect(uriToPath("file:///C:/Users/me/a.py")).toBe("C:/Users/me/a.py");
  });
});

describe("diagnostic levels", () => {
  const undefinedVar = {
    severity: 1,
    code: "reportUndefinedVariable",
    message: "x is not defined",
  };
  const syntax = { severity: 1, message: "Expected expression" };
  const unusedImport = { severity: 4, code: "reportUnusedImport", tags: [1], message: "unused" };
  const unknownType = { severity: 2, code: "reportUnknownMemberType", message: "unknown" };

  it("essential keeps syntax errors and clear mistakes, drops noise", () => {
    expect(keepDiagnostic("essential", undefinedVar)).toBe(true);
    expect(keepDiagnostic("essential", syntax)).toBe(true);
    expect(keepDiagnostic("essential", unusedImport)).toBe(false);
    expect(keepDiagnostic("essential", unknownType)).toBe(false);
  });

  it("standard keeps everything but hints and unnecessary-code tags", () => {
    expect(keepDiagnostic("standard", unknownType)).toBe(true);
    expect(keepDiagnostic("standard", unusedImport)).toBe(false);
  });

  it("strict keeps all", () => {
    expect(
      filterDiagnostics("strict", [undefinedVar, syntax, unusedImport, unknownType]),
    ).toHaveLength(4);
  });

  it("names real pyright rules", () => {
    expect(ESSENTIAL_RULES.has("reportMissingImports")).toBe(true);
  });

  it("maps levels to pyright modes and carries the interpreter", () => {
    const s = pyrightSettings("essential", "/v/bin/python");
    expect(s.python.pythonPath).toBe("/v/bin/python");
    expect(s.python.analysis.typeCheckingMode).toBe("basic");
    expect(pyrightSettings("strict", null).python.analysis.typeCheckingMode).toBe("strict");
    expect("pythonPath" in pyrightSettings("strict", null).python).toBe(false);
  });
});
