import { describe, expect, it } from "vitest";

import { rankFiles, relativeTo } from "./quickOpen";

const root = "/home/toad/brood";
const files = [
  `${root}/train.py`,
  `${root}/data/loader.py`,
  `${root}/models/transformer.py`,
  `${root}/README.md`,
  `${root}/tests/test_train.py`,
];

describe("relativeTo", () => {
  it("strips the root and normalises separators", () => {
    expect(relativeTo(root, `${root}/a/b.py`)).toBe("a/b.py");
    expect(relativeTo("C:\\brood", "C:\\brood\\a\\b.py")).toBe("a/b.py");
    expect(relativeTo(root, "/elsewhere/x.py")).toBe("elsewhere/x.py");
  });
});

describe("rankFiles", () => {
  it("puts recents first for an empty query, then the rest alphabetically", () => {
    const ranked = rankFiles(files, root, "", [`${root}/models/transformer.py`, "/gone.py"]);
    expect(ranked.map((r) => r.rel)).toEqual([
      "models/transformer.py",
      "data/loader.py",
      "README.md",
      "tests/test_train.py",
      "train.py",
    ]);
  });

  it("prefers file-name matches over path matches", () => {
    const ranked = rankFiles(files, root, "train", []);
    expect(ranked[0]?.rel).toBe("train.py");
    expect(ranked.map((r) => r.rel)).toContain("tests/test_train.py");
  });

  it("matches on directory names too, after name hits", () => {
    const ranked = rankFiles(files, root, "models", []);
    expect(ranked.map((r) => r.rel)).toEqual(["models/transformer.py"]);
  });

  it("fuzzy matches abbreviations and drops non-matches", () => {
    const ranked = rankFiles(files, root, "trfm", []);
    expect(ranked.map((r) => r.rel)).toEqual(["models/transformer.py"]);
    expect(rankFiles(files, root, "zzz", [])).toEqual([]);
  });

  it("honours the limit", () => {
    expect(rankFiles(files, root, "", [], 2)).toHaveLength(2);
  });
});
