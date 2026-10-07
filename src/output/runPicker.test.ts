import { beforeEach, describe, expect, it } from "vitest";

import { removeRun, restoreRuns, type RunRecord } from "../spawn/runHistory";
import {
  compareMode,
  comparing,
  exitCompare,
  isPicked,
  toggleCompareMode,
  togglePick,
} from "./runPicker";

const run = (id: number, file = "train.py"): RunRecord => ({
  id,
  startedAt: id * 1000,
  file,
  command: `python ${file}`,
  durationMs: 1000,
  outcome: "ok",
  series: [],
});

describe("run picker", () => {
  beforeEach(() => {
    exitCompare();
    restoreRuns([run(1), run(2), run(3)]);
    toggleCompareMode();
  });

  it("compares once two runs are ticked, and a third tick replaces the first", () => {
    togglePick(1);
    expect(comparing()).toBeNull();
    togglePick(2);
    expect(comparing()?.map((r) => r.id)).toEqual([1, 2]);
    togglePick(3);
    expect(comparing()?.map((r) => r.id)).toEqual([2, 3]);
    expect(isPicked(1)).toBe(false);
    togglePick(3);
    expect(comparing()).toBeNull();
  });

  it("stops comparing when a ticked run is forgotten", () => {
    togglePick(1);
    togglePick(2);
    removeRun(2);
    expect(comparing()).toBeNull();
    expect(isPicked(2)).toBe(false);
  });

  it("does not carry ticks over to another project's runs with the same ids", () => {
    togglePick(1);
    togglePick(2);
    restoreRuns([run(1, "other.py"), run(2, "other.py")]);
    expect(comparing()).toBeNull();
    expect(isPicked(1)).toBe(false);
  });

  it("closing clears the ticks", () => {
    togglePick(1);
    togglePick(2);
    exitCompare();
    expect(compareMode()).toBe(false);
    expect(comparing()).toBeNull();
  });
});
