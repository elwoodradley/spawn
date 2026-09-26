import { describe, expect, it } from "vitest";

import {
  buildMatcher,
  DEFAULT_SEARCH_OPTIONS,
  escapeRegex,
  isProbablyBinary,
  previewOf,
  searchText,
} from "./search";

const opts = DEFAULT_SEARCH_OPTIONS;

describe("buildMatcher", () => {
  it("is null for an empty query", () => {
    expect(buildMatcher("", opts)).toBeNull();
  });

  it("escapes plain text and ignores case by default", () => {
    const m = buildMatcher("a.b(", opts);
    expect(m && "re" in m && m.re.test("xA.B(y")).toBe(true);
    expect(m && "re" in m && m.re.test("aXb(")).toBe(false);
  });

  it("respects case and regex options", () => {
    const cs = buildMatcher("Loss", { ...opts, caseSensitive: true });
    expect(cs && "re" in cs && cs.re.test("loss")).toBe(false);
    const rx = buildMatcher("lo+ss", { ...opts, regex: true });
    expect(rx && "re" in rx && rx.re.test("looooss")).toBe(true);
  });

  it("whole word only matches standalone words", () => {
    const m = buildMatcher("loss", { ...opts, wholeWord: true });
    expect(m && "re" in m && m.re.test("train_loss = 1")).toBe(false);
    expect(m && "re" in m && m.re.test("loss: 1")).toBe(true);
  });

  it("reports a bad regex instead of throwing", () => {
    const m = buildMatcher("(", { ...opts, regex: true });
    expect(m && "error" in m).toBe(true);
  });
});

describe("searchText", () => {
  it("finds every match with line and column", () => {
    const re = buildMatcher("loss", opts);
    if (!re || !("re" in re)) throw new Error("matcher");
    const hits = searchText("x\nloss: 1 loss: 2\nno\nLOSS", re.re);
    expect(hits.map((h) => [h.line, h.col])).toEqual([
      [2, 0],
      [2, 8],
      [4, 0],
    ]);
    expect(hits[0]?.text).toBe("loss: 1 loss: 2");
  });

  it("caps matches and survives zero-width regexes", () => {
    const re = buildMatcher("^", { ...opts, regex: true });
    if (!re || !("re" in re)) throw new Error("matcher");
    expect(searchText("a\nb\nc", re.re, 2)).toHaveLength(2);
  });
});

describe("helpers", () => {
  it("escapeRegex neutralises metacharacters", () => {
    expect(new RegExp(escapeRegex("a+b?")).test("a+b?")).toBe(true);
  });

  it("isProbablyBinary spots a NUL in the head only", () => {
    expect(isProbablyBinary("abc\u0000def")).toBe(true);
    expect(isProbablyBinary("plain text")).toBe(false);
    expect(isProbablyBinary(`${"x".repeat(9000)}\u0000`)).toBe(false);
  });

  it("previewOf trims long lines around the hit", () => {
    const text = `${"a".repeat(100)}HIT${"b".repeat(100)}`;
    const p = previewOf({ line: 1, col: 100, text, start: 100, end: 103 }, 5);
    expect(p).toEqual({ before: "…aaaaa", hit: "HIT", after: "bbbbb…" });
  });
});
