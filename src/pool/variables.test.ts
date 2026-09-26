import { describe, expect, it } from "vitest";

import type { VariableInfo } from "./protocol";
import { changedNames, filterVariables, sortVariables, typeClass } from "./variables";

const v = (name: string, summary = "", type = "int"): VariableInfo => ({
  name,
  type,
  summary,
  shape: null,
  dtype: null,
  size: null,
});

describe("changedNames", () => {
  it("reports new names and changed summaries only", () => {
    const before = [v("a", "1"), v("b", "2")];
    const after = [v("a", "1"), v("b", "3"), v("c", "0")];
    expect(changedNames(before, after)).toEqual(["b", "c"]);
  });
});

describe("sortVariables", () => {
  it("puts recently changed first, newest change on top, then by name", () => {
    const list = [v("zeta"), v("alpha"), v("mid"), v("beta")];
    const changedAt = { mid: 200, zeta: 300, beta: 50 };
    expect(sortVariables(list, changedAt, 100).map((x) => x.name)).toEqual([
      "zeta",
      "mid",
      "alpha",
      "beta",
    ]);
  });
});

describe("filterVariables", () => {
  it("matches name, type or summary case-insensitively", () => {
    const list = [v("df", "DataFrame 400×5", "DataFrame"), v("x", "(4, 4) float64", "ndarray")];
    expect(filterVariables(list, "FLOAT").map((x) => x.name)).toEqual(["x"]);
    expect(filterVariables(list, "frame").map((x) => x.name)).toEqual(["df"]);
    expect(filterVariables(list, "")).toHaveLength(2);
  });
});

describe("typeClass", () => {
  it("buckets common types", () => {
    expect(typeClass("DataFrame")).toBe("is-table");
    expect(typeClass("Tensor")).toBe("is-array");
    expect(typeClass("float")).toBe("is-number");
    expect(typeClass("str")).toBe("is-string");
    expect(typeClass("function")).toBe("is-code");
    expect(typeClass("Thing")).toBe("is-other");
  });
});
