# SPAWN

A small, fast Python IDE for students working through Python, data science,
machine learning and AI coursework, and for anyone who wants to see what their
Python is doing. By [Stone Toad](https://github.com/elwoodradley).

SPAWN runs your code inside the IDE. Output, tracebacks, and `input()` prompts
all land in a panel under the editor, never in a separate terminal. An
Interactive Console (a persistent Python kernel) lets you load a dataset once
and iterate on a model without reloading. Plain `.py` files, no notebook
format. No AI features: you write the code, SPAWN makes what it does visible.

Built with Tauri v2 (Rust host, web frontend), SolidJS, and CodeMirror 6.
The binary is a few megabytes and starts instantly.

**Status: 0.1, the first public release.** Used daily on Linux; macOS and
Windows builds are produced by CI on every release and have had less hands-on
use, so please [open an issue](https://github.com/elwoodradley/spawn/issues)
for anything that misbehaves there.

## What it does

| Feature                 | What it does                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run with live output    | F5 runs a file; stdout, stderr and `input()` prompts stream into the panel below the editor. Tracebacks link to file and line. Runs from the file's own folder, shown in the header. |
| Interactive Console     | Persistent kernel. Shift+Enter runs a `# %%` cell, Alt+Enter a selection, in the same live state. Bare values echo. Variables pane. No extra packages needed in your environment.    |
| Inline plots and tables | matplotlib and seaborn figures in the output panel on the theme's colours; a scrollable DataFrame viewer; tensor and array inspector with stats and a heatmap; confusion matrices.   |
| Values beside your code | After a console run, each assignment shows what it now holds at the end of its line: `x = data[:, 2]  → (400,) float64`.                                                             |
| Metrics tab             | Live loss and metric curves, progress, ETA and iteration rate parsed from what your script prints (tqdm, `loss: 0.234`, `epoch 3/10`, or your own pattern).                          |
| Training notes          | Plain-language notes above the charts when validation loss starts rising, loss turns NaN or explodes, or training stalls, with a marker on the chart.                                |
| Compare runs            | Every run keeps its code. Pick two and read "Learning rate went 0.01 → 0.1, final val_acc dropped 8%", with the metric table and the code diff.                                      |
| Error cards             | Under a traceback, what went wrong in plain words for the errors beginners hit most, with a fix button where one exists (install a missing package into the project's `.venv`).      |
| Dataset checks          | A new DataFrame gets a short report: missing values, class imbalance, likely leakage, features on very different scales.                                                             |
| Check before submitting | F6 runs the file from a fresh start, checks the Python version, every file path it opens, and your tests, and ends in a green or red checklist.                                      |
| Language intelligence   | pyright over LSP (optional): completion, problems at Essential / Standard / Strict, hover docs plus the live value, go-to-definition, references, rename.                            |
| Python environments     | Finds the project's `.venv`, uv and Homebrew Pythons before the system one, warns when you are on the system Python, and creates a `.venv` with uv in one click.                     |
| Handouts                | Open a `.docx` assignment in a tab next to your code.                                                                                                                                |
| Theming as data         | Every colour, font, spacing and radius is a token in a JSON file. Editor, chrome, output and plots theme together.                                                                   |

Every notice is a fixed, hand-written rule that runs on your machine. Nothing
is sent anywhere. A debugger is next on the [roadmap](docs/ROADMAP.md).

## Everyday features

Everything is a command: reachable from the menus, the command palette
(Ctrl+Shift+P), or a key. The most used ones:

| Key                   | Does                                                  |
| --------------------- | ----------------------------------------------------- |
| F5 / Ctrl+Enter       | Run the current file; Shift+F5 stops it               |
| F6                    | Check the current file before submitting              |
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

## Install

Download the file for your system from the
[latest release](https://github.com/elwoodradley/spawn/releases/latest).
You also need Python 3.9 or newer; [uv](https://docs.astral.sh/uv/) is
recommended and lets SPAWN create a project environment for you.

- **macOS** (Apple Silicon and Intel): `SPAWN_x.y.z_universal.dmg`. Open it
  and drag SPAWN to Applications. The app is not yet signed with an Apple
  developer certificate, so the first launch is blocked: right-click SPAWN in
  Applications, choose Open, then Open again. If macOS says the app "is
  damaged", run this once in Terminal and open it normally:

  ```
  xattr -dr com.apple.quarantine /Applications/SPAWN.app
  ```

- **Windows** 10 or 11: `SPAWN_x.y.z_x64-setup.exe` (or the `.msi`). The
  installer is not signed yet, so SmartScreen may warn: choose More info,
  then Run anyway.
- **Linux**: `.deb` for Debian and Ubuntu, `.rpm` for Fedora and openSUSE, or
  the `.AppImage` for anything else (`chmod +x` it and run it).

**Autocomplete and problem checks** need pyright. SPAWN works without it and
offers to run it through uv on first launch. To install it yourself:

```
uv tool install pyright
```

or `brew install pyright` on macOS, or `sudo pacman -S pyright` on Arch.

### Build from source

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

## How it was made

SPAWN is designed, directed and tested by Stone Toad. The code is written
with Claude, Anthropic's AI model, and every commit says so in a
`Co-Authored-By` line. The app itself contains no AI features.

## License

MIT. See [LICENSE](LICENSE).
