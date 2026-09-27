## Summary

<!-- What changes and why, in a few sentences. Link the issue if there is one. -->

## Phase and scope

<!-- Phase 1 / 2 / 3 / 3.5 / 4 / 5 / 6. Scope: run, console, project, session, editor, output, env, lsp, tests, git, viewer, theme, rust, ci, docs. -->

## Checklist

- [ ] Title is a conventional commit (`feat(output): ...`, `fix(rust): ...`)
- [ ] Tests added or updated (Vitest for `src/`, `cargo test` for `src-tauri/`)
- [ ] `npm run check` passes locally
- [ ] Docs updated where behaviour changed (README, ARCHITECTURE, THEMES)
- [ ] User-facing text uses standard terminology (Project, Session, Python Interpreter, Interactive Console, Run, Error/Traceback); no invented names
- [ ] No literal colours, fonts or sizes in CSS; every value is a `--sp-*` token
- [ ] No `any` in TypeScript; no `unwrap()`/`expect()` outside Rust tests
- [ ] Any file over ~300 lines is justified below

## Notes for the reviewer

<!-- Anything you were unsure about, trade-offs, or things to test by hand. -->
