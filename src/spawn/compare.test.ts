import { describe, expect, it } from "vitest";

import {
  compareRuns,
  describeFinal,
  describeName,
  extractAssignments,
  fmt,
  orderPair,
  settingChanges,
  stripComment,
} from "./compare";
import type { RunRecord } from "./runHistory";

const run = (over: Partial<RunRecord>): RunRecord => ({
  id: 1,
  startedAt: 0,
  file: "train.py",
  command: "python -u train.py",
  durationMs: 1000,
  outcome: "ok",
  series: [],
  ...over,
});

const snap = (code: string, python = "/usr/bin/python3") => ({
  path: "/p/train.py",
  code,
  python,
  cwd: "/p",
  args: ["-u", "/p/train.py"],
});

describe("stripComment", () => {
  it("removes a comment but not a # inside a string", () => {
    expect(stripComment("lr = 0.1  # was 0.01")).toBe("lr = 0.1  ");
    expect(stripComment('name = "a#b" # c')).toBe('name = "a#b" ');
  });
});

describe("extractAssignments", () => {
  it("finds plain, annotated, attribute and keyword assignments", () => {
    const code = [
      "lr = 0.01",
      "batch_size: int = 32",
      "self.hidden = 128",
      'optimizer = "adam"',
      "opt = SGD(model.parameters(), lr=0.01, momentum=0.9)",
      "use_bias = True",
      "n = 10_000",
    ].join("\n");
    const names = extractAssignments(code).map((a) => `${a.name}=${a.value}`);
    expect(names).toEqual([
      "lr=0.01",
      "batch_size=32",
      "hidden=128",
      "optimizer=adam",
      "lr=0.01",
      "momentum=0.9",
      "use_bias=True",
      "n=10000",
    ]);
  });

  it("ignores comparisons, non-literals and dict keys", () => {
    const code = ["if x == 0.5:", "  y = x + 1", 'cfg = {"lr": 0.01}', "z <= 3", "w != 2"].join(
      "\n",
    );
    expect(extractAssignments(code)).toEqual([]);
  });
});

describe("settingChanges", () => {
  it("reports shared names whose literal changed, with words for known ones", () => {
    const before = "lr = 0.01\nbatch_size = 32\nepochs = 10\nseed = 0";
    const after = "lr = 0.1\nbatch_size = 64\nepochs = 10\nseed = 0\nnew = 3";
    expect(settingChanges(before, after)).toEqual([
      { name: "lr", label: "Learning rate", from: "0.01", to: "0.1" },
      { name: "batch_size", label: "Batch size", from: "32", to: "64" },
    ]);
  });

  it("treats 0.10 and 0.1 as the same value", () => {
    expect(settingChanges("lr = 0.10", "lr = 0.1")).toEqual([]);
  });

  it("compares repeated names position by position", () => {
    const before = "f(lr=0.1)\ng(lr=0.2)";
    const after = "f(lr=0.1)\ng(lr=0.3)";
    expect(settingChanges(before, after)).toEqual([
      { name: "lr", label: "Learning rate", from: "0.2", to: "0.3" },
    ]);
  });
});

describe("describeName", () => {
  it("maps well-known names and leaves the rest", () => {
    expect(describeName("learning_rate")).toBe("Learning rate");
    expect(describeName("hidden_dim")).toBe("Hidden size");
    expect(describeName("weight_decay")).toBe("Weight decay");
    expect(describeName("my_knob")).toBe("my_knob");
  });
});

describe("fmt and describeFinal", () => {
  it("formats with three significant digits", () => {
    expect(fmt(0.91234)).toBe("0.912");
    expect(fmt(1234.5)).toBe("1230");
    expect(fmt(0)).toBe("0");
  });

  it("writes drops, rises and improvements in words", () => {
    expect(describeFinal("val_acc", 0.91, 0.84)).toEqual({
      kind: "metric",
      text: "final val_acc dropped 8% (0.91 → 0.84).",
      direction: "worse",
    });
    expect(describeFinal("loss", 0.42, 0.31).text).toBe("final loss improved 26% (0.42 → 0.31).");
    expect(describeFinal("loss", 0.31, 0.42)).toMatchObject({
      text: "final loss rose 35% (0.31 → 0.42).",
      direction: "worse",
    });
    expect(describeFinal("acc", 0.5, 0.5)).toMatchObject({
      text: "final acc unchanged at 0.5.",
      direction: "same",
    });
    expect(describeFinal("acc", 0.9, 0.901).text).toBe(
      "final acc improved slightly (0.9 → 0.901).",
    );
  });

  it("says how many times for a change past 1000%", () => {
    expect(describeFinal("loss", 0.0209, 10000).text).toBe(
      "final loss rose 478000× (0.0209 → 10000).",
    );
    expect(describeFinal("lr", 0.01, 0.1).text).toBe("final lr rose 900% (0.01 → 0.1).");
  });

  it("does not call a learning rate or other neutral value better or worse", () => {
    expect(describeFinal("lr", 0.01, 0.1)).toEqual({
      kind: "metric",
      text: "final lr rose 900% (0.01 → 0.1).",
      direction: "changed",
    });
    expect(describeFinal("grad_norm", 2, 1).text).toBe("final grad_norm fell 50% (2 → 1).");
    expect(describeFinal("f1_score", 0.8, 0.7).direction).toBe("worse");
  });

  it("gives no percentage for a change from zero", () => {
    expect(describeFinal("val_acc", 0, 0.5).text).toBe("final val_acc improved (0 → 0.5).");
  });
});

describe("compareRuns", () => {
  const older = run({
    id: 1,
    startedAt: 100,
    snapshot: snap("lr = 0.01\nepochs = 10\ntrain()\n"),
    finals: { loss: 0.42, val_acc: 0.91 },
    best: { val_acc: { value: 0.93, step: 7 } },
    xUnit: "epoch",
  });
  const newer = run({
    id: 2,
    startedAt: 200,
    snapshot: snap("lr = 0.1\nepochs = 10\ntrain()\n"),
    finals: { loss: 0.31, val_acc: 0.84, extra: 1 },
    best: { val_acc: { value: 0.88, step: 3 } },
    xUnit: "epoch",
  });

  it("orders by start time regardless of argument order", () => {
    expect(orderPair(newer, older).map((r) => r.id)).toEqual([1, 2]);
    expect(compareRuns(newer, older).a.id).toBe(1);
  });

  it("tells the whole story in sentences", () => {
    const c = compareRuns(older, newer);
    expect(c.codeState).toBe("changed");
    expect(c.findings.map((f) => f.text)).toEqual([
      "Learning rate went 0.01 → 0.1.",
      "extra was only printed in run #2.",
      "final loss improved 26% (0.42 → 0.31).",
      "final val_acc dropped 8% (0.91 → 0.84).",
      "best val_acc got worse: 0.93 at epoch 7 → 0.88 at epoch 3.",
    ]);
    expect(c.rows).toEqual([
      { name: "extra", a: null, b: 1, delta: null, direction: null },
      {
        name: "loss",
        a: 0.42,
        b: 0.31,
        delta: expect.closeTo(-0.11, 6) as number,
        direction: "better",
      },
      {
        name: "val_acc",
        a: 0.91,
        b: 0.84,
        delta: expect.closeTo(-0.07, 6) as number,
        direction: "worse",
      },
    ]);
  });

  it("says when nothing changed", () => {
    const same = run({ ...older, id: 3, startedAt: 300 });
    const c = compareRuns(older, same);
    expect(c.codeState).toBe("same");
    expect(c.findings.map((f) => f.text)).toEqual([
      "No code changed between these runs.",
      "Same result: every final metric is identical.",
    ]);
  });

  it("notes different files, missing snapshots and interpreter changes", () => {
    const other = run({ id: 4, startedAt: 400, file: "other.py", finals: { acc: 1 } });
    const c = compareRuns(older, other);
    expect(c.codeState).toBe("unknown");
    expect(c.findings[0]?.text).toBe("These runs are from different files: train.py and other.py.");
    expect(c.findings[1]?.text).toBe("Run #4 has no saved code, so the code cannot be compared.");
    expect(c.findings.some((f) => f.text === "The runs printed no metric in common.")).toBe(true);

    const venv = run({ id: 5, startedAt: 500, snapshot: snap("x = 1", "/p/.venv/bin/python") });
    const d = compareRuns(run({ id: 1, snapshot: snap("x = 1") }), venv);
    expect(d.findings[0]?.text).toBe(
      "Python interpreter changed: /usr/bin/python3 → /p/.venv/bin/python.",
    );
    expect(d.findings[1]?.text).toBe("No code changed between these runs.");
  });

  it("points at the diff when the code changed but no setting did", () => {
    const b = run({
      id: 2,
      startedAt: 200,
      snapshot: snap("lr = 0.01\nepochs = 10\ntrain(); log()\n"),
    });
    const c = compareRuns(older, b);
    expect(c.findings[0]?.text).toContain("see the diff below");
  });
});
