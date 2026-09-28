import { describe, expect, it } from "vitest";

import type { VariableInfo } from "../pool/protocol";
import { DatasetTracker, isDataset, signatureOf } from "./tracker";

const frame = (name: string, rows = 400, cols = 5, size: number | null = null): VariableInfo => ({
  name,
  type: "DataFrame",
  summary: `DataFrame ${rows}×${cols}`,
  shape: [rows, cols],
  dtype: null,
  size,
});

const array = (name: string, shape: number[], size = 0): VariableInfo => ({
  name,
  type: "ndarray",
  summary: `(${shape.join(", ")}) float64`,
  shape,
  dtype: "float64",
  size,
});

const scalar: VariableInfo = {
  name: "n",
  type: "int",
  summary: "7",
  shape: null,
  dtype: null,
  size: null,
};

describe("isDataset", () => {
  it("accepts DataFrames and 2-D arrays with enough rows", () => {
    expect(isDataset(frame("df"))).toBe(true);
    expect(isDataset(frame("one", 100, 1))).toBe(true);
    expect(isDataset(array("X", [100, 4]))).toBe(true);
  });

  it("skips small, 1-D, 3-D and non-array values", () => {
    expect(isDataset(frame("tiny", 19, 3))).toBe(false);
    expect(isDataset(array("small", [10, 4]))).toBe(false);
    expect(isDataset(array("vector", [400]))).toBe(false);
    expect(isDataset(array("column", [400, 1]))).toBe(false);
    expect(isDataset(array("images", [8, 3, 32, 32]))).toBe(false);
    expect(isDataset(scalar)).toBe(false);
    expect(isDataset({ ...array("t", [400, 4]), type: "Tensor" })).toBe(false);
  });
});

describe("DatasetTracker.plan", () => {
  it("checks a new dataset once and not again while it is unchanged", () => {
    const t = new DatasetTracker();
    expect(t.plan([frame("df"), scalar])).toEqual(["df"]);
    expect(t.plan([frame("df"), scalar])).toEqual([]);
  });

  it("checks again when shape or size changes, not when only the summary does", () => {
    const t = new DatasetTracker();
    t.plan([frame("df", 400, 5, 16_000)]);
    expect(t.plan([frame("df", 400, 4, 16_000)])).toEqual(["df"]);
    expect(t.plan([frame("df", 400, 4, 12_800)])).toEqual(["df"]);
    expect(t.plan([{ ...frame("df", 400, 4, 12_800), summary: "other" }])).toEqual([]);
    expect(signatureOf(frame("a", 2, 2, 8))).toBe(signatureOf(frame("b", 2, 2, 8)));
  });

  it("forgets a name that disappears, so re-creating it is checked", () => {
    const t = new DatasetTracker();
    t.plan([frame("df")]);
    t.plan([]);
    expect(t.plan([frame("df")])).toEqual(["df"]);
  });

  it("caps the checks per exec but remembers every dataset it saw", () => {
    const t = new DatasetTracker();
    const many = ["a", "b", "c", "d", "e"].map((n) => frame(n));
    expect(t.plan(many)).toEqual(["a", "b", "c"]);
    expect(t.plan(many)).toEqual([]);
  });

  it("never plans a dismissed variable, even after it changes", () => {
    const t = new DatasetTracker();
    t.plan([frame("df")]);
    t.dismiss("df");
    expect(t.isDismissed("df")).toBe(true);
    expect(t.plan([frame("df", 999, 9)])).toEqual([]);
    expect(t.plan([frame("df", 999, 9), array("X", [400, 3])])).toEqual(["X"]);
  });

  it("reset clears both memory and dismissals", () => {
    const t = new DatasetTracker();
    t.plan([frame("df")]);
    t.dismiss("df");
    t.reset();
    expect(t.plan([frame("df")])).toEqual(["df"]);
  });
});
