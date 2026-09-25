/**
 * The theme file format. A theme is data: a JSON file a user can write
 * without touching source. Every colour, font, spacing and radius is a token,
 * and the editor, chrome, output panel and plots all read the same tokens.
 *
 * See `themes/*.json` for the shipped examples and docs/THEMES.md for the
 * authoring guide.
 */
import { z } from "zod";

const color = z.string().min(1);
const px = z.number().int().min(0).max(200);

export const SYNTAX_KEYS = [
  "keyword",
  "controlKeyword",
  "definitionKeyword",
  "moduleKeyword",
  "operator",
  "string",
  "docString",
  "comment",
  "number",
  "bool",
  "null",
  "self",
  "function",
  "className",
  "typeName",
  "variableName",
  "propertyName",
  "definition",
  "decorator",
  "punctuation",
  "bracket",
  "invalid",
  "escape",
  "regexp",
] as const;
export type SyntaxKey = (typeof SYNTAX_KEYS)[number];

export const SyntaxStyle = z.object({
  color: color.optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  fontWeight: z.enum(["normal", "bold"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
});
export type SyntaxStyle = z.infer<typeof SyntaxStyle>;

export const Colors = z.object({
  /** Editor background. */
  bg: color,
  /** Side panels, output panel, status bar. */
  bgPanel: color,
  /** Popups, menus, the command palette. */
  bgElevated: color,
  bgHover: color,
  bgActive: color,
  fg: color,
  fgMuted: color,
  fgFaint: color,
  border: color,
  accent: color,
  /** Text drawn on top of `accent`. */
  accentFg: color,
  selection: color,
  cursor: color,
  lineHighlight: color,
  gutterFg: color,
  gutterActiveFg: color,
  matchingBracket: color,
  success: color,
  warning: color,
  /** Errors and tracebacks. */
  croak: color,
  info: color,
  /** Child-process stderr that is not a traceback (tqdm lives here). */
  stderr: color,
});
export type Colors = z.infer<typeof Colors>;

export const Fonts = z.object({
  ui: z.string().min(1),
  mono: z.string().min(1),
  sizeUi: px.default(13),
  sizeMono: px.default(13),
  lineHeight: z.number().min(1).max(3).default(1.5),
});

export const Spacing = z.object({
  xs: px.default(2),
  sm: px.default(4),
  md: px.default(8),
  lg: px.default(12),
  xl: px.default(16),
});

export const Radius = z.object({
  sm: px.default(3),
  md: px.default(6),
  lg: px.default(10),
});

export const Plot = z.object({
  background: color,
  foreground: color,
  grid: color,
  /** Series colours in order; cycles when a plot has more series. */
  series: z.array(color).min(1),
});

export const Filter = z.object({
  /**
   * A CSS `filter` value applied to the editor surface, e.g.
   * `"contrast(1.1) saturate(1.2)"` or `"url(#crt)"` to reference `svg`.
   */
  editor: z.string().default(""),
  /** Same, applied to everything that is not the editor. */
  chrome: z.string().default(""),
  /**
   * Raw SVG `<filter>` element(s). Injected once into the page so `editor` and
   * `chrome` can reference them by id with `url(#id)`.
   */
  svg: z.string().default(""),
});

export const ThemeFile = z.object({
  name: z.string().min(1),
  appearance: z.enum(["dark", "light"]),
  author: z.string().optional(),
  colors: Colors,
  fonts: Fonts,
  spacing: Spacing.prefault({}),
  radius: Radius.prefault({}),
  syntax: z.partialRecord(z.enum(SYNTAX_KEYS), SyntaxStyle),
  plot: Plot,
  filter: Filter.prefault({}),
});
export type Theme = z.infer<typeof ThemeFile>;

export type ThemeParseResult = { ok: true; theme: Theme } | { ok: false; error: string };

/** Validate untrusted JSON (a user file) into a `Theme`. */
export function parseTheme(input: unknown): ThemeParseResult {
  const result = ThemeFile.safeParse(input);
  if (result.success) return { ok: true, theme: result.data };
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, error: issues };
}
