/**
 * The CodeMirror side of the theme system.
 *
 * Both the editor theme and the highlight style reference `--sp-*` variables
 * instead of literal colours, so they are built once and never rebuilt when
 * the theme changes. The only theme-dependent bit is the `dark` flag, which
 * changes CodeMirror's defaults for things we do not style; the editor keeps
 * that in a Compartment.
 */
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t, type Tag } from "@lezer/highlight";

import type { SyntaxKey } from "./schema";
import { VAR_PREFIX, kebab } from "./tokens";

function v(name: string): string {
  return `var(${VAR_PREFIX}-${name})`;
}

/** Which lezer tags each theme syntax key colours. */
export const SYNTAX_TAGS: Record<SyntaxKey, Tag | readonly Tag[]> = {
  keyword: t.keyword,
  controlKeyword: t.controlKeyword,
  definitionKeyword: t.definitionKeyword,
  moduleKeyword: t.moduleKeyword,
  operator: [t.operator, t.arithmeticOperator, t.logicOperator, t.compareOperator],
  string: [t.string, t.special(t.string)],
  docString: t.docString,
  comment: [t.comment, t.lineComment, t.blockComment],
  number: [t.number, t.integer, t.float],
  bool: t.bool,
  null: t.null,
  self: t.self,
  function: [t.function(t.variableName), t.function(t.propertyName)],
  className: t.className,
  typeName: t.typeName,
  variableName: t.variableName,
  propertyName: t.propertyName,
  definition: [t.definition(t.variableName), t.definition(t.function(t.variableName))],
  decorator: [t.meta, t.annotation],
  punctuation: [t.punctuation, t.separator],
  bracket: [t.bracket, t.paren, t.squareBracket, t.brace],
  invalid: t.invalid,
  escape: t.escape,
  regexp: t.regexp,
};

function syntaxSpec(key: SyntaxKey) {
  const base = `syntax-${kebab(key)}`;
  return {
    tag: SYNTAX_TAGS[key],
    color: v(`${base}-color`),
    fontStyle: v(`${base}-font-style`),
    fontWeight: v(`${base}-font-weight`),
    textDecoration: v(`${base}-text-decoration`),
  };
}

export const spawnHighlightStyle = HighlightStyle.define(
  (Object.keys(SYNTAX_TAGS) as SyntaxKey[]).map(syntaxSpec),
);

const chrome = {
  "&": {
    color: v("color-fg"),
    backgroundColor: v("color-bg"),
    fontFamily: v("font-mono"),
    fontSize: v("font-size-mono"),
    filter: v("filter-editor"),
    height: "100%",
  },
  ".cm-scroller": {
    lineHeight: v("line-height"),
    fontFamily: "inherit",
  },
  ".cm-content": {
    caretColor: v("color-cursor"),
    padding: `${v("space-sm")} 0`,
  },
  "&.cm-focused .cm-cursor, .cm-cursor": {
    borderLeftColor: v("color-cursor"),
    borderLeftWidth: "2px",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor: v("color-selection"),
    },
  ".cm-activeLine": { backgroundColor: v("color-line-highlight") },
  ".cm-activeLineGutter": {
    backgroundColor: v("color-line-highlight"),
    color: v("color-gutter-active-fg"),
  },
  ".cm-gutters": {
    backgroundColor: v("color-bg"),
    color: v("color-gutter-fg"),
    borderRight: `1px solid ${v("color-border")}`,
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: `0 ${v("space-md")} 0 ${v("space-lg")}` },
  ".cm-foldPlaceholder": {
    backgroundColor: v("color-bg-elevated"),
    color: v("color-fg-muted"),
    border: `1px solid ${v("color-border")}`,
  },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: v("color-matching-bracket"),
    outline: "none",
  },
  ".cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "transparent",
    color: v("color-croak"),
  },
  ".cm-selectionMatch": { backgroundColor: v("color-selection") },
  ".cm-searchMatch": {
    backgroundColor: v("color-selection"),
    outline: `1px solid ${v("color-accent")}`,
  },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: v("color-accent") },
  ".cm-panels": {
    backgroundColor: v("color-bg-panel"),
    color: v("color-fg"),
    fontFamily: v("font-ui"),
    fontSize: v("font-size-ui"),
  },
  ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${v("color-border")}` },
  ".cm-panel input, .cm-panel button": {
    backgroundColor: v("color-bg-elevated"),
    color: v("color-fg"),
    border: `1px solid ${v("color-border")}`,
    borderRadius: v("radius-sm"),
    fontFamily: "inherit",
  },
  ".cm-tooltip": {
    backgroundColor: v("color-bg-elevated"),
    color: v("color-fg"),
    border: `1px solid ${v("color-border")}`,
    borderRadius: v("radius-md"),
    fontFamily: v("font-ui"),
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: v("font-mono") },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: v("color-accent"),
    color: v("color-accent-fg"),
  },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: `underline wavy ${v("color-croak")}`,
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: `underline wavy ${v("color-warning")}`,
  },
};

/** Editor theme for the given appearance. Swap via a Compartment. */
export function spawnEditorTheme(appearance: "dark" | "light"): Extension {
  return [
    EditorView.theme(chrome, { dark: appearance === "dark" }),
    syntaxHighlighting(spawnHighlightStyle),
  ];
}
