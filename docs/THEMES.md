# Writing a theme

A theme is a JSON file. You never touch source. Every colour, font, spacing
and radius in SPAWN is a token from this file, and the editor, chrome, output
panel and plots all read the same tokens.

## Where themes live

- Shipped themes: `themes/*.json` in the repo (Pond, Bog, Lily).
- Your themes: `<app config dir>/themes/*.json`. On Linux that is
  `~/.config/dev.stonetoad.spawn/themes/`, on macOS
  `~/Library/Application Support/dev.stonetoad.spawn/themes/`, on Windows
  `%APPDATA%\dev.stonetoad.spawn\themes\`.

A user theme with the same `name` as a shipped one replaces it. Files that
fail validation are skipped and the error is reported with the field path.

## The file

```json
{
  "name": "Marsh",
  "appearance": "dark",
  "author": "you",
  "colors": { ... },
  "fonts": { ... },
  "spacing": { ... },
  "radius": { ... },
  "syntax": { ... },
  "plot": { ... },
  "filter": { ... }
}
```

### Top level

| Field        | Required | Meaning                                                                                             |
| ------------ | -------- | --------------------------------------------------------------------------------------------------- |
| `name`       | yes      | Shown in the theme picker.                                                                          |
| `appearance` | yes      | `"dark"` or `"light"`. Sets `color-scheme` and CodeMirror's defaults for anything you do not style. |
| `author`     | no       | Free text.                                                                                          |

### `colors` (all required)

Any CSS colour value is accepted: hex, `rgba(...)`, `hsl(...)`, `oklch(...)`.

| Key               | Used for                                                       |
| ----------------- | -------------------------------------------------------------- |
| `bg`              | editor background                                              |
| `bgPanel`         | side panels, output panel, status bar                          |
| `bgElevated`      | popups, menus, command palette                                 |
| `bgHover`         | hovered rows and buttons                                       |
| `bgActive`        | active tab, selected tree row                                  |
| `fg`              | main text                                                      |
| `fgMuted`         | secondary text                                                 |
| `fgFaint`         | hints, disabled text                                           |
| `border`          | separators and outlines                                        |
| `accent`          | the one highlight colour: focus rings, active markers, buttons |
| `accentFg`        | text drawn on top of `accent`                                  |
| `selection`       | editor selection (use alpha)                                   |
| `cursor`          | editor caret                                                   |
| `lineHighlight`   | active line background (use alpha)                             |
| `gutterFg`        | line numbers                                                   |
| `gutterActiveFg`  | active line number                                             |
| `matchingBracket` | bracket match background                                       |
| `success`         | exit code 0, healthy pool                                      |
| `warning`         | warnings                                                       |
| `croak`           | errors and tracebacks                                          |
| `info`            | informational text                                             |
| `stderr`          | child stderr that is not a traceback (tqdm lives here)         |

### `fonts`

| Key          | Default  | Meaning                                                    |
| ------------ | -------- | ---------------------------------------------------------- |
| `ui`         | required | UI font family name. A fallback stack is appended for you. |
| `mono`       | required | Editor and output font family name. Fallbacks appended.    |
| `sizeUi`     | 13       | pixels                                                     |
| `sizeMono`   | 13       | pixels                                                     |
| `lineHeight` | 1.5      | unitless, 1 to 3                                           |

Names with spaces are quoted for you: `"Berkeley Mono"` becomes
`"Berkeley Mono", "JetBrains Mono", ..., monospace`.

### `spacing` and `radius` (optional, pixels)

`spacing`: `xs` 2, `sm` 4, `md` 8, `lg` 12, `xl` 16. `radius`: `sm` 3, `md` 6,
`lg` 10. Omit the whole object to take defaults.

### `syntax`

A map from syntax key to a style object. Every key is optional but the shipped
themes colour all of them, and the test suite checks that they do.

Style object: `color`, `fontStyle` (`normal` | `italic`), `fontWeight`
(`normal` | `bold`), `textDecoration` (`none` | `underline` |
`line-through`).

Keys and what they hit in Python:

| Key                 | Example                                         |
| ------------------- | ----------------------------------------------- |
| `keyword`           | generic keywords                                |
| `controlKeyword`    | `if`, `for`, `return`, `try`                    |
| `definitionKeyword` | `def`, `class`, `lambda`                        |
| `moduleKeyword`     | `import`, `from`, `as`                          |
| `operator`          | `+`, `==`, `and`                                |
| `string`            | string literals                                 |
| `docString`         | triple-quoted docstrings                        |
| `comment`           | `# ...`                                         |
| `number`            | `42`, `3.14`                                    |
| `bool`              | `True`, `False`                                 |
| `null`              | `None`                                          |
| `self`              | `self`, `cls`                                   |
| `function`          | function call names                             |
| `className`         | class names                                     |
| `typeName`          | type annotations                                |
| `variableName`      | plain identifiers                               |
| `propertyName`      | attribute access `x.shape`                      |
| `definition`        | the name being defined in `def` and assignments |
| `decorator`         | `@dataclass`                                    |
| `punctuation`       | `,`, `:`                                        |
| `bracket`           | `()`, `[]`, `{}`                                |
| `invalid`           | syntax errors                                   |
| `escape`            | `\n` inside strings                             |
| `regexp`            | regex literals in f-strings and r-strings       |

Unknown keys are rejected so a typo cannot silently do nothing.

### `plot` (all required)

| Key          | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `background` | figure background                                    |
| `foreground` | axis lines, tick labels, titles                      |
| `grid`       | grid lines                                           |
| `series`     | list of at least one colour; series cycle through it |

Phase 2 injects these into matplotlib, seaborn and plotly figures so plots
match the theme.

### `filter` (optional)

This is the "shader layer" for the editor surface, within what a webview can
do.

| Key      | Default | Meaning                                                  |
| -------- | ------- | -------------------------------------------------------- |
| `editor` | `""`    | a CSS `filter` value applied to the editor surface       |
| `chrome` | `""`    | a CSS `filter` value applied to everything else          |
| `svg`    | `""`    | raw SVG `<filter>` elements, injected once into the page |

`editor` and `chrome` accept anything CSS `filter` accepts: `contrast(1.1)`,
`saturate(1.2)`, `brightness(0.95)`, `hue-rotate(10deg)`, `blur(0.2px)`, and
`url(#id)` to reference a filter defined in `svg`. Chain them with spaces.

SVG filter primitives give you displacement maps (`feDisplacementMap` +
`feTurbulence`), colour matrices, lighting, and glow (`feGaussianBlur` +
`feMerge`). That covers warp, grain, glow and chromatic fringing as data.

**Honest performance note.** A true GLSL fragment shader over the rendered
text is not possible: a webview cannot sample its own DOM into a WebGL
texture. Plain CSS filters are GPU-accelerated and cheap. SVG filters are
CPU-rendered in WebKitGTK and re-run when the editor repaints, so they suit
static effects on a normal-sized editor. Animated or per-frame effects will
make typing lag. Measure on your own machine; a `filter` you cannot feel
while typing is the right size.

## Minimal example

The smallest valid theme. Spacing, radius and filter take their defaults.

```json
{
  "name": "Marsh",
  "appearance": "dark",
  "colors": {
    "bg": "#101412",
    "bgPanel": "#0c100e",
    "bgElevated": "#182019",
    "bgHover": "#1e281f",
    "bgActive": "#263227",
    "fg": "#d8e6d4",
    "fgMuted": "#8aa08c",
    "fgFaint": "#54665a",
    "border": "#20291f",
    "accent": "#8fd18a",
    "accentFg": "#101412",
    "selection": "rgba(143, 209, 138, 0.22)",
    "cursor": "#8fd18a",
    "lineHighlight": "rgba(255, 255, 255, 0.04)",
    "gutterFg": "#54665a",
    "gutterActiveFg": "#d8e6d4",
    "matchingBracket": "rgba(143, 209, 138, 0.3)",
    "success": "#8fd18a",
    "warning": "#e0b45c",
    "croak": "#e46f6f",
    "info": "#6fb3d2",
    "stderr": "#c9b27a"
  },
  "fonts": { "ui": "system-ui", "mono": "JetBrains Mono" },
  "syntax": {
    "keyword": { "color": "#c792ea" },
    "controlKeyword": { "color": "#c792ea" },
    "definitionKeyword": { "color": "#c792ea" },
    "moduleKeyword": { "color": "#c792ea" },
    "operator": { "color": "#89ddff" },
    "string": { "color": "#a3d48f" },
    "docString": { "color": "#8fa887", "fontStyle": "italic" },
    "comment": { "color": "#5f6b78", "fontStyle": "italic" },
    "number": { "color": "#f2a86f" },
    "bool": { "color": "#f2a86f" },
    "null": { "color": "#f2a86f" },
    "self": { "color": "#e8b56b" },
    "function": { "color": "#82aaff" },
    "className": { "color": "#ffcb6b" },
    "typeName": { "color": "#ffcb6b" },
    "variableName": { "color": "#d8e6d4" },
    "propertyName": { "color": "#bcd2e8" },
    "definition": { "color": "#82aaff" },
    "decorator": { "color": "#e8b56b" },
    "punctuation": { "color": "#8aa08c" },
    "bracket": { "color": "#8aa08c" },
    "invalid": { "color": "#e46f6f", "textDecoration": "underline" },
    "escape": { "color": "#89ddff" },
    "regexp": { "color": "#a3d48f" }
  },
  "plot": {
    "background": "#0c100e",
    "foreground": "#d8e6d4",
    "grid": "#20291f",
    "series": ["#8fd18a", "#f2a86f", "#6fb3d2", "#c792ea", "#ffcb6b", "#e46f6f"]
  }
}
```

Adding a glow filter to that theme:

```json
"filter": {
  "editor": "url(#marsh-glow) contrast(1.05)",
  "svg": "<filter id=\"marsh-glow\"><feGaussianBlur stdDeviation=\"0.6\" result=\"b\"/><feMerge><feMergeNode in=\"b\"/><feMergeNode in=\"SourceGraphic\"/></feMerge></filter>"
}
```

Drop the file in your themes directory, restart SPAWN (or run the "Reload
themes" command), and pick it from the theme picker.
