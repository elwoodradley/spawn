// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { builtinThemes } from "../theme/builtin";
import { filterThemes } from "./ThemePicker";

describe("filterThemes", () => {
  it("returns every theme for an empty query", () => {
    expect(filterThemes(builtinThemes, "")).toHaveLength(builtinThemes.length);
  });

  it("matches every word against the name and appearance", () => {
    const names = filterThemes(builtinThemes, "gruv light").map((t) => t.name);
    expect(names).toEqual(["Gruvbox Light"]);
    const light = filterThemes(builtinThemes, "light");
    expect(
      light.every((t) => t.appearance === "light" || t.name.toLowerCase().includes("light")),
    ).toBe(true);
  });
});
