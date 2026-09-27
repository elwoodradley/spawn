// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { applyTheme, SVG_FILTER_HOST_ID } from "./apply";
import { builtinThemes, DEFAULT_THEME_NAME } from "./builtin";
import { parseTheme, SYNTAX_KEYS } from "./schema";
import { cssVarsToStylesheet, fontStack, themeToCssVars } from "./tokens";

const pond = builtinThemes.find((t) => t.name === "Pond");
if (!pond) throw new Error("Pond theme missing");

describe("built-in themes", () => {
  it("all validate and include the default", () => {
    expect(builtinThemes.map((t) => t.name)).toContain(DEFAULT_THEME_NAME);
    expect(builtinThemes.length).toBeGreaterThanOrEqual(3);
  });

  it("ship one dark and one light appearance", () => {
    const appearances = new Set(builtinThemes.map((t) => t.appearance));
    expect(appearances.has("dark")).toBe(true);
    expect(appearances.has("light")).toBe(true);
  });

  it("colour every syntax key so nothing falls back to inherit", () => {
    for (const theme of builtinThemes) {
      for (const key of SYNTAX_KEYS) {
        expect(theme.syntax[key]?.color, `${theme.name}.syntax.${key}`).toBeTruthy();
      }
    }
  });
});

describe("parseTheme", () => {
  it("rejects a file missing a colour with a readable path", () => {
    const broken = structuredClone(pond) as { colors: Record<string, unknown> };
    delete broken.colors.accent;
    const result = parseTheme(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("colors.accent");
  });

  it("fills spacing, radius and filter defaults", () => {
    const minimal = structuredClone(pond) as Record<string, unknown>;
    delete minimal.spacing;
    delete minimal.radius;
    delete minimal.filter;
    const result = parseTheme(minimal);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.theme.spacing.md).toBe(8);
      expect(result.theme.radius.md).toBe(6);
      expect(result.theme.filter.editor).toBe("");
    }
  });

  it("reads the error colour from `error`, or from the deprecated `croak` alias", () => {
    // A theme *file* writes `error`; the parsed theme keeps the internal `croak` key.
    const { croak, ...rest } = pond.colors;
    const file = { ...pond, colors: { ...rest, error: croak } };
    const viaError = parseTheme(file);
    expect(viaError.ok).toBe(true);
    if (viaError.ok) expect(viaError.theme.colors.croak).toBe(croak);

    const viaAlias = parseTheme({ ...pond, colors: { ...rest, croak } });
    expect(viaAlias.ok).toBe(true);
    if (viaAlias.ok) expect(viaAlias.theme.colors.croak).toBe(croak);

    const missing = parseTheme({ ...pond, colors: rest });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("colors.error");
  });

  it("rejects an unknown syntax key", () => {
    const bad = structuredClone(pond) as { syntax: Record<string, unknown> };
    bad.syntax.frog = { color: "#0f0" };
    expect(parseTheme(bad).ok).toBe(false);
  });
});

describe("themeToCssVars", () => {
  const vars = themeToCssVars(pond);

  it("emits colour, font, spacing, radius, syntax, plot and filter tokens", () => {
    expect(vars["--sp-color-bg"]).toBe(pond.colors.bg);
    expect(vars["--sp-color-bg-panel"]).toBe(pond.colors.bgPanel);
    expect(vars["--sp-font-size-mono"]).toBe("13px");
    expect(vars["--sp-space-md"]).toBe("8px");
    expect(vars["--sp-radius-md"]).toBe("6px");
    expect(vars["--sp-syntax-keyword-color"]).toBe(pond.syntax.keyword?.color);
    expect(vars["--sp-syntax-comment-font-style"]).toBe("italic");
    expect(vars["--sp-plot-series-0"]).toBe(pond.plot.series[0]);
    expect(vars["--sp-plot-series-count"]).toBe(String(pond.plot.series.length));
    expect(vars["--sp-filter-editor"]).toBe("none");
  });

  it("renders as a stylesheet", () => {
    expect(cssVarsToStylesheet({ "--sp-x": "1px" })).toBe(":root {\n  --sp-x: 1px;\n}");
  });
});

describe("fontStack", () => {
  it("quotes names with spaces and appends the fallback", () => {
    expect(fontStack("Berkeley Mono", "monospace")).toBe('"Berkeley Mono", monospace');
  });
  it("does not duplicate a name already in the fallback", () => {
    expect(fontStack("monospace", "ui-monospace, monospace")).toBe("ui-monospace, monospace");
  });
});

describe("applyTheme", () => {
  it("writes variables and appearance to the root", () => {
    applyTheme(pond);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--sp-color-accent")).toBe(pond.colors.accent);
    expect(root.dataset.appearance).toBe("dark");
    expect(document.getElementById(SVG_FILTER_HOST_ID)).toBeNull();
  });

  it("injects and removes svg filters", () => {
    const withSvg = { ...pond, filter: { ...pond.filter, svg: '<filter id="crt"></filter>' } };
    applyTheme(withSvg);
    expect(document.getElementById(SVG_FILTER_HOST_ID)?.innerHTML).toContain('id="crt"');
    applyTheme(pond);
    expect(document.getElementById(SVG_FILTER_HOST_ID)).toBeNull();
  });
});
