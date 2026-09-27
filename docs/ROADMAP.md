# SPAWN roadmap and implementation plan

_Written 2026-09-26 against the Phase 2 codebase. Direction: a small, fast,
student-focused Python IDE. "Write normal Python. SPAWN makes what Python is
doing visible." No AI features, ever, in this codebase._

## Principles that decide design questions

1. Reveal, don't automate. Show the shape; never rewrite the model.
2. Real terminology everywhere a student can see it.
3. Keep normal Python visible: the command that ran, the real traceback.
4. Reduce tool friction, not intellectual friction.
5. Stay small and fast: justify every dependency by size, startup and memory.

## Architecture as it stands (what the plan builds on)

- **Rust host** (`src-tauri/src`): `proc/` spawns children and streams UTF-8
  chunks over a Tauri `Channel`; `pool/` adds an authenticated loopback socket
  for the Interactive Console; `env/` discovers interpreters and probes them.
  Rust never interprets application protocols.
- **Editor** (`src/editor`): one `EditorView`; each open file has its own
  `EditorState` built by `createDocumentState` from `baseExtensions` plus a
  per-file update listener. Theme and editor prefs live in Compartments.
- **Execution**: `src/spawn/controller.ts` (fresh process), `src/pool/live.ts`
  (console) both feed one `OutputModel`; rich values come through
  `src/pool/protocol.ts`.
- **Project state** (`src/app/state.ts`): project root, tabs, active file;
  `clutch.ts` persists the session; `recent.ts`, `settings.ts`.
- **Interpreter** (`src/env/store.ts`): candidates, per-project selection,
  ML probe, memory.
- **Docs viewer** (`src/viewer`): `.docx` → sanitized HTML.

### Architectural issues for language intelligence

1. **Framing.** LSP over stdio is `Content-Length`-framed JSON-RPC counted in
   bytes. `proc/` decodes to text, so byte counts would be lost. Fix: a small
   Rust `lsp/` module that deframes on the byte stream and forwards whole
   messages over a `Channel`, the same shape as `pool/`. Frontend never
   parses framing.
2. **Open-file model.** `@codemirror/lsp-client`'s default workspace treats
   only files with a live `EditorView` as open, and we have one view with
   swapped states. Result: `didOpen`/`didClose` on every tab switch and
   diagnostics only for the visible file. Acceptable for a first release;
   a custom `Workspace` backed by `documents.ts` (all tabs stay open, edits
   synced from each state's update listener) is the follow-up.
3. **Server acquisition.** Pyright is a Node program. Students will not have
   Node. `uv tool` can install the PyPI `pyright` package, which downloads
   its own Node on first run; system `pyright-langserver` on PATH is used
   when present. Never silently: SPAWN asks once, shows where it installs,
   and works without it (editor just has no intelligence).
4. **Interpreter coupling.** Pyright must be told the selected interpreter
   (`python.pythonPath`, `venvPath`) or imports won't resolve. Selection is
   already per project; changing it restarts the server, exactly as it
   restarts the console.
5. **Per-file extensions.** `client.plugin(uri)` is a per-state extension, so
   it slots into `createDocumentState` alongside the update listener. No
   change to the single-view design is needed.
6. **Hover.** Two hover sources will exist: Pyright's docs and the console's
   live value card. They must be one tooltip: docs first, live value beneath
   when the console is idle and knows the name.

No rewrite is needed. Nothing above requires touching `proc/`, `pool/`, the
output model or the renderers.

## A. Terminology standardization (Phase 3, first)

User-facing text only; internal identifiers keep their names until a quiet
migration (command ids such as `brood.open` stay, so saved keybindings and
settings are untouched).

| Old term        | New term                                   |
| --------------- | ------------------------------------------ |
| Brood           | Project                                    |
| Clutch          | Session                                    |
| Metamorphosis   | Python Interpreter / Select Interpreter    |
| Croak           | Error / Traceback                          |
| Pool            | Interactive Console                        |
| Spawn (action)  | Run                                        |
| Run tab (metrics) | Metrics tab (to free "Run")              |

Where: menus (`appMenus.ts`), commands' titles (`appCommands.ts`,
`spawn/commands.ts`, `pool/commands.ts`, `tabCommands.ts`, `viewCommands.ts`),
welcome, dialogs, toasts, tree, sidebar tabs, status bar, settings panes,
output header and system lines, console status, variables pane, hover card,
example files and their prints, README, CONTRIBUTING, GUIDE, ARCHITECTURE
(prose; module names stay with a mapping note), THEMES (the `croak` colour
token becomes `error`, with `croak` accepted as an alias so existing theme
files keep working), the example folder name.
Tests: string assertions in `output.test.ts`, `metrics.test.ts` and friends
updated; a lint-style test that scans UI string literals for the old words.

## B. Pyright / LSP (Phase 3)

**New modules**

- `src-tauri/src/lsp/mod.rs`: `lsp_start(program, args, cwd, on_message)`,
  `lsp_send(id, json)`, `lsp_stop(id)`; byte-accurate `Content-Length`
  deframer with tests; reuses `proc::launch`.
- `src/lsp/transport.ts`: the `Transport` object the client wants
  (send / subscribe / unsubscribe) over the IPC channel.
- `src/lsp/server.ts`: locate or install pyright (PATH → `uv tool` → offer to
  install), start per project, pass interpreter settings, restart on
  interpreter or project change, expose status for the status bar.
- `src/lsp/client.ts`: one `LSPClient` per project with `rootUri`,
  `initializationOptions`, `sanitizeHTML` (DOMPurify, already present),
  `timeout`; the per-file extension for `createDocumentState`.
- `src/lsp/diagnostics.ts`: the Essential / Standard / Strict policy.
  Essential = pyright `basic` mode plus a client-side allow-list (syntax
  errors, `reportUndefinedVariable`, `reportMissingImports`,
  `reportMissingModuleSource`, `reportCallIssue`, `reportArgumentType`,
  `reportAttributeAccessIssue`, `reportIndexIssue`, `reportOptionalSubscript`);
  Standard = pyright `standard` unfiltered; Strict = `strict`. Messages keep
  Pyright's text and rule code; a Problems list in the output area lists
  them with jump-to.
- `src/lsp/hover.ts`: merged hover (docs + live value).
- `src/lsp/commands.ts`: go to definition (F12), find references
  (Shift+F12), rename symbol later, restart language server, install pyright.

**Changed**: `createEditor.ts` (add the plugin per file), `documents.ts`
(URI per path), `settings.ts` (`lsp.diagnostics`, `lsp.enabled`),
`SettingsDialog` (Editor pane: diagnostics level), status bar item, GUIDE.

**Dependencies**: `@codemirror/lsp-client` (already installed, 6.3.0). No
new Rust crates. Pyright itself is not bundled.

**Platform**: Windows needs `pyright-langserver.cmd`/`.exe` resolution and
`CREATE_NO_WINDOW` (already in `proc`); file URIs must be built correctly
(`file:///C:/…`); macOS/Linux paths straightforward. uv tool dir differs per
OS; ask uv where it is (`uv tool dir`).

**Regression risks**: editor keystroke latency from completion requests
(debounce is the client's default; measure), duplicate hover tooltips,
diagnostics noise (why Essential is the default), server crash loops (cap
restarts, show status). Nothing in run/console paths changes.

**Tests**: Rust deframer (split frames, multi-message chunks, UTF-8 bodies);
diagnostics filter per level; URI building on both path styles; transport
request/response matching; an integration test that starts pyright on the
example project when `pyright-langserver` is available, skipped otherwise.

## C. Tests panel (Phase 3.5)

- Detection: `pytest` config or `tests/`/`test_*.py` → pytest; `unittest`
  imports → `python -m unittest`; otherwise, or when the project sets one, a
  custom command (`tester.py`) in a project file `.spawn/project.json`
  (`{"test": {"command": ["python", "tester.py"]}}`).
- Structured results: run pytest with `-p no:cacheprovider --junitxml` to a
  temp file or the `pytest-json` style `-r` output; parse JUnit XML (stdlib
  on the Python side is not needed, parse in TS). unittest via
  `-v` output parsing. Raw output always kept in the Output tab.
- UI: `src/tests/TestsPanel.tsx` as a third output tab; pass/fail list, the
  failure's expected/received when parsable, Jump to test / Jump to source
  (traceback frames), Rerun failed (`--lf` for pytest).
- Commands: Run Tests (Ctrl+Shift+T), Stop Tests, Rerun Failed, Jump to
  Failure. Reuses `proc` and the output model unchanged.

## D. Environment and packages panel (Phase 3.5)

- A sidebar tab "Environment" fed by the existing `env/store.ts` plus a new
  Rust `env_packages(python)` (runs `<python> -m pip list --format json`, or
  `uv pip list --python <python> --format json` when uv is present) and a
  package-manager detector (`uv.lock`/`pyproject.toml` → uv; `requirements.txt`
  → pip; `.venv` present or not).
- Install action: "Install pandas into .venv (uv add pandas)" with the exact
  command shown, run through `proc` with streamed output; never automatic.
  Later: a `ModuleNotFoundError` in a traceback offers the same button.
- Tests: manager detection from fixture trees; package list parsing.

## E. Scratch files (Phase 3.5)

- "Send to Scratch" on the editor context menu and Edit menu: creates
  `~/.local/share/dev.stonetoad.spawn/scratch/scratch-<n>.py` (app data dir),
  opens it as a tab marked "scratch", runs with the project interpreter and
  the project as cwd, works in the console, has language intelligence.
- "Save as…" turns it into a normal file; "Discard" deletes it. Scratch
  files are excluded from recents unless saved.

## F. Minimal Git (Phase 3.5)

- Rust: `git_status(root)`, `git_branch`, `git_diff(path)`, `git_stage`,
  `git_unstage`, `git_commit(message)`, `git_push`, `git_pull`, all by
  running the system `git` through `proc` (no libgit2 dependency: keeps the
  binary small and behaviour identical to the CLI students are taught).
- UI: tree badges (M / A / D / U), status bar `main · 2 modified`, a
  "Changes" sidebar tab with a two-column diff viewer (`@codemirror/merge`,
  already in the CodeMirror family), stage/unstage per file, a commit box,
  push/pull buttons that show git's real output.
- Not doing: rebase, cherry-pick, merge tooling, history graphs, hosting
  integrations.

## Order of work

1. Terminology (A) — one sweep, then build, tests, GUIDE.
2. LSP transport + pyright acquisition + diagnostics (B), then completion,
   hover, signatures, definition, references.
3. Tests panel (C), Environment panel (D), Scratch (E), Git (F).
4. Debugger (Phase 4), Data Explorer and PDF (Phase 5), shape tracing and
   model visualization (Phase 6).

Each step ends with `npm run check`, a release build, and a hands-on run.
