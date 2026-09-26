import { describe, expect, it } from "vitest";

import {
  accuracy,
  cellIntensity,
  classRows,
  formatPct,
  indicesAsList,
  prefersLightText,
  sortClassRows,
} from "./matrix";

const perClass = [
  { precision: 0.9, recall: 0.5, f1: 0.64, support: 10 },
  { precision: null, recall: 0.8, f1: null, support: 5 },
  { precision: 0.7, recall: 0.9, f1: 0.79, support: 20 },
];

describe("classRows", () => {
  it("labels by index when the matrix has no labels", () => {
    expect(classRows(null, perClass).map((r) => r.label)).toEqual(["0", "1", "2"]);
    expect(classRows(["a", "b", "c"], perClass)[2]?.label).toBe("c");
  });
});

describe("sortClassRows", () => {
  it("sorts numerically with nulls last in both directions", () => {
    const rows = classRows(null, perClass);
    expect(sortClassRows(rows, "precision", "desc").map((r) => r.index)).toEqual([0, 2, 1]);
    expect(sortClassRows(rows, "precision", "asc").map((r) => r.index)).toEqual([2, 0, 1]);
    expect(sortClassRows(rows, "support", "asc").map((r) => r.index)).toEqual([1, 0, 2]);
  });

  it("sorts labels alphabetically", () => {
    const rows = classRows(["dog", "cat", "frog"], perClass);
    expect(sortClassRows(rows, "label", "asc").map((r) => r.label)).toEqual(["cat", "dog", "frog"]);
  });
});

describe("cell helpers", () => {
  it("scales intensity against the largest cell", () => {
    expect(cellIntensity(0, 10)).toBe(0);
    expect(cellIntensity(5, 10)).toBe(0.5);
    expect(cellIntensity(10, 10)).toBe(1);
  });

  it("picks light text on dark cells and dark text on light ones", () => {
    expect(prefersLightText([20, 24, 28])).toBe(true);
    expect(prefersLightText([182, 255, 59])).toBe(false);
  });

  it("formats percentages and index lists", () => {
    expect(formatPct(0.8567)).toBe("85.7%");
    expect(formatPct(null)).toBe("–");
    expect(indicesAsList([3, 17, 42])).toBe("[3, 17, 42]");
    expect(indicesAsList([])).toBe("[]");
  });

  it("computes accuracy from the diagonal", () => {
    expect(
      accuracy([
        [2, 1],
        [0, 3],
      ]),
    ).toBeCloseTo(5 / 6);
    expect(
      accuracy([
        [0, 0],
        [0, 0],
      ]),
    ).toBeNull();
  });
});
