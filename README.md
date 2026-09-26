# SPAWN

A Python IDE built for machine learning work, usable by anyone writing Python.

SPAWN runs your code inside the IDE. Output, tracebacks, and `input()` prompts
all land in a panel under the editor, never in a separate terminal. A
persistent kernel (the _pool_) lets you load a dataset once and iterate on a
model without reloading. Plain `.py` files, no notebook format.

Built with Tauri v2 (Rust host, web frontend), SolidJS, and CodeMirror 6.
The binary is a few megabytes and starts instantly.

**Status: Phase 1 in progress.** Editor, file tree, tabs, spawn button with
streamed output and stdin, and the theme system. Not yet released.

## What makes it ML-specific

| Feature                | What it does                                                                                                                                                             | Phase |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| Spawn with live output | Run a file; stdout, stderr and `input()` prompts stream into the panel below the editor. Stop button. Tracebacks link to file and line.                                  | 1     |
| Theming as data        | Every colour, font, spacing and radius is a token in a JSON file. Editor, chrome, output and plots theme together.                                                       | 1     |
| Environment chrome     | Interpreter, Python version and source (brood venv, uv, PATH), numpy and torch versions, device (cuda/mps/cpu), GPU and system memory, always visible in the status bar. | 1     |
| The pool               | Persistent kernel. Spawn a selection, a `# %%` cell, or the whole file into the same live state.                                                                         | 2     |
| Inline plots           | matplotlib, seaborn and plotly figures render in the output panel, not a popped window.                                                                                  | 2     |
| DataFrame viewer       | A real scrollable table for pandas and polars: dtypes, shape, null counts, basic stats.                                                                                  | 2     |
| Tensor inspector       | Hover a torch, numpy or jax array to see shape, dtype, device, min/max/mean, and a small heatmap.                                                                        | 2     |
| Run panel              | Live loss and metric curves, progress, elapsed time and iteration rate parsed from stdout (tqdm, `loss: 0.234`, `epoch 3/10`, or your own regex).                        | 1     |
| Language intelligence  | pyright over LSP: completion, diagnostics, hover, go-to-definition.                                                                                                      | 3     |
| Debugger               | DAP: breakpoints, stepping, variable inspection.                                                                                                                         | 4     |

Remote/SSH, notebooks and an extension API are "later, if ever".

## Vocabulary

The name is a toad reference (Stone Toad is the studio) and a process
reference (the run button spawns a Python process). These words are the
product's voice and are used consistently in the UI, code, docs and commits.

| Term          | Means                                                             |
| ------------- | ----------------------------------------------------------------- |
| spawn         | a single run of a file or selection (verb and noun)               |
| pool          | the persistent Python kernel that holds state between spawns      |
| clutch        | a saved session: open files, pool state, layout, scroll positions |
| brood         | a project or workspace (a folder SPAWN has opened)                |
| metamorphosis | the environment/interpreter switcher                              |
| croak         | an error or traceback                                             |

Everything else uses the plain word. Settings is settings.

## Everyday features

Everything is a command: reachable from the menus, the command palette
(Ctrl+Shift+P), or a key. The most used ones:

| Key                   | Does                                                  |
| --------------------- | ----------------------------------------------------- |
| F5 / Ctrl+Enter       | Spawn the current file; Shift+F5 stops it             |
| Ctrl+I                | Focus the stdin row to answer `input()`               |
| Ctrl+P                | Go to file (fuzzy, over the whole brood)              |
| Ctrl+Shift+F          | Find in files                                         |
| Ctrl+O / Ctrl+Shift+O | Open a file / open a brood                            |
| Ctrl+,                | Settings: fonts, sizes, zoom, editor, spawn, patterns |
| Ctrl+= / Ctrl+-       | Zoom in / out; Ctrl+0 resets                          |
| Ctrl+Tab              | Cycle tabs (most recent first); Ctrl+1..9 jump        |
| Ctrl+B / Ctrl+J       | Toggle the brood sidebar / the output panel           |
| Alt+Z                 | Word wrap                                             |
| F1                    | Every shortcut                                        |

Also: drag a folder or files onto the window, drag tabs to reorder, right-click
files and tabs and the output panel, autosave (off, after a delay, or on focus
change), find inside the output, save the output to a file, timestamps per line,
desktop notification when a spawn finishes while you are elsewhere, and the
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
git clone https://github.com/stonetoad/spawn
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
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit.
- [docs/THEMES.md](docs/THEMES.md): writing a theme file.
- [docs/RESEARCH.md](docs/RESEARCH.md): what people complain about in other IDEs and what SPAWN does about it.

## License

MIT. See [LICENSE](LICENSE).
