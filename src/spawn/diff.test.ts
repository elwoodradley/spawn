import { describe, expect, it } from "vitest";

import { collapseContext, diffLines, diffStats, MAX_DIFF_LINES, splitLines } from "./diff";

const kinds = (a: string, b: string) => diffLines(a, b).ops.map((o) => `${o.kind}:${o.text}`);

describe("splitLines", () => {
  it("drops the trailing newline and CR", () => {
    expect(splitLines("a\r\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("diffLines", () => {
  it("reports identical text as all same", () => {
    const r = diffLines("a\nb\n", "a\nb\n");
    expect(r.exact).toBe(true);
    expect(r.ops.every((o) => o.kind === "same")).toBe(true);
    expect(r.ops.map((o) => [o.a, o.b])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("finds a one-line change with line numbers on both sides", () => {
    const r = diffLines("import x\nlr = 0.01\nrun()\n", "import x\nlr = 0.1\nrun()\n");
    expect(r.ops.map((o) => o.kind)).toEqual(["same", "del", "add", "same"]);
    expect(r.ops[1]).toMatchObject({ text: "lr = 0.01", a: 2, b: null });
    expect(r.ops[2]).toMatchObject({ text: "lr = 0.1", a: null, b: 2 });
    expect(r.ops[3]).toMatchObject({ a: 3, b: 3 });
  });

  it("finds insertions and deletions in the middle", () => {
    expect(kinds("a\nb\nc", "a\nc")).toEqual(["same:a", "del:b", "same:c"]);
    expect(kinds("a\nc", "a\nb\nc")).toEqual(["same:a", "add:b", "same:c"]);
  });

  it("produces a minimal script for the classic Myers example", () => {
    const r = diffLines("A\nB\nC\nA\nB\nB\nA", "C\nB\nA\nB\nA\nC");
    const { added, removed } = diffStats(r.ops);
    expect(added + removed).toBe(5);
    // Replaying the script reproduces both sides.
    const left = r.ops.filter((o) => o.kind !== "add").map((o) => o.text);
    const right = r.ops.filter((o) => o.kind !== "del").map((o) => o.text);
    expect(left).toEqual(["A", "B", "C", "A", "B", "B", "A"]);
    expect(right).toEqual(["C", "B", "A", "B", "A", "C"]);
  });

  it("handles empty sides", () => {
    expect(kinds("", "a\nb")).toEqual(["add:a", "add:b"]);
    expect(kinds("a\nb", "")).toEqual(["del:a", "del:b"]);
    expect(diffLines("", "").ops).toEqual([]);
  });

  it("stays exact on a long file with a small edit", () => {
    const lines = Array.from({ length: 30_000 }, (_, i) => `line ${i}`);
    const edited = [...lines];
    edited[15_000] = "changed";
    const r = diffLines(lines.join("\n"), edited.join("\n"));
    expect(r.exact).toBe(true);
    expect(diffStats(r.ops)).toEqual({ added: 1, removed: 1 });
  });

  it("falls back to a whole swap past the size guard", () => {
    const a = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `b${i}`).join("\n");
    const r = diffLines(a, b);
    expect(r.exact).toBe(false);
    expect(diffStats(r.ops)).toEqual({ added: MAX_DIFF_LINES, removed: MAX_DIFF_LINES });
  });

  it("gives up on an edit script longer than the cap without hanging", () => {
    const a = Array.from({ length: 3_000 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 3_000 }, (_, i) => `b${i}`).join("\n");
    const started = Date.now();
    const r = diffLines(a, b);
    expect(r.exact).toBe(false);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});

describe("collapseContext", () => {
  it("keeps three lines around a change and folds the rest", () => {
    const a = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const b = [...a];
    b[10] = "x";
    const chunks = collapseContext(diffLines(a.join("\n"), b.join("\n")).ops);
    expect(chunks.map((c) => `${c.kind}:${c.ops.length}`)).toEqual(["skip:7", "lines:8", "skip:6"]);
  });

  it("merges the context of nearby changes", () => {
    const a = Array.from({ length: 10 }, (_, i) => `l${i}`);
    const b = [...a];
    b[2] = "x";
    b[6] = "y";
    const chunks = collapseContext(diffLines(a.join("\n"), b.join("\n")).ops);
    expect(chunks.map((c) => c.kind)).toEqual(["lines"]);
  });
});
