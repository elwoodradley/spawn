# SPAWN

A small, fast Python IDE for students working through Python, data science,
machine learning and AI coursework, and for anyone who wants to see what their
Python is doing. By [Stone Toad](https://github.com/stonetoad).

SPAWN runs your code inside the IDE. Output, tracebacks, and `input()` prompts
all land in a panel under the editor, never in a separate terminal. An
Interactive Console (a persistent Python kernel) lets you load a dataset once
and iterate on a model without reloading. Plain `.py` files, no notebook
format. No AI features: you write the code, SPAWN makes what it does visible.

Built with Tauri v2 (Rust host, web frontend), SolidJS, and CodeMirror 6.
The binary is a few megabytes and starts instantly.

**Status: early. Used by hand on Linux only so far; CI builds pass on Linux, macOS and Windows but nobody has run the macOS or Windows builds yet.** Phase 3 in progress. Editor, project tree, tabs, Run with
streamed output and stdin, the Interactive Console with rich rendering, the
Metrics panel, and the theme system. Not yet released.

## What makes it ML-specific

| Feature               | What it does                                                                                                                                                               | Phase |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Run with live output  | Run a file; stdout, stderr and `input()` prompts stream into the panel below the editor. Stop button. Tracebacks link to file and line.                                    | 1     |
| Theming as data       | Every colour, font, spacing and radius is a token in a JSON file. Editor, chrome, output and plots theme together.                                                         | 1     |
| Environment chrome    | Interpreter, Python version and source (project venv, uv, PATH), numpy and torch versions, device (cuda/mps/cpu), GPU and system memory, always visible in the status bar. | 1     |
| Interactive Console   | Persistent kernel. Shift+Enter runs a `# %%` cell, Alt+Enter a selection, in the same live state. Bare values echo. Variables pane. No extra packages needed.              | 2 ✓   |
| Inline plots          | matplotlib and seaborn figures render in the output panel on the theme's plot colours; every `plt.show()` and every bare figure. Plotly: later.                            | 2 ✓   |
| DataFrame viewer      | A real scrollable table for pandas and polars: dtypes, shape, null counts, stats on hover, sortable, pages in more rows as you scroll.                                     | 2 ✓   |
| Tensor inspector      | Evaluate a torch, numpy or jax array (or click it in the Variables pane, or hover its name) for shape, dtype, device, min/max/mean/std, NaN count and a heatmap.           | 2 ✓   |
| Metrics panel         | Live loss and metric curves, progress, elapsed time and iteration rate parsed from stdout (tqdm, `loss: 0.234`, `epoch 3/10`, or your own regex).                          | 1     |
| Language intelligence | pyright over LSP: completion, problems at Essential / Standard / Strict, hover docs plus live value, signatures, go-to-definition, references, rename.                     | 3 ✓   |
| Debugger              | DAP: breakpoints, stepping, variable inspection.                                                                                                                           | 4     |

Remote/SSH, notebooks and an extension API are "later, if ever".

## Everyday features

Everything is a command: reachable from the menus, the command palette
(Ctrl+Shift+P), or a key. The most used ones:

| Key                   | Does                                                  |
| --------------------- | ----------------------------------------------------- |
| F5 / Ctrl+Enter       | Run the current file; Shift+F5 stops it               |
| Ctrl+I                | Focus the stdin row to answer `input()`               |
| Ctrl+P                | Go to file (fuzzy, over the whole project)            |
| Ctrl+Shift+F          | Find in files                                         |
| Ctrl+O / Ctrl+Shift+O | Open a file / open a project                          |
| Ctrl+,                | Settings: fonts, sizes, zoom, editor, run, patterns   |
| Ctrl+= / Ctrl+-       | Zoom in / out; Ctrl+0 resets                          |
| Ctrl+Tab              | Cycle tabs (most recent first); Ctrl+1..9 jump        |
| Ctrl+B / Ctrl+J       | Toggle the sidebar / the output panel                 |
| Ctrl+Alt+J / K        | Output panel taller / shorter; Ctrl+Shift+J maximizes |
| Alt+Z                 | Word wrap                                             |
| F1                    | Every shortcut                                        |

Also: open a `.docx` handout in a tab and read it next to your code (headings, lists, tables, images and code blocks, with find), drag the line between editor and output (or beside the sidebar) to resize, double-click it to reset; drag a folder or files onto the window, drag tabs to reorder, right-click
files and tabs and the output panel, autosave (off, after a delay, or on focus
change), find inside the output, save the output to a file, timestamps per line,
desktop notification when a run finishes while you are elsewhere, and the
window remembers its size and position.

## Quick start (users)

There are no downloadable release builds yet. Building and installing from
source takes a few minutes and needs the developer prerequisites below.

On Linux, this builds a release binary and puts it in your launcher with the
app icon (no root needed):

```
npm install; and npm run install:linux
```

That installs `~/.local/bin/spawn`, a desktop entry, and the icon. Remove it
again with `bash scripts/install-linux.sh --uninstall`. On macOS and Windows,
`npm run tauri build` produces a `.app` / installer under
`src-tauri/target/release/bundle/`.

The icon lives in `app-icon.svg`; `npm run icons` regenerates every platform
size from it.

### Linux and a blank window

SPAWN renders through WebKitGTK on Linux. On some Wayland + GPU driver
combinations (NVIDIA most often) WebKitGTK paints a blank window. If that
happens, launch with:

```
SPAWN_SAFE_RENDER=1 spawn
```

SPAWN translates that into the documented WebKitGTK workaround before the
window is created. It is not forced on everyone because it disables a faster
rendering path.

## Quick start (developers)

You need Rust (via rustup), Node 22 or newer, and uv. Platform packages are
listed in [CONTRIBUTING.md](CONTRIBUTING.md).

```
git clone https://github.com/elwoodradley/spawn
cd spawn
npm install
npm run tauri dev
```

Before opening a pull request:

```
npm run check
```

That runs eslint, tsc, vitest, clippy, rustfmt and cargo test.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, conventions, how to add things.
- [docs/GUIDE.md](docs/GUIDE.md): what SPAWN is, how to use it, every shortcut.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit.
- [docs/ROADMAP.md](docs/ROADMAP.md): product direction and the implementation plan.
- [docs/THEMES.md](docs/THEMES.md): writing a theme file.
- [docs/RESEARCH.md](docs/RESEARCH.md): what people complain about in other IDEs and what SPAWN does about it.

## License

MIT. See [LICENSE](LICENSE).
