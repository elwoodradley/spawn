import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, merge, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("returns defaults for nothing", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values and fills the rest", () => {
    const s = normalizeSettings({ ui: { zoom: 1.25 }, editor: { tabSize: 2 } });
    expect(s.ui.zoom).toBe(1.25);
    expect(s.ui.fontUi).toBeNull();
    expect(s.editor.tabSize).toBe(2);
    expect(s.editor.wordWrap).toBe(false);
    expect(s.spawn.notifyWhenDone).toBe(true);
    expect(s.console.datasetChecks).toBe(true);
  });

  it("salvages good sections when one section is broken", () => {
    const s = normalizeSettings({ ui: { zoom: "big" }, editor: { tabSize: 8 } });
    expect(s.ui).toEqual(DEFAULT_SETTINGS.ui);
    expect(s.editor.tabSize).toBe(8);
  });

  it("rejects an oversize run pattern name into defaults for that section", () => {
    const s = normalizeSettings({ run: { patterns: [{ name: "x".repeat(40), regex: "(\\d+)" }] } });
    expect(s.run.patterns).toEqual([]);
  });
});

describe("merge", () => {
  it("deep merges objects and replaces arrays and nulls", () => {
    const base = { a: { b: 1, c: 2 }, list: [1, 2], n: 5 as number | null };
    const out = merge(base, { a: { c: 3 }, list: [9], n: null });
    expect(out).toEqual({ a: { b: 1, c: 3 }, list: [9], n: null });
    expect(base.a.c).toBe(2);
  });

  it("ignores undefined patch values", () => {
    expect(merge({ a: 1, b: 2 }, { a: undefined })).toEqual({ a: 1, b: 2 });
  });
});
