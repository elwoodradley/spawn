import { describe, expect, it } from "vitest";

import { alignCodeLines, assignedNames, findAssignments } from "./assignments";

const names = (code: string) => findAssignments(code).map((a) => [a.index, a.names]);

describe("assignedNames", () => {
  it("handles the simple forms", () => {
    expect(assignedNames("x = data[:, 2]")).toEqual(["x"]);
    expect(assignedNames("a, b = 1, 2")).toEqual(["a", "b"]);
    expect(assignedNames("(a, b) = pair")).toEqual(["a", "b"]);
    expect(assignedNames("[a, b] = pair")).toEqual(["a", "b"]);
    expect(assignedNames("first, *rest = items")).toEqual(["first", "rest"]);
    expect(assignedNames("count: int = 0")).toEqual(["count"]);
    expect(assignedNames("total += x")).toEqual(["total"]);
    expect(assignedNames("w @= m")).toEqual(["w"]);
    expect(assignedNames("n **= 2")).toEqual(["n"]);
    expect(assignedNames("a = b = np.zeros(3)")).toEqual(["a", "b"]);
    expect(assignedNames("for i, (a, b) in enumerate(pairs):")).toEqual(["i", "a", "b"]);
  });

  it("ignores comparisons, calls, attributes and subscripts", () => {
    expect(assignedNames("if x == 1:")).toEqual([]);
    expect(assignedNames("while n != 0:")).toEqual([]);
    expect(assignedNames("assert y <= 3")).toEqual([]);
    expect(assignedNames("print(a=1)")).toEqual([]);
    expect(assignedNames("self.x = 1")).toEqual([]);
    expect(assignedNames("d[k] = v")).toEqual([]);
    expect(assignedNames("import numpy as np")).toEqual([]);
    expect(assignedNames("with open(p) as f:")).toEqual([]);
  });

  it("does not mistake keyword arguments or lambdas for chained targets", () => {
    expect(assignedNames("y = f(a=1, b=2)")).toEqual(["y"]);
    expect(assignedNames("g = lambda k=1: k")).toEqual(["g"]);
    expect(assignedNames("z = x == y")).toEqual(["z"]);
  });
});

describe("findAssignments", () => {
  it("reports the line index and text of each assignment", () => {
    const code = "import numpy as np\nx = np.arange(4)\ny = x * 2";
    expect(findAssignments(code)).toEqual([
      { index: 1, names: ["x"], text: "x = np.arange(4)" },
      { index: 2, names: ["y"], text: "y = x * 2" },
    ]);
  });

  it("skips def and class bodies but keeps globals inside if/for/with", () => {
    const code = [
      "def train(model):",
      "    loss = 0",
      "    return loss",
      "class Net:",
      "    hidden = 64",
      "    def forward(self, x):",
      "        out = x",
      "if True:",
      "    flag = 1",
      "for epoch in range(3):",
      "    step = epoch",
      "result = train(None)",
    ].join("\n");
    expect(names(code)).toEqual([
      [8, ["flag"]],
      [9, ["epoch"]],
      [10, ["step"]],
      [11, ["result"]],
    ]);
  });

  it("skips continuation lines inside brackets", () => {
    const code = "model = Net(\n    hidden=64,\n    layers=2,\n)\nlr = 0.1";
    expect(names(code)).toEqual([
      [0, ["model"]],
      [4, ["lr"]],
    ]);
  });

  it("ignores assignments inside strings and comments", () => {
    const code = [
      'doc = """',
      "not = 1",
      '"""',
      "# skipped = 2",
      "s = 'a = b'",
      "t = 3  # c = 4",
    ].join("\n");
    expect(names(code)).toEqual([
      [0, ["doc"]],
      [4, ["s"]],
      [5, ["t"]],
    ]);
  });

  it("treats a bracket inside a string as text", () => {
    const code = "a = '('\nb = 2";
    expect(names(code)).toEqual([
      [0, ["a"]],
      [1, ["b"]],
    ]);
  });
});

describe("alignCodeLines", () => {
  it("runs in step from the start line", () => {
    expect(alignCodeLines(["a = 1", "b = 2"], ["# %%", "a = 1", "b = 2"], 2)).toEqual([2, 3]);
  });

  it("skips cell markers the joined code left out", () => {
    const doc = ["a = 1", "# %% two", "b = 2", "# %%", "c = 3"];
    expect(alignCodeLines(["a = 1", "b = 2", "c = 3"], doc, 1)).toEqual([1, 3, 5]);
  });

  it("maps a line edited during the run to null and stays in step", () => {
    expect(alignCodeLines(["a = 1", "b = 2", "c = 3"], ["a = 1", "b = 22", "c = 3"], 1)).toEqual([
      1,
      null,
      3,
    ]);
  });
});
