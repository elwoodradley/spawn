import { describe, expect, it } from "vitest";

import { normalize, parseCssColor, previewRange, rampColor } from "./heatmap";
import { compareCells, formatCell, sortedOrder, visibleWindow } from "./table";

describe("visibleWindow", () => {
  it("renders the rows in view plus overscan and pads the rest", () => {
    const w = visibleWindow(220, 22, 280, 1000, 5);
    expect(w.start).toBe(5);
    expect(w.end).toBe(10 + 13 + 5);
    expect(w.topPad).toBe(5 * 22);
    expect(w.bottomPad).toBe((1000 - w.end) * 22);
  });

  it("clamps at both ends", () => {
    expect(visibleWindow(0, 22, 280, 3)).toEqual({ start: 0, end: 3, topPad: 0, bottomPad: 0 });
    expect(visibleWindow(0, 22, 280, 0).end).toBe(0);
    const tail = visibleWindow(99_999, 22, 280, 100);
    expect(tail.end).toBe(100);
    expect(tail.bottomPad).toBe(0);
  });
});

describe("cells", () => {
  it("sorts numbers numerically and nulls last either way", () => {
    const rows = [[3], [null], [1], ["b"], [2]];
    expect(sortedOrder(rows, 0, "asc")).toEqual([2, 4, 0, 3, 1]);
    expect(sortedOrder(rows, 0, "desc")).toEqual([3, 0, 4, 2, 1]);
    expect(compareCells(true, false)).toBeGreaterThan(0);
  });

  it("formats compactly", () => {
    expect(formatCell(null)).toBe("∅");
    expect(formatCell(0.123456)).toBe("0.1235");
    expect(formatCell(3)).toBe("3");
    expect(formatCell(1e-7)).toBe("1.000e-7");
    expect(formatCell(true)).toBe("True");
    expect(formatCell("x")).toBe("x");
  });
});

describe("heatmap colours", () => {
  it("parses hex and rgb forms", () => {
    expect(parseCssColor("#0c1012")).toEqual([12, 16, 18]);
    expect(parseCssColor("#abc")).toEqual([170, 187, 204]);
    expect(parseCssColor(" rgba(111, 179, 210, 0.25) ")).toEqual([111, 179, 210]);
    expect(parseCssColor("tomato")).toBeNull();
  });

  it("ramps one hue from low to high and clamps", () => {
    expect(rampColor(0, [0, 0, 0], [100, 200, 50])).toEqual([0, 0, 0]);
    expect(rampColor(0.5, [0, 0, 0], [100, 200, 50])).toEqual([50, 100, 25]);
    expect(rampColor(2, [0, 0, 0], [100, 200, 50])).toEqual([100, 200, 50]);
    expect(rampColor(NaN, [0, 0, 0], [100, 200, 50])).toEqual([0, 0, 0]);
  });

  it("normalises within the preview range, ignoring NaN", () => {
    expect(
      previewRange([
        [1, NaN],
        [3, 2],
      ]),
    ).toEqual([1, 3]);
    expect(previewRange([[NaN]])).toBeNull();
    expect(normalize(2, 1, 3)).toBe(0.5);
    expect(normalize(5, 5, 5)).toBe(0.5);
  });
});
