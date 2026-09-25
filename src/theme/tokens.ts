/**
 * Turn a `Theme` into CSS custom properties. Every consumer, whether a Solid
 * component's stylesheet, the CodeMirror theme, or a plot renderer, reads
 * `var(--sp-...)`; switching themes only rewrites these variables.
 */
import { SYNTAX_KEYS, type SyntaxStyle, type Theme } from "./schema";

export const VAR_PREFIX = "--sp";

const UI_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO_FALLBACK =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", "SF Mono", Menlo, Consolas, ui-monospace, monospace';

export function kebab(key: string): string {
  return key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}

/** Quote a font family name when it needs it and append the fallback stack. */
export function fontStack(family: string, fallback: string): string {
  const trimmed = family.trim();
  const needsQuotes = /\s/.test(trimmed) && !/^["']/.test(trimmed);
  const head = needsQuotes ? `"${trimmed}"` : trimmed;
  return fallback.includes(head) ? fallback : `${head}, ${fallback}`;
}

function syntaxVars(key: string, style: SyntaxStyle | undefined, out: Record<string, string>) {
  const base = `${VAR_PREFIX}-syntax-${kebab(key)}`;
  out[`${base}-color`] = style?.color ?? "inherit";
  out[`${base}-font-style`] = style?.fontStyle ?? "normal";
  out[`${base}-font-weight`] = style?.fontWeight ?? "normal";
  out[`${base}-text-decoration`] = style?.textDecoration ?? "none";
}

/** Flatten a theme to `{ "--sp-color-bg": "#...", ... }`. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(theme.colors)) {
    vars[`${VAR_PREFIX}-color-${kebab(key)}`] = value;
  }

  vars[`${VAR_PREFIX}-font-ui`] = fontStack(theme.fonts.ui, UI_FALLBACK);
  vars[`${VAR_PREFIX}-font-mono`] = fontStack(theme.fonts.mono, MONO_FALLBACK);
  vars[`${VAR_PREFIX}-font-size-ui`] = `${theme.fonts.sizeUi}px`;
  vars[`${VAR_PREFIX}-font-size-mono`] = `${theme.fonts.sizeMono}px`;
  vars[`${VAR_PREFIX}-line-height`] = String(theme.fonts.lineHeight);

  for (const [key, value] of Object.entries(theme.spacing)) {
    vars[`${VAR_PREFIX}-space-${key}`] = `${value}px`;
  }
  for (const [key, value] of Object.entries(theme.radius)) {
    vars[`${VAR_PREFIX}-radius-${key}`] = `${value}px`;
  }

  for (const key of SYNTAX_KEYS) {
    syntaxVars(key, theme.syntax[key], vars);
  }

  vars[`${VAR_PREFIX}-plot-bg`] = theme.plot.background;
  vars[`${VAR_PREFIX}-plot-fg`] = theme.plot.foreground;
  vars[`${VAR_PREFIX}-plot-grid`] = theme.plot.grid;
  vars[`${VAR_PREFIX}-plot-series-count`] = String(theme.plot.series.length);
  theme.plot.series.forEach((value, i) => {
    vars[`${VAR_PREFIX}-plot-series-${i}`] = value;
  });

  vars[`${VAR_PREFIX}-filter-editor`] = theme.filter.editor || "none";
  vars[`${VAR_PREFIX}-filter-chrome`] = theme.filter.chrome || "none";

  return vars;
}

/** Render the variables as a `:root { ... }` block, for tests and exports. */
export function cssVarsToStylesheet(vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `:root {\n${lines.join("\n")}\n}`;
}
