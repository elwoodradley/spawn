# Contributing to SPAWN

The goal is that you can contribute without asking the maintainer anything.
If something here is missing or wrong, that is a bug: open an issue or fix it.

## Prerequisites

Everywhere: [rustup](https://rustup.rs) (stable toolchain), Node 22 or newer,
and [uv](https://docs.astral.sh/uv/) for Python environments.

### Arch Linux

```
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg xdotool rustup
rustup default stable
```

### Debian and Ubuntu

```
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### macOS

Xcode command line tools: `xcode-select --install`.

### Windows

Visual Studio Build Tools with the C++ workload, and the WebView2 runtime
(already present on Windows 10 and 11).

The authoritative list is the
[Tauri prerequisites page](https://v2.tauri.app/start/prerequisites/).

## Dev loop

```
npm install
npm run tauri dev
```

The first Rust build takes a few minutes; later ones are incremental. Vite
hot-reloads the frontend; Rust changes rebuild and relaunch the window.

Before you push:

```
npm run check
```

That runs, in order: eslint, tsc, vitest, clippy (warnings are errors), rustfmt
check, cargo test. Individual pieces: `npm run lint`, `npm test`,
`npm run rust:lint`, `npm run rust:test`. Format with `npm run fmt` and
`cargo fmt --manifest-path src-tauri/Cargo.toml`.

The docs use plain commands. No bash heredocs anywhere, because the maintainer
lives in fish.

## Terminology

User-facing text uses standard Python and IDE terms, the ones a student meets
in course material, documentation and other editors: **Project** (the folder
SPAWN has open), **Session** (what is restored on launch), **Python
Interpreter** / **Select Python Interpreter**, **Interactive Console** (the
persistent kernel), **Run** / **Run File** / **Run Cell** / **Run Selection**,
**Error** / **Traceback**, **Variables** pane, **Metrics** tab. Do not invent
names for things that already have one. The app itself is called SPAWN; its
personality comes from design, not vocabulary.

Some internal identifiers still carry older names from before this rule:
`src/brood/` (project tree), `src/pool/` (Interactive Console), `src/spawn/`
(run controller), `clutch.ts` (session), `croak.ts` (traceback parsing),
command ids such as `brood.open`, and the CSS variable `--sp-color-croak`.
Leave them until a deliberate migration; never let them leak into UI strings.
New code uses conventional names.

## Conventions

### Commits

[Conventional commits](https://www.conventionalcommits.org/). The changelog is
generated from them by git-cliff, so the subject line is user-facing text.

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `ci`,
`build`, `style`.

Scopes: `run`, `console`, `project`, `session`, `editor`, `output`, `env`,
`lsp`, `tests`, `git`, `viewer`, `theme`, `rust`, `ci`, `docs`. Older scopes
(`spawn`, `pool`, `brood`, `clutch`) remain valid for history and for code
that still lives in those modules.

```
feat(output): link traceback frames to file and line
fix(rust): keep incomplete UTF-8 tail between pipe reads
feat(console): render polars DataFrames as tables
```

Never hand-edit `CHANGELOG.md`. Run `npm run changelog` (needs
[git-cliff](https://git-cliff.org)) to regenerate it; the release workflow does
this automatically.

### Code

- TypeScript: no `any`. ESLint enforces it, along with no floating promises
  and inline type imports.
- Rust: no `unwrap()` or `expect()` outside `#[cfg(test)]`. Clippy denies
  them, plus `panic!` and `dbg!`. Recover or return an `Error`.
- Files stay around 300 lines. If a file must be longer, say why in the PR.
- Modules have one direction of dependency. `src/ipc` is the only place that
  imports `@tauri-apps/*`. `src/ui` knows nothing about Tauri. `src/theme`
  depends only on its schema. See
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- CSS: every colour, font, size, spacing and radius is a `--sp-*` token written
  by the theme system. No literals in stylesheets under `src/`.
- Tests ship with the feature, not after. Vitest for `src/`, `cargo test` for
  `src-tauri/`. Pure logic (output parsing, tree model, theme tokens) is tested
  directly; keep the Tauri runtime out of tests by going through `src/ipc`
  wrappers that tests can mock.

### Adding a command

Every user action is a command in the registry (`src/app/commands.ts`).
Buttons, menus, the palette and keybindings all go through `runCommand`.

1. Register it with a stable dotted id, a palette title, an optional chord
   (`Mod-S`, `Shift-F5`; `Mod` is Ctrl on Linux/Windows, Cmd on macOS) and
   optionally `enabled`.
2. Register it once at startup next to its module's other commands.
3. Add a test if the `run` function has logic worth testing; the registry and
   chord parser are already covered.

### Adding a built-in theme

1. Write `themes/<name>.json` following [docs/THEMES.md](docs/THEMES.md).
2. Import it in `src/theme/builtin.ts` and add it to `builtinThemes`.
3. Run `npm test`. The theme suite validates every shipped theme and checks
   that each syntax key has a colour.

### Adding a Tauri command (Rust side)

See "Adding a backend command" in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Both sides change: the Rust
function and handler list, and a typed wrapper under `src/ipc`.

## Pull requests

Use the template. Keep PRs to one phase and one scope where possible. CI runs
lint, tests and a build on Linux, macOS and Windows; all must pass.
