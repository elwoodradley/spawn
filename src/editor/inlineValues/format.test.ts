import { describe, expect, it } from "vitest";

import type { VariableInfo } from "../../pool/protocol";
import { inlineLabel, lineLabel, lineTitle, shapeText } from "./format";

function v(partial: Partial<VariableInfo> & { name: string; type: string }): VariableInfo {
  return { summary: "", shape: null, dtype: null, size: null, device: null, ...partial };
}

describe("inlineLabel", () => {
  it("shows shape and dtype for arrays, with the device for tensors", () => {
    expect(inlineLabel(v({ name: "x", type: "ndarray", shape: [400], dtype: "float64" }))).toBe(
      "(400,) float64",
    );
    expect(
      inlineLabel(
        v({ name: "t", type: "Tensor", shape: [32, 3, 28, 28], dtype: "float32", device: "cuda" }),
      ),
    ).toBe("(32, 3, 28, 28) float32 cuda");
  });

  it("shows the number for a 0-d array", () => {
    expect(
      inlineLabel(
        v({ name: "s", type: "float64", shape: [], dtype: "float64", summary: "2.5 float64" }),
      ),
    ).toBe("2.5 float64");
  });

  it("shows rows×cols for a DataFrame", () => {
    expect(
      inlineLabel(
        v({ name: "df", type: "DataFrame", shape: [400, 5], summary: "DataFrame 400×5" }),
      ),
    ).toBe("400×5");
  });

  it("shows values for scalars and lengths for collections", () => {
    expect(inlineLabel(v({ name: "n", type: "int", summary: "7" }))).toBe("7");
    expect(inlineLabel(v({ name: "ok", type: "bool", summary: "True" }))).toBe("True");
    expect(inlineLabel(v({ name: "xs", type: "list", summary: "list[400]" }))).toBe("list[400]");
    expect(inlineLabel(v({ name: "cfg", type: "dict", summary: "dict[3]" }))).toBe("dict[3]");
  });

  it("shortens long strings and keeps the closing quote", () => {
    const long = `'${"a".repeat(70)}'`;
    expect(inlineLabel(v({ name: "s", type: "str", summary: "'hi'" }))).toBe("'hi'");
    const label = inlineLabel(v({ name: "s", type: "str", summary: long }));
    expect(label.length).toBeLessThanOrEqual(40);
    expect(label.endsWith("…'")).toBe(true);
  });

  it("shows the class name and device for a model", () => {
    expect(
      inlineLabel(v({ name: "m", type: "Net", summary: "Net · 1,234 params", device: "cpu" })),
    ).toBe("Net · 1,234 params cpu");
    expect(inlineLabel(v({ name: "o", type: "Thing", summary: "a\nb" }))).toBe("Thing");
  });
});

describe("lineLabel and lineTitle", () => {
  const byName = new Map<string, VariableInfo>([
    ["a", v({ name: "a", type: "int", summary: "1" })],
    ["b", v({ name: "b", type: "ndarray", shape: [3], dtype: "int64", summary: "(3,) int64" })],
  ]);

  it("labels one name plainly and several by name", () => {
    expect(lineLabel(["a"], byName)).toBe("1");
    expect(lineLabel(["a", "b"], byName)).toBe("a: 1  b: (3,) int64");
    expect(lineLabel(["a", "missing"], byName)).toBe("1");
  });

  it("puts every known name with its full summary in the title", () => {
    expect(lineTitle(["a", "b", "missing"], byName)).toBe("a: int 1\nb: ndarray (3,) int64");
  });

  it("prints shapes like Python", () => {
    expect(shapeText([])).toBe("()");
    expect(shapeText([4])).toBe("(4,)");
    expect(shapeText([2, 3])).toBe("(2, 3)");
  });
});
