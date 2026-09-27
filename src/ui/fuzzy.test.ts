import { describe, expect, it } from "vitest";

import { fuzzyScore, rankCommands } from "./fuzzy";

const cmd = (title: string) => ({ id: title.toLowerCase(), title, run: () => {} });

describe("fuzzyScore", () => {
  it("prefers substrings, then subsequences, then nothing", () => {
    expect(fuzzyScore("save", "Save file")).toBe(0);
    expect(fuzzyScore("file", "Save file")).toBe(5);
    expect(fuzzyScore("sf", "Save file")).toBeGreaterThanOrEqual(100);
    expect(fuzzyScore("xyz", "Save file")).toBeNull();
  });

  it("matches everything with an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
});

describe("rankCommands", () => {
  it("orders by score then title", () => {
    const ranked = rankCommands(
      [cmd("Theme: Bog"), cmd("Open a project"), cmd("Save"), cmd("Toggle sidebar")],
      "o",
    );
    expect(ranked.map((c) => c.title)).toEqual(["Open a project", "Toggle sidebar", "Theme: Bog"]);
  });

  it("drops non-matches", () => {
    expect(rankCommands([cmd("Save"), cmd("Print")], "zz")).toEqual([]);
  });
});
