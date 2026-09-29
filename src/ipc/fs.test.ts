import { describe, expect, it } from "vitest";

import { baseName, compareEntries, dirName, extension, joinPath, normalizePath } from "./fs";

describe("path helpers", () => {
  it("joins without doubling separators", () => {
    expect(joinPath("/home/toad/", "brood", "main.py")).toBe("/home/toad/brood/main.py");
    expect(joinPath("/home/toad", "/brood/")).toBe("/home/toad/brood");
  });

  it("collapses dot and parent segments so the file scope accepts the path", () => {
    expect(joinPath("/home/me/vision", "../README.md")).toBe("/home/me/README.md");
    expect(joinPath("/home/me/vision", "./data/x.csv")).toBe("/home/me/vision/data/x.csv");
    expect(normalizePath("/a/b/../../c", "/")).toBe("/c");
    expect(normalizePath("/a/../..", "/")).toBe("/");
    expect(normalizePath("../x", "/")).toBe("../x");
    expect(normalizePath("a/../../x", "/")).toBe("../x");
    expect(normalizePath("C:\\a\\..\\b", "\\")).toBe("C:\\b");
  });

  it("takes base and dir names on both separators", () => {
    expect(baseName("/a/b/c.py")).toBe("c.py");
    expect(baseName("C:\\a\\b\\c.py")).toBe("c.py");
    expect(dirName("/a/b/c.py")).toBe("/a/b");
    expect(dirName("/c.py")).toBe("/");
    expect(dirName("C:\\a\\c.py")).toBe("C:\\a");
  });

  it("extracts a lower-case extension, none for dotfiles", () => {
    expect(extension("train.PY")).toBe("py");
    expect(extension(".gitignore")).toBe("");
    expect(extension("README")).toBe("");
  });
});

describe("compareEntries", () => {
  it("puts folders first then sorts case-insensitively", () => {
    const entries = [
      { name: "b.py", path: "", isDirectory: false },
      { name: "Zeta", path: "", isDirectory: true },
      { name: "A.py", path: "", isDirectory: false },
      { name: "alpha", path: "", isDirectory: true },
    ];
    expect(entries.sort(compareEntries).map((e) => e.name)).toEqual([
      "alpha",
      "Zeta",
      "A.py",
      "b.py",
    ]);
  });
});
