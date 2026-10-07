# Changelog

All notable changes to SPAWN. Generated from commit history by git-cliff.

## [Unreleased]

### Added

- **editor:** CodeMirror editor, project tree, tabs, command palette, session
- **run:** Run files inside SPAWN with live output and stdin
- Toad app icon and Linux user install script
- **editor:** Menu bar, open file, recents, drag and drop, tree file operations
- **run:** Run panel with live metric curves and ML environment chrome
- **theme:** Minimalist flat toad icon
- Typed settings core with font, size and zoom overrides over the theme
- Settings dialog, zoom, editor prefs, autosave, toasts, tabs, quick open, find in files, output tools
- **console:** Display protocol and stub client for the persistent kernel
- **console:** Persistent kernel with stdlib-only script, authenticated local socket, interrupt
- **console:** Cells, run-in-console commands, rich output blocks, variables pane
- **console:** Confusion matrix, image grid and dict/records table renderers in the kernel
- **console:** Matrix and image-grid blocks with clickable cells and sample lists
- **run:** Train vs val overlay with shaded gap, run history and overlays
- **editor:** Hover a name to inspect it in the Interactive Console
- **env:** Browse for any interpreter and remember it per project
- **viewer:** Open .docx handouts as readable tabs
- **lsp:** Byte-accurate stdio transport for language servers, client factory, diagnostic levels
- **lsp:** Pyright language intelligence with student-friendly diagnostic levels
- **run:** Run a file from its own folder by default
- **env:** Search .venv, uv and Homebrew before system Python
- **console:** Announce finished execs with their variables
- **run:** Remember each run's code and explain what changed between two runs
- **console:** Check new datasets for common problems
- **run:** Record nan and inf metrics as events instead of dropping them
- **output:** Flag overfitting, NaN, exploding and stalled loss above the charts
- **console:** Variables report device, DataFrame size and model summaries
- **editor:** Show each assignment's value beside its line after a console run
- **console:** Hardware nudges after a run
- **check:** Add Check Before Submitting with fresh run, Python version, path and test checks
- **output:** Explain common errors under the traceback, with a fix button

### Fixed

- **theme:** Use Adwaita Sans and a real UI font stack instead of system-ui
- **run:** Run panel axes, value range, end labels, and rate from epoch lines
- **run:** Run panel promotes only real series, fits the axis around spikes, repels labels
- **ui:** Splitters get a real grab zone, a grip, double-click reset, and keyboard resize
- **output:** The run button says Run
- **editor:** Enter only accepts a completion that changes the text
- **editor:** Keep scroll, cursor, selection and undo per tab
- **ui:** Make the sidebar handle grabbable and add a collapse toggle
- **output:** Cap bounded metrics at 1.0 and space the x-axis unit
- **check:** Resolve parent-directory paths and treat no tests found as a note
- **console:** Stop repeating the exception line under a traceback

### Changed

- Standard terminology everywhere a user can see it

### Documentation

- README, CONTRIBUTING, architecture, theme guide, research notes, CI
- Describe the Interactive Console, its transport, interrupt and security model
- User guide with audience, workflow and every shortcut; move output resize keys off CodeMirror's multi-cursor chords
- Status line reflects green CI on all three platforms
- Describe working directory, interpreter order, tab state and metric caps
- Describe the check, error cards, inline values, dataset checks, training notes, compare and nudges
- Map the notices layer in ARCHITECTURE and record it in the roadmap

### Internal

- Scaffold SPAWN with Rust process layer, theme system, and command registry
- Add module contracts as stubs for parallel Phase 1 work
- Generate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Regenerate changelog
- Point the project at github.com/elwoodradley/spawn and state the platform status
- Format two files Prettier flagged in CI

