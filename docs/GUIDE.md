# SPAWN: what it is, who it is for, and how to use it

_Status: Phase 2 in progress, 2026-09-26. Everything below is built and
installed unless marked "not yet"._

## What SPAWN is

SPAWN is a small, fast Python IDE built for machine-learning and AI work,
usable by anyone writing Python. It is a native desktop app (Tauri: a thin
Rust host and a web frontend) that starts in under a second and installs as a
7 MB binary. The editor is CodeMirror 6. The whole interface is themed from
JSON token files, down to the plot colours.

What makes it different from a general Python editor is what happens when you
run code:

- **Spawn.** Press F5 and the file runs as a fresh process with its output
  streaming into a panel under the editor. Programs that call `input()` work:
  there is a stdin row. Tracebacks are clickable. You never leave the window
  for a terminal.
- **The pool.** A persistent Python kernel. Shift+Enter runs the `# %%` cell
  under the cursor into the same live namespace, so you load a dataset once
  and iterate on the model. Plain `.py` files, no notebook format, nothing to
  install in your environment.
- **It shows the right thing.** A bare value at the end of a cell renders by
  its shape and type, with no plot code: matplotlib figures inline, pandas and
  polars DataFrames as real scrollable tables, numpy and torch arrays as cards
  with stats and a heatmap, a square integer matrix as a labelled confusion
  matrix, an image batch as a thumbnail grid, a dict of metrics as a table.
- **The run panel.** While a training script prints `loss: 0.23`, `epoch 3/10`
  or a tqdm bar, SPAWN draws live curves, pairs `loss` with `val_loss` on one
  chart with the gap shaded, tracks rate and ETA, and keeps the last runs to
  overlay for comparison.
- **Environment awareness.** The status bar always shows the interpreter,
  Python version, numpy and torch versions, the torch device (cuda / mps /
  cpu), GPU memory and system memory.
- **Handouts.** A `.docx` opens as a readable tab beside your code, so an
  assignment's instructions and pseudocode are right there.

## Who it is for

- **Students in ML and AI courses.** Assignments arrive as a `.docx` and a
  starter `.py`. You read the handout in one tab, write the code in the next,
  run it with F5, and see the loss curve, confusion matrix or DataFrame without
  writing a single line of matplotlib. `input()`-driven programs from
  introductory courses work too.
- **Practitioners iterating on models.** Load data once into the pool, spawn
  cells as you change the model, watch train and val diverge in the run panel,
  and compare the last few runs on one chart.
- **People who care how their tools look.** Themes are data files; every
  colour, font, spacing and radius is a token, and the editor, chrome, output
  and plots change together. Three ship: Pond (calm dark), Bog (aggressive
  dark), Lily (quiet light).

It is not trying to be VS Code. Language intelligence (pyright) and a debugger
are the next phases; the ML run-and-inspect loop is where it aims to be the
best tool available.

## Vocabulary

| Term          | Means                                                   |
| ------------- | ------------------------------------------------------- |
| spawn         | one run of a file, selection or cell (verb and noun)    |
| pool          | the persistent Python kernel that keeps state           |
| brood         | a project: the folder SPAWN has open                    |
| clutch        | a saved session: open files, layout, sizes, sidebar tab |
| metamorphosis | the interpreter switcher                                |
| croak         | an error or traceback                                   |

## Install and first launch

On Linux, from a clone of the repo:

```
npm install; and npm run install:linux
```

That builds a release binary and puts SPAWN in your app launcher with its
icon. Remove it with `bash scripts/install-linux.sh --uninstall`. On macOS and
Windows, `npm run tauri build` produces an app bundle or installer.

First launch shows a welcome screen. Open a brood (a folder) or a single file,
drop a folder onto the window, or pick something from the recent lists.
Everything you had open comes back next time.

## The workflow

### 1. Open a brood

File › Open brood (Ctrl+Shift+O), or drag the folder onto the window. The
sidebar's **Brood** tab shows the tree. Right-click a file or folder for new
file, new folder, rename, delete, copy path, or "Spawn this file". Ctrl+P
opens any file by fuzzy name; Ctrl+Shift+F searches inside files.

### 2. Pick an interpreter

The status bar shows the current Python. Click it for **metamorphosis**: SPAWN
lists the brood's `.venv`, whatever `uv python find` returns, and Pythons on
PATH. "Browse for a Python…" lets you point at any interpreter, for example a
venv in another folder; the choice is remembered per brood. The bar also shows
numpy and torch versions and the torch device once the interpreter is probed.

### 3. Spawn a file (fresh process)

F5 or the Spawn button runs the active `.py` file unbuffered with the brood as
working directory. Output streams into the **Output** tab: stdout in the
normal colour, stderr in amber, tracebacks in the croak colour with clickable
`File "…", line N` frames that jump to the line. Carriage-return progress bars
redraw in place. When the program calls `input()`, type in the stdin row at the
bottom (Ctrl+I focuses it), press Enter to send, Ctrl+D for end-of-file.
Shift+F5 stops it. Dirty files are saved first (a setting).

Right-click the output for find, copy all, save to a file, word wrap and
timestamps. The header shows the exact command and working directory on
hover, elapsed time and exit code.

### 4. Spawn into the pool (persistent kernel)

Put `# %%` lines in your file to make cells. Then:

- **Shift+Enter** spawns the cell under the cursor and moves to the next.
- **Ctrl+Shift+Enter** spawns it and stays.
- **Alt+Enter** spawns the selection, or the current line.
- **Ctrl+Shift+F5** spawns the whole file into the pool.

The first spawn starts the pool under the selected interpreter (the status bar
shows cold / starting / idle / busy / croaked). State persists across spawns
until you restart the pool from the Pool menu. Ctrl+Shift+. interrupts a
running cell. A bare expression at the end of a cell echoes its value, and
the value renders by its type:

| Value                                                                                            | Renders as                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| matplotlib figure, or any `plt.show()`                                                           | the figure inline, on the theme's plot colours, every figure in order                                             |
| pandas / polars DataFrame or Series                                                              | scrollable table: dtypes, null counts, stats on hover, sort, more rows on scroll                                  |
| numpy / torch / jax array                                                                        | card: shape, dtype, device, min / max / mean / std / NaNs, heatmap preview                                        |
| square non-negative integer matrix (`confusion_matrix`)                                          | labelled heatmap with totals, accuracy, per-class precision / recall / f1; click a cell to list the samples in it |
| array shaped (N, C, H, W), (N, H, W, C), (N, H, W), (C, H, W)                                    | thumbnail grid                                                                                                    |
| dict of dicts of numbers (`classification_report(output_dict=True)`), flat dict, list of records | table                                                                                                             |
| anything with `_repr_html_` / `_repr_png_` / `_repr_svg_`                                        | that, sandboxed                                                                                                   |
| everything else                                                                                  | its repr                                                                                                          |

The sidebar's **Pool** tab lists every variable with its shape or value,
most recently changed first; click one to inspect it. Hovering a name in the
editor while the pool is idle shows a compact card with the same information.

### 5. Read the run panel

Print metrics as `name: value` or `name=value` (any name), count epochs as
`epoch 3/10`, or use tqdm, and the **Run** tab lights up while the spawn runs:

- one chart per metric; `loss` and `val_loss` (or `train_*` / `val_*`) share a
  chart with the divergence gap shaded and the signed gap in the legend;
- elapsed time, rate (it/s from tqdm, else epochs or lines per second),
  progress and ETA;
- the value axis fits the bulk of the data; an isolated spike (a first-epoch
  `val_loss` of 6.78) sits off-scale as a marker with a count, so the rest of
  the curve stays readable. Each chart has an **auto / full / log** toggle;
- values printed fewer than three times (`hidden=64`, `accuracy 0.923`) are
  listed above the charts, not charted;
- the last five runs are kept and overlaid as dashed lines you can toggle per
  run; the strip above the charts lists them.

Add your own regexes under Settings › Run patterns (one capture group for the
number).

### 6. Read the handout

Click a `.docx` in the tree and it opens as a read-only tab in SPAWN's type
and colours: headings, lists, tables, images, emphasis and code-styled
paragraphs. Ctrl+F finds in the document. Text is selectable, so pseudocode
copies straight into your file. Equations from Word's equation editor come
through as plain text; anything the converter skipped is listed in a note at
the top.

### 7. Make it yours

Ctrl+, opens Settings: theme, UI and editor fonts and sizes, line height, zoom,
tab size, word wrap, autosave (off / after a delay / on focus change), trim
trailing whitespace, save before spawn, clear output on spawn, auto-show the
Run tab, desktop notification when a spawn finishes while you are elsewhere,
run patterns, and kept-run count. Zoom with Ctrl+= and Ctrl+-.

Themes are JSON files. View › Theme lists the shipped ones; "Where are my
themes?" shows the folder where your own go
(`~/.config/dev.stonetoad.spawn/themes/` on Linux). See `docs/THEMES.md` for
every token, including the CSS or SVG filter layer over the editor.

## Every keyboard shortcut

`Ctrl` is `⌘` on macOS. All of these are also in the menus and the command
palette (Ctrl+Shift+P), and F1 lists them inside the app.

### Files and broods

| Key          | Does                                               |
| ------------ | -------------------------------------------------- |
| Ctrl+N       | New file (inline in the tree when a brood is open) |
| Ctrl+O       | Open a file                                        |
| Ctrl+Shift+O | Open a brood                                       |
| Ctrl+S       | Save                                               |
| Ctrl+Alt+S   | Save all                                           |
| Ctrl+W       | Close tab                                          |
| Ctrl+P       | Go to file (fuzzy, over the brood)                 |
| Ctrl+Shift+F | Find in files                                      |
| Ctrl+Q       | Quit (asks if anything is unsaved)                 |
| F2 / Delete  | In the tree: rename / delete the selected entry    |

Print is in the File menu (no key).

### Running

| Key              | Does                                               |
| ---------------- | -------------------------------------------------- |
| F5 or Ctrl+Enter | Spawn the current file                             |
| Shift+F5         | Stop the spawn                                     |
| Ctrl+I           | Focus the stdin row                                |
| Enter / Ctrl+D   | In the stdin row: send the line / send end-of-file |

### The pool

| Key              | Does                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| Shift+Enter      | Spawn the cell under the cursor into the pool and move to the next cell |
| Ctrl+Shift+Enter | Spawn the cell and stay                                                 |
| Alt+Enter        | Spawn the selection, or the current line                                |
| Ctrl+Shift+F5    | Spawn the whole file into the pool                                      |
| Ctrl+Shift+.     | Interrupt the pool                                                      |
| Ctrl+Shift+V     | Toggle the Pool (variables) pane                                        |

Restart pool and Spawn all cells above are in the Pool menu.

### Editor

| Key                   | Does                                               |
| --------------------- | -------------------------------------------------- |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo                                        |
| Ctrl+A                | Select all                                         |
| Ctrl+F                | Find (in the editor, or in an open handout)        |
| Ctrl+H                | Find and replace                                   |
| Alt+G                 | Go to line                                         |
| Alt+Z                 | Toggle word wrap                                   |
| Tab / Shift+Tab       | Indent / dedent (4 spaces)                         |
| Ctrl+/                | Toggle line comment                                |
| Alt+↑ / Alt+↓         | Move line up / down                                |
| Shift+Alt+↑ / ↓       | Copy line up / down                                |
| Ctrl+D                | Select next occurrence                             |
| Ctrl+Shift+K          | Delete line                                        |
| Ctrl+] / Ctrl+[       | Indent / dedent selection                          |
| Escape                | Close the search panel, palette, menus and dialogs |

### Tabs and panels

| Key                       | Does                                |
| ------------------------- | ----------------------------------- |
| Ctrl+Tab / Ctrl+Shift+Tab | Cycle tabs by most recent use       |
| Ctrl+PageDown / PageUp    | Next / previous tab                 |
| Ctrl+1 … Ctrl+9           | Jump to tab N                       |
| Ctrl+B                    | Toggle the sidebar                  |
| Ctrl+J                    | Toggle the output panel             |
| Ctrl+Alt+J / K            | Output panel taller / shorter       |
| Ctrl+Shift+J              | Maximize / restore the output panel |

Drag the divider between editor and output, or beside the sidebar, to resize;
double-click it to reset. Drag tabs to reorder; middle-click closes.

### App

| Key             | Does                                    |
| --------------- | --------------------------------------- |
| Ctrl+Shift+P    | Command palette (recent commands first) |
| Ctrl+,          | Settings                                |
| Ctrl+= / Ctrl+- | Zoom in / out                           |
| Ctrl+0          | Reset zoom                              |
| F1              | Keyboard shortcuts                      |

## Mouse and menus worth knowing

- **Right-click** a tree entry, a tab, or the output panel for its actions.
- **Status bar:** click the interpreter for metamorphosis; the torch item to
  re-probe; the pool item to show variables (or restart when croaked); the
  brood name to open another; Ln/Col to go to a line; the theme name to cycle
  themes; the spawn status to toggle the output panel.
- **Output header:** Output / Run tabs, the command with the working
  directory on hover, Spawn / Stop, Clear, find, and a menu for copy, save,
  wrap and timestamps.
- **Charts:** hover for a crosshair with every line's value at that step;
  auto / full / log per chart; checkboxes in the legend toggle previous runs.
- **Confusion matrix:** click a cell to list the sample indices in it, with
  "copy as list".
- **Figures:** click to toggle natural size; right-click to copy or save.
- **Menus:** File, Edit, Spawn, Pool, View (themes live here), Help.

## Try it

The example brood at `examples/tadpole` has a file per feature:

| File                                      | Shows                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `main.py`                                 | `input()` inside SPAWN                                                                  |
| `assignment.docx`                         | a handout as a tab                                                                      |
| `train.py`                                | live loss and accuracy curves, pure Python                                              |
| `overfit.py`                              | `loss` vs `val_loss` with the gap shaded, a spike kept off-scale, one-off prints listed |
| `renderers.py`                            | Shift+Enter cells: dict → table, confusion matrix, image grids, array card              |
| `dataframe.py`                            | a pandas table in the pool (needs pandas in the interpreter)                            |
| `torch_train.py`                          | torch version and device in the status bar (needs torch)                                |
| `tensor_shapes.py`                        | a shape-mismatch croak with clickable frames                                            |
| `progress.py`                             | carriage-return bars                                                                    |
| `croak.py`, `syntax_croak.py`, `flood.py` | tracebacks and a 20,000-line flood                                                      |

## Not yet

- Language intelligence: completion, diagnostics, hover docs, go-to-definition
  (Phase 3, pyright over LSP).
- Debugger with breakpoints and stepping (Phase 4).
- PDF handouts, plotly figures, seaborn is fine but plotly needs its own
  renderer.
- Model architecture tree for `nn.Module`, scatter from (N, 2) / (N, 3)
  embeddings, attention heatmaps, per-layer weight and gradient histograms,
  shape tracing through a forward pass: all planned on top of the pool.
- Remote / SSH, notebooks, extensions: later, if ever.

## Where things live

- Settings and session: `~/.local/share/dev.stonetoad.spawn/spawn.json`
- Your themes: `~/.config/dev.stonetoad.spawn/themes/*.json`
- The kernel script SPAWN runs in your interpreter:
  `~/.cache/dev.stonetoad.spawn/pool/pool.py` (written by SPAWN, stdlib only)
- Blank window on Linux (WebKitGTK + some GPU drivers): launch with
  `SPAWN_SAFE_RENDER=1 spawn`.
