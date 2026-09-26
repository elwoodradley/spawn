import { describe, expect, it } from "vitest";

import {
  cellAt,
  cellCode,
  cellsThrough,
  cellTitle,
  docFromString,
  isCellMarker,
  nextCell,
  parseCells,
} from "./cells";

describe("isCellMarker", () => {
  it("accepts the common marker spellings", () => {
    for (const line of [
      "# %%",
      "#%%",
      "  # %%",
      "# %% load data",
      "#%%title",
      "# In[3]:",
      "# In[ ]:",
    ]) {
      expect(isCellMarker(line), line).toBe(true);
    }
  });

  it("rejects ordinary comments and code", () => {
    for (const line of ["# %", "x = 1  # %%", "## %%", "print('# %%')", "# In[3"]) {
      expect(isCellMarker(line), line).toBe(false);
    }
  });

  it("extracts a title", () => {
    expect(cellTitle("# %% train the model ")).toBe("train the model");
    expect(cellTitle("# %%")).toBeNull();
    expect(cellTitle("# In[4]:")).toBeNull();
  });
});

describe("parseCells", () => {
  it("treats a file with no markers as one cell", () => {
    const cells = parseCells("a = 1\nb = 2\n");
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({
      index: 0,
      fromLine: 1,
      toLine: 3,
      title: null,
      markerLine: null,
    });
  });

  it("keeps leading code before the first marker as cell 0", () => {
    const cells = parseCells("import os\n# %% one\nx = 1\n# %% two\ny = 2");
    expect(cells.map((c) => [c.fromLine, c.toLine, c.title, c.markerLine])).toEqual([
      [1, 1, null, null],
      [2, 3, "one", 2],
      [4, 5, "two", 4],
    ]);
  });

  it("drops a blank leading region", () => {
    const cells = parseCells("\n\n# %% only\nx = 1");
    expect(cells).toHaveLength(1);
    expect(cells[0]?.markerLine).toBe(3);
  });

  it("gives correct offsets", () => {
    const text = "# %% a\nx = 1\n# %% b\ny = 2\n";
    const cells = parseCells(text);
    const first = cells[0];
    const second = cells[1];
    if (!first || !second) throw new Error("expected two cells");
    expect(text.slice(first.from, first.to)).toBe("# %% a\nx = 1");
    expect(text.slice(second.from, second.to)).toBe("# %% b\ny = 2\n");
  });

  it("sees a marker inside a triple-quoted string as a marker", () => {
    const cells = parseCells('"""\n# %% not really\n"""\nx = 1');
    expect(cells).toHaveLength(2);
  });

  it("works with a CodeMirror-like doc", () => {
    const doc = docFromString("# %%\na\n# %%\nb");
    expect(parseCells(doc)).toHaveLength(2);
  });
});

describe("cellAt and friends", () => {
  const text = "a = 1\n# %% one\nb = 2\n# %% two\nc = 3\n";
  const cells = parseCells(text);

  it("finds the cell by offset and owns the trailing newline at the end", () => {
    expect(cellAt(cells, 0)?.index).toBe(0);
    expect(cellAt(cells, text.indexOf("b = 2"))?.index).toBe(1);
    expect(cellAt(cells, text.length)?.index).toBe(2);
  });

  it("collects the cells through a position", () => {
    expect(cellsThrough(cells, text.indexOf("b = 2")).map((c) => c.index)).toEqual([0, 1]);
  });

  it("steps to the next cell and stops at the end", () => {
    const first = cells[0];
    const last = cells[2];
    if (!first || !last) throw new Error("expected three cells");
    expect(nextCell(cells, first)?.index).toBe(1);
    expect(nextCell(cells, last)).toBeUndefined();
  });

  it("returns cell code without the marker line and with the right start line", () => {
    const doc = docFromString(text);
    const one = cells[1];
    const zero = cells[0];
    if (!one || !zero) throw new Error("expected cells");
    expect(cellCode(doc, one)).toEqual({ code: "b = 2", startLine: 3 });
    expect(cellCode(doc, zero)).toEqual({ code: "a = 1", startLine: 1 });
  });

  it("returns empty code for a marker with nothing under it", () => {
    const only = parseCells("# %% alone");
    const cell = only[0];
    if (!cell) throw new Error("expected a cell");
    expect(cellCode(docFromString("# %% alone"), cell).code).toBe("");
  });
});
