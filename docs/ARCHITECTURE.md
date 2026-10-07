# SPAWN architecture

For someone who has never seen this repo.

## The two halves

SPAWN is a [Tauri v2](https://v2.tauri.app) app. That means two processes:

- **The Rust host** (`src-tauri/`). Owns the OS window, spawns child
  processes, reads and writes files through Tauri plugins, and exposes a small
  set of _commands_ the frontend can invoke.
- **The webview** (`src/`). A TypeScript app built with SolidJS and CodeMirror
  6, rendered by the platform's web engine: WebKitGTK on Linux, WKWebView on
  macOS, WebView2 on Windows. Everything the user sees and every decision about
  what to run lives here.

They talk over Tauri's IPC. The frontend calls `invoke("command_name", args)`;
for streaming data the frontend hands Rust a `Channel` and Rust sends ordered
messages back on it.

### Why Rust is thin

Rust does only what a webview cannot: spawn processes, touch the filesystem
outside the sandbox, and hold OS resources. Business logic (which interpreter
to use, how to parse a traceback, what a theme means) is TypeScript, because
that is where most contributors can reach it and where it can be unit-tested
without a window. The Interactive Console (Phase 2) and the language-server transport (Phase 3) reuse the same process command with different arguments; they add no new
Rust concepts.

## Module map

```
src/                         TypeScript, SolidJS
  ipc/        the ONLY place that imports @tauri-apps/*; typed wrappers
  theme/      schema -> tokens -> apply; CodeMirror theme; theme store
  app/        state (project root, tabs, active file), command registry,
              keybindings, clutch.ts (session persistence)
  editor/     CodeMirror setup, document registry, dirty tracking, save
  brood/      project tree model, file open, watcher
  viewer/     read-only tabs for .docx handouts (mammoth → sanitized HTML)
  pool/       Interactive Console: protocol (display payloads), live
              client, cell commands, Variables pane
  spawn/      run controller, output model, croak.ts (traceback parser),
              metrics parser for the Metrics panel (loss curves, tqdm, epochs),
              health.ts (training problems in words), runHistory + runStore
              (runs with code snapshots, persisted per project), compare.ts
              and diff.ts (what changed between two runs)
  output/     output console, Metrics panel with live charts, rich blocks,
              HealthStrip, CompareView
  check/      Check Before Submitting: fresh run, Python version, file
              paths, tests; pure parts over injected ports
  errors/     hand-written library of common tracebacks -> plain-words card
              with actions (install into the project env, working directory)
  dataset/    asks the console for a dataset health report for new frames
  nudges/     hardware suggestions (device, memory), dismissible
  editor/inlineValues/  assignment values beside code after a console run
  env/        Python interpreter discovery policy and selection
  ui/         menu bar, context menu, dialogs, tabs, splitter, status bar,
              palette
  styles/     base.css; reads --sp-* tokens only
themes/       shipped theme files (data, validated by tests)
src-tauri/src/
  lib.rs      builder, plugins, handler list, Linux render workaround
  error.rs    one Error type, serialised as a message string
  proc/       start a child, stream output over a Channel, stdin, kill
  pool/       pool.py (the Interactive Console kernel, stdlib only), socket
              host, interrupt; pool_health.py (dataset checks, written next
              to pool.py and imported by it on first use)
  env/        find interpreters, probe one for version and prefix; ml.rs
              probes numpy/pandas/torch/jax + device, reads system memory
src-tauri/capabilities/   what the webview may call (see Security)
```

### Naming

User-facing text uses standard terms; several internal names predate that
rule and stay until a deliberate migration:

| Internal name                     | What the UI calls it                |
| --------------------------------- | ----------------------------------- |
| `spawn/`, `spawn.*` commands      | Run                                 |
| `pool/`, `pool.py`, `pool.*`      | Interactive Console                 |
| `brood/`, `brood.*` commands      | Project                             |
| `clutch.ts`, the `clutch` setting | Session                             |
| `croak.ts`, `--sp-color-croak`    | traceback parsing, the error colour |
| `env/Metamorphosis.tsx`           | Select Python Interpreter           |

### The dependency rule

Imports go one way:

```
ui  ->  app / editor / brood / spawn / env / output  ->  ipc  ->  @tauri-apps
theme  ->  ipc (only theme/store.ts, to read user theme files)
```

`src/ui` never imports Tauri. `src/ipc` never imports UI. `src/theme` depends
on its own schema only. The payoff is that Vitest tests for the theme loader,
output parser, chord parser and tree model run in plain Node with no Tauri
runtime; only `src/ipc` needs mocking.

## Rust modules

### `proc`: running a child

`proc_spawn(request, on_event)` takes a `SpawnRequest` (program, args, cwd,
env) and a `Channel<ProcEvent>`. It spawns a tokio child with piped stdin,
stdout and stderr, stores the stdin handle and a kill sender in a registry
keyed by a SPAWN-side id (not the OS pid, which the OS can reuse), and returns
the id immediately.

Two pump tasks read stdout and stderr in 16 KiB chunks. Each chunk goes
through `Utf8Stream`, which keeps an incomplete trailing UTF-8 sequence
between reads so a multi-byte character split across two reads is never
mangled. Both pumps feed one bounded mpsc queue so the Channel has a single
writer and events stay ordered. The events:

```
Started { pid }
Stdout  { text }
Stderr  { text }
Exit    { code, signal }
Croak   { message }      something failed on our side
```

`proc_write(id, data)` writes to stdin. `proc_close_stdin(id)` drops the pipe,
which sends EOF (Python's `input()` then raises `EOFError`). `proc_kill(id)`
fires the kill sender; the run task kills the child's whole tree (`proc/kill.rs`),
waits, and still emits `Exit`. On Unix every child leads its own process group,
so `kill(-pid)` also reaches multiprocessing workers; on Windows `taskkill /T`
walks the tree. Tauri exits the process without dropping async tasks, so
`kill_on_drop` does not fire at quit: `lib.rs` kills every registered run,
console and language server on `RunEvent::Exit`.

On Windows the child is created with `CREATE_NO_WINDOW` so no console flashes
behind the IDE.

### `env`: which Python

`env_discover(project)` returns candidates most-specific first: `<project>/.venv`,
then whatever `uv python find` says in that folder, then `python3` and
`python` on PATH. `env_probe(python)` runs a one-line script that prints
executable, version, prefix and platform as JSON. `env_uv_path()` says whether
uv is installed. Policy (which one to select, persistence per project) is in
`src/env`.

At startup `env/locations.rs` appends the standard install folders
(`~/.local/bin`, `~/.cargo/bin`, `/opt/homebrew/bin`, `/usr/local/bin`,
Linuxbrew, `%APPDATA%\npm`) to SPAWN's own PATH when they exist and are
missing, because a Finder or desktop launch does not read shell rc files.

### `lib.rs`

Registers the fs, dialog and store plugins, manages the process registry, and
lists every command. `print_page` opens the platform print dialog (wry
implements it on WebKitGTK, WKWebView and WebView2); the frontend swaps in a
print stylesheet first so only the active file's source is on the page.

If `SPAWN_SAFE_RENDER=1` is set, `linux_render_compat` sets
`WEBKIT_DISABLE_DMABUF_RENDERER=1` before the webview exists. This is the
documented fix for WebKitGTK's blank window on some Wayland + driver
combinations. It is opt-in because it disables a faster rendering path.

### Lints

`Cargo.toml` denies `unwrap_used`, `expect_used`, `panic` and `dbg_macro`.
Tests opt out with `#[allow(clippy::expect_used)]` on the test module.

## Frontend modules

### `ipc`

One file per backend concern: `proc.ts` (`spawnProcess` returns a
`ProcHandle` with `write`, `closeStdin`, `kill`), `env.ts`, `fs.ts` (plugin-fs
wrappers plus synchronous `joinPath`, `baseName`, `dirName`, `extension`),
`dialog.ts`, `store.ts` (settings JSON in the app config dir, autosaved), and
`print.ts`.

### `theme`

The theme system is a pipeline:

1. `schema.ts`: a zod schema for the theme file. Every colour, font, spacing,
   radius, syntax style, plot colour and filter is a field. `parseTheme`
   returns a readable error path for a bad file.
2. `tokens.ts`: `themeToCssVars` flattens a theme to `--sp-*` custom
   properties (`--sp-color-bg`, `--sp-font-mono`, `--sp-syntax-keyword-color`,
   `--sp-plot-series-0`, `--sp-filter-editor`, ...).
3. `apply.ts`: writes the variables onto `<html>`, sets `data-appearance`
   and `color-scheme`, and injects any SVG filter markup the theme carries.
4. `codemirror.ts`: the editor theme and `HighlightStyle` reference the
   variables, not literal colours, so they are built once. The only
   theme-dependent piece is CodeMirror's `dark` flag, which the editor keeps
   in a `Compartment` and reconfigures when the appearance changes.
5. `builtin.ts` validates the shipped `themes/*.json` at import time;
   `store.ts` holds the current theme in a Solid signal, loads user themes
   from `<app config dir>/themes/*.json`, and persists the choice.

Switching a theme therefore rewrites CSS variables and, at most, one
Compartment. Nothing re-renders.

### `app`

`state.ts` holds the project root, the open tabs and the active file, and
exposes `openFile(path, line?)` which the output panel uses for traceback
links. `commands.ts` is the registry: every user action has a stable id, a
palette title, an optional chord and a `run`. `keybindings.ts` parses chords
(`Mod-S`, `Shift-F5`) and dispatches window keydown events to commands,
skipping events the editor already handled. `clutch.ts` persists the session:
the last project, open tabs, active file and layout, so the next launch
restores them.

### `editor`

`documents.ts` keeps one CodeMirror `EditorState` per open path with the
last-saved text for dirty tracking, and exposes `saveAllDirty()`,
`isDirty(path)` and a `cursorPosition` signal. The editor component mounts a
single `EditorView` and swaps states when the active tab changes.

### `brood` (the project tree)

A lazily-expanded tree model over `listDir`, refreshed from the plugin-fs
recursive watcher, and the tree component.

### `spawn` (Run), `output`, `env`

`spawn/controller.ts` exposes `spawnStatus()`, `spawnFile(path)` and
`stopSpawn()`: the Run controller. `spawn/output.ts` is the pure output model.
`spawn/croak.ts` parses Python tracebacks into frames. `output/OutputPanel.tsx`
renders them. `env/store.ts` exposes `selectedInterpreter()` and
`refreshInterpreters(project)`.

### The "notices" layer

Everything that reads a run or a console cell and says something in plain
words is rule-based and pure, so it is unit-tested with fixtures and never
consults a model or a network: `spawn/health.ts` (curves in, findings out),
`errors/match.ts` (traceback in, explanation out; actions are descriptors
that `errors/fixes.ts` turns into commands), `check/sequence.ts` (runs the
four checks over injected file and process ports), `dataset/tracker.ts`
(which console variables deserve a health request), `nudges/rules.ts`
(variables plus probe plus memory in, at most one nudge out) and
`editor/inlineValues/assignments.ts` (which lines get a value). Console-fed
features subscribe to `pool/hooks.ts` `onExecFinished`, which the live client
fires once per exec with the variable listing, so none of them patch the
runtime.

## A run, end to end

1. The user presses F5 or the Run button. Both call
   `runCommand("spawn.run")`.
2. The command calls `spawnFile(activeFilePath())`.
3. The controller calls `saveAllDirty()` so the file on disk matches the
   editor, resolves `selectedInterpreter()`, and builds the request:
   program = interpreter, args = `["-u", path]`, cwd = project root (or the
   file's folder), env includes `PYTHONUNBUFFERED=1` and
   `PYTHONIOENCODING=utf-8`.
4. `spawnProcess` creates a `Channel`, invokes `proc_spawn`, and returns a
   `ProcHandle`. The panel header shows the exact command line, so the user
   always knows which interpreter ran.
5. Rust spawns the child and starts the pumps. `ProcEvent`s arrive on the
   channel in order.
6. The controller feeds each event to the output model, which handles `\r`
   (tqdm redraws a line in place), strips ANSI colour sequences, keeps a
   bounded ring of lines, and batches updates per animation frame so a
   thousand lines a second does not lock the UI.
7. The panel renders lines by stream (stdout, stderr, stdin echo, error).
   Traceback frames become links that call `openFile(path, line)`.
8. On `Exit` the header shows the code and elapsed time; the status returns
   to idle. Stop calls `handle.kill()`.

### stdin

The panel has an input row. Enter writes the line plus `\n` through
`proc_write` and echoes it into the output. Ctrl-D calls `proc_close_stdin`,
which sends EOF.

### Why `-u` and `PYTHONUNBUFFERED`

Python block-buffers stdout when it is not a TTY. Without unbuffering, a
program that calls `input("Name: ")` would sit waiting with the prompt still
in Python's buffer, and the user would see nothing. `-u` covers the
interpreter; the env var covers subprocesses that inherit it.

## Adding a backend command

Rust side, in the relevant module:

```rust
#[tauri::command]
pub async fn project_stat(path: String) -> Result<Stat> { ... }
```

Add it to `tauri::generate_handler![...]` in `lib.rs`. If it uses a plugin
that needs a permission, add the permission to
`src-tauri/capabilities/default.json`.

TypeScript side, in `src/ipc/<concern>.ts`:

```ts
export function projectStat(path: string): Promise<Stat> {
  return invoke<Stat>("project_stat", { path });
}
```

Argument names are camelCase in TypeScript and snake_case in Rust; Tauri
converts. For streaming, take a `Channel<T>` parameter in Rust and construct
`new Channel<T>()` in TypeScript, as `proc.ts` does.

## Security

Tauri v2 gates every plugin call behind capabilities
(`src-tauri/capabilities/default.json`). SPAWN grants the fs plugin an open
scope (`**`) because an IDE opens whatever folder the user picks. The boundary
that matters is different: the webview never loads remote content, so there
is no untrusted code inside the sandbox to abuse those permissions.

## The Interactive Console (`pool/`)

The Interactive Console is SPAWN's persistent kernel: one Python process per
project that keeps state between runs, so a dataset loaded once stays loaded
while you iterate on the model. It is deliberately not Jupyter.

**Kernel.** `src-tauri/src/pool/pool.py` is a single stdlib-only script,
embedded in the binary with `include_str!` and written to the app cache dir
at first use. It runs under the selected Python interpreter, so a
bare `.venv` works with nothing installed. It executes code in one namespace
on its main thread, echoes a bare trailing expression the way IPython does
(triple-quoted docstrings excepted), and turns values into the payloads in
`src/pool/protocol.ts`: matplotlib figures (rendered on the theme's plot
colours; `plt.show()` is hooked so every figure is captured, in order),
pandas and polars tables (dtypes, null counts, stats, a first page of rows,
more on request), numpy/torch/jax arrays (shape, dtype, device, stats, a
downsampled 2D preview), anything with `_repr_html_`/`_repr_png_`/`_repr_svg_`,
and tracebacks with line numbers offset to the real file.

**Transport.** Rust (`src-tauri/src/pool/mod.rs`) binds a loopback TCP port,
generates a random token, and launches the kernel with both in its
environment. It accepts exactly one connection and drops it unless the first
line is the token; then the listener closes. Requests and events are JSON
lines. The kernel's own stdout and stderr are the same pipes a plain run
uses, so prints stream to the console like before. Rust never interprets the
protocol; it is a pipe with an id.

**Interrupt.** Two mechanisms, because one is not enough: an `interrupt` line
on the socket makes the kernel's reader thread raise `KeyboardInterrupt` in
the main thread (works everywhere, including Windows), and on Unix Rust also
sends SIGINT so a blocking call such as `time.sleep` wakes up.

**Frontend.** `src/pool/live.ts` implements `PoolClient`: it starts the kernel
lazily on the first exec, matches replies by id, streams display events into
the output model (`src/output/rich/attach.ts`), sends the theme's plot tokens
on start and on theme change, and shuts the kernel down when the interpreter
changes. `src/editor/cells.ts` finds `# %%` cells; `src/pool/commands.ts`
owns Shift+Enter and friends; `src/pool/VariablesPane.tsx` lists the
namespace. Rich blocks live in `src/output/rich/`.

**Security.** The kernel runs the user's code with the user's privileges,
exactly like F5. Only the child can connect to the socket (token, loopback,
single accept). Library HTML renders in an iframe sandboxed with
`allow-scripts` only: an opaque origin, so it cannot reach the app's DOM or
the Tauri bridge; it reports its height by postMessage, which the parent
accepts only from that frame. Inline SVG (figures, hover) passes through
DOMPurify's SVG profile first. Hover and pane
inspection evaluate dotted names only, never expressions, so looking at a
value cannot run code.

**Size note.** Two files sit past the ~300 line guideline on purpose.
`src-tauri/src/env/discover.rs` holds the whole interpreter search order in
one place (venv, uv-resolved, uv-managed, Homebrew, pyenv, PATH, system) with
its path classifier and tests, because the order is the policy and reading
it split across files would hide that. And `pool.py` is the one script allowed
past the guideline: it must stay a single stdlib-only script so it can be
embedded and shipped as-is, and splitting it would mean shipping and
importing a package from the cache dir. It is organised in sections
(transport, JSON safety, displays, detectors, namespace, main loop) and
covered end to end by `pool_test.py`.

**Testing without SPAWN.** `python src-tauri/src/pool/pool_test.py <python>`
hosts the kernel from a tiny socket server and checks echo, persistence,
tracebacks, inspect, tables, figures, arrays, both interrupt paths and clean
shutdown.

## Roadmap and honest risks

**Phase 1** (done): window, project tree, tabs, editor, Run with streamed
output and stdin, theming. Usable for coursework.

**Phase 2** (in progress): the Interactive Console, cells and selections,
inline plots, DataFrame viewer, array cards, editor hover, confusion matrix,
image grids, dict tables, train-vs-val overlay and run comparison in the
Metrics panel are in. Still to come on top of the console: module trees,
scatter, attention, histograms. See `docs/ROADMAP.md` for Phases 3 to 6.

**Phase 3**: pyright over LSP. `@codemirror/lsp-client` (an official
CodeMirror package) owns document sync, position mapping and request
correlation behind a small `Transport` interface; our work is a stdio
transport over `proc` and pyright's lifecycle. Whether it sends incremental or
full-text changes is still to be confirmed.

**Phase 4**: debugger over DAP with debugpy.

Risks to keep in view:

- **Three webview engines.** WebKitGTK, WKWebView and WebView2 render
  differently. CI builds on all three catch compile errors, not visual ones.
  Test on each before a release.
- **Output floods.** A training loop printing thousands of lines per second
  must not lock the panel. The output model is bounded and batched from day
  one; keep it that way.
- **The tensor hover sees live state only.** It evaluates the hovered name in
  the Interactive Console, so it works for variables that have already run, never for code
  that has not executed. The UI must make that obvious.
- **Plotly is heavy.** Its JavaScript bundle is several megabytes. Bundling it
  breaks the small-binary goal; loading it from the user's Python environment
  at runtime is the likely answer. Decide in Phase 2.
- **Console reliability.** Users of other tools report kernels that "stop
  working until restart". The console needs an explicit restart and a visible
  health indicator, not just a hope.
