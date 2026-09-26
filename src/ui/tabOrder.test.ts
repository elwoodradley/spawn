import { describe, expect, it } from "vitest";

import { mruAt, neighbourIndex, reconcileMru, removeMru, reorder, touchMru } from "./tabOrder";

describe("mru", () => {
  it("touch moves to the front without duplicates", () => {
    expect(touchMru(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(touchMru([], "x")).toEqual(["x"]);
    expect(touchMru(["a"], "a")).toEqual(["a"]);
  });

  it("remove drops the path", () => {
    expect(removeMru(["a", "b"], "a")).toEqual(["b"]);
  });

  it("reconcile drops closed tabs and appends new ones last", () => {
    expect(reconcileMru(["b", "a", "zombie"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("mruAt walks forwards and backwards with wrap", () => {
    const snap = ["cur", "prev", "older"];
    expect(mruAt(snap, 1)).toBe("prev");
    expect(mruAt(snap, 2)).toBe("older");
    expect(mruAt(snap, 3)).toBe("cur");
    expect(mruAt(snap, -1)).toBe("older");
    expect(mruAt([], 1)).toBeNull();
  });
});

describe("reorder", () => {
  it("moves an item to a new index", () => {
    expect(reorder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("is a copy when nothing moves", () => {
    const list = ["a", "b"];
    const out = reorder(list, 1, 1);
    expect(out).toEqual(list);
    expect(out).not.toBe(list);
    expect(reorder(list, 9, 0)).toEqual(list);
  });
});

describe("neighbourIndex", () => {
  it("wraps in both directions", () => {
    expect(neighbourIndex(3, 2, 1)).toBe(0);
    expect(neighbourIndex(3, 0, -1)).toBe(2);
    expect(neighbourIndex(0, 0, 1)).toBe(-1);
    expect(neighbourIndex(3, -1, 1)).toBe(1);
  });
});
