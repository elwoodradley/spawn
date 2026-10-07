import { describe, expect, it } from "vitest";

import { builtinThemes } from "./builtin";
import { contrast } from "./contrast";
import { SYNTAX_KEYS } from "./schema";

/** Syntax colours allowed to sit lower: deliberately quiet text. */
const QUIET = new Set(["comment", "docString", "punctuation", "bracket"]);

function ratio(a: string, b: string): number {
  const r = contrast(a, b);
  if (r === null) throw new Error(`not a hex colour pair: ${a} on ${b}`);
  return r;
}

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(ratio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrast("rgba(0,0,0,0.5)", "#ffffff")).toBeNull();
  });
});

describe("shipped themes are readable", () => {
  for (const theme of builtinThemes) {
    it(theme.name, () => {
      const c = theme.colors;
      expect(ratio(c.fg, c.bg), "text on the editor").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.fg, c.bgPanel), "text on panels").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.accentFg, c.accent), "button text on the accent").toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.croak, c.bgPanel), "errors on panels").toBeGreaterThanOrEqual(3);
      expect(ratio(c.warning, c.bgPanel), "warnings on panels").toBeGreaterThanOrEqual(3);
      for (const key of SYNTAX_KEYS) {
        const color = theme.syntax[key]?.color;
        if (!color) continue;
        const floor = QUIET.has(key) ? 2.5 : 3;
        expect(ratio(color, c.bg), `syntax.${key}`).toBeGreaterThanOrEqual(floor);
      }
    });
  }
});
