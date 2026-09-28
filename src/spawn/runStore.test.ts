import { describe, expect, it } from "vitest";

import type { RunRecord } from "./runHistory";
import { MAX_STORED_PROJECTS, MAX_STORED_RUNS, parseHistory, withProject } from "./runStore";

const rec = (id: number): RunRecord => ({
  id,
  startedAt: id,
  file: "train.py",
  command: "python -u train.py",
  durationMs: 10,
  outcome: "ok",
  series: [{ name: "loss", points: [{ step: 1, value: 0.5 }] }],
  finals: { loss: 0.5 },
  snapshot: { path: "/p/train.py", code: "x = 1", python: "py", cwd: "/p", args: ["-u"] },
});

describe("parseHistory", () => {
  it("keeps valid projects and runs, drops the rest", () => {
    const out = parseHistory({
      "/a": { savedAt: 1, runs: [rec(1), { id: "bad" }, rec(2)] },
      "/b": "junk",
      "/c": { runs: [] },
    });
    expect(Object.keys(out)).toEqual(["/a"]);
    expect(out["/a"]?.runs.map((r) => r.id)).toEqual([1, 2]);
    expect(out["/a"]?.runs[0]?.snapshot?.code).toBe("x = 1");
  });

  it("accepts records without the optional fields", () => {
    const { snapshot: _s, finals: _f, ...old } = rec(1);
    expect(parseHistory({ "/a": { savedAt: 1, runs: [old] } })["/a"]?.runs).toHaveLength(1);
  });

  it("returns an empty map for anything else", () => {
    expect(parseHistory(null)).toEqual({});
    expect(parseHistory(3)).toEqual({});
  });
});

describe("withProject", () => {
  it("caps the stored runs and stamps the save time", () => {
    const list = Array.from({ length: MAX_STORED_RUNS + 3 }, (_, i) => rec(i + 1));
    const out = withProject({}, "/a", list, 42);
    expect(out["/a"]?.savedAt).toBe(42);
    expect(out["/a"]?.runs).toHaveLength(MAX_STORED_RUNS);
    expect(out["/a"]?.runs[0]?.id).toBe(4);
  });

  it("prunes the least recently saved projects", () => {
    let history = {};
    for (let i = 0; i < MAX_STORED_PROJECTS + 2; i++) {
      history = withProject(history, `/p${i}`, [rec(1)], i);
    }
    const roots = Object.keys(history);
    expect(roots).toHaveLength(MAX_STORED_PROJECTS);
    expect(roots).not.toContain("/p0");
    expect(roots).not.toContain("/p1");
    expect(roots).toContain(`/p${MAX_STORED_PROJECTS + 1}`);
  });
});
