import { describe, expect, it } from "vitest";

import type { VariableInfo } from "../../pool/protocol";
import { clearInlineValues, inlineEntries, mergeEntries, recordExec } from "./store";

function v(name: string, summary: string): VariableInfo {
  return { name, type: "int", summary, shape: null, dtype: null, size: null, device: null };
}

describe("mergeEntries", () => {
  it("keeps only names the console knows", () => {
    const out = mergeEntries(
      [],
      { from: 1, to: 2 },
      [
        { line: 1, names: ["x"], text: "x = 1" },
        { line: 2, names: ["ghost"], text: "ghost = f()" },
      ],
      [v("x", "1")],
    );
    expect(out).toEqual([{ line: 1, names: ["x"], text: "x = 1", label: "1", title: "x: int 1" }]);
  });

  it("replaces the executed range and relabels the rest from current values", () => {
    const first = mergeEntries(
      [],
      { from: 1, to: 2 },
      [
        { line: 1, names: ["x"], text: "x = 1" },
        { line: 2, names: ["y"], text: "y = 2" },
      ],
      [v("x", "1"), v("y", "2")],
    );
    const second = mergeEntries(
      first,
      { from: 2, to: 2 },
      [{ line: 2, names: ["y"], text: "y = x + 10" }],
      [v("x", "5"), v("y", "15")],
    );
    expect(second.map((e) => [e.line, e.text, e.label])).toEqual([
      [1, "x = 1", "5"],
      [2, "y = x + 10", "15"],
    ]);
  });

  it("drops lines whose names are gone and sorts by line", () => {
    const out = mergeEntries(
      [
        { line: 9, names: ["z"], text: "z = 0", label: "0", title: "" },
        { line: 4, names: ["w"], text: "w = 0", label: "0", title: "" },
      ],
      { from: 20, to: 21 },
      [{ line: 20, names: ["q"], text: "q = 1" }],
      [v("w", "0"), v("q", "1")],
    );
    expect(out.map((e) => e.line)).toEqual([4, 20]);
  });
});

describe("the module store", () => {
  it("keeps values per path and clears them", () => {
    recordExec(
      "/a.py",
      { from: 1, to: 1 },
      [{ line: 1, names: ["x"], text: "x = 1" }],
      [v("x", "1")],
    );
    recordExec(
      "/b.py",
      { from: 1, to: 1 },
      [{ line: 1, names: ["x"], text: "x = 1" }],
      [v("x", "1")],
    );
    expect(inlineEntries("/a.py")).toHaveLength(1);
    expect(inlineEntries("/b.py")).toHaveLength(1);
    clearInlineValues("/a.py");
    expect(inlineEntries("/a.py")).toHaveLength(0);
    expect(inlineEntries("/b.py")).toHaveLength(1);
    clearInlineValues();
    expect(inlineEntries("/b.py")).toHaveLength(0);
  });
});
