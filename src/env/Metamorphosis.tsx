/**
 * Metamorphosis: the interpreter switcher. A popover above the status bar
 * listing every Python SPAWN found, where it came from, and a refresh button.
 */
import { createEffect, For, onCleanup, Show } from "solid-js";

import { brood } from "../app/state";
import "./Metamorphosis.css";
import { pathExists } from "../ipc";
import { createProjectVenv, creatingVenv } from "./venv";
import { createResource } from "solid-js";
import {
  browseInterpreter,
  candidates,
  envError,
  interpreterWarning,
  projectHasVenv,
  uvAvailable,
  interpreterInfo,
  refreshInterpreters,
  refreshing,
  selectInterpreter,
  selectedInterpreter,
  setMetamorphosisOpen,
  SOURCE_LABELS,
  metamorphosisOpen,
} from "./store";

export default function Metamorphosis() {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") setMetamorphosisOpen(false);
  };
  // Opened from the status bar, focus stays outside the popover, so listen on
  // the window: Escape must close it wherever focus is.
  createEffect(() => {
    if (!metamorphosisOpen()) return;
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });
  const [hasPyproject] = createResource(
    () => (metamorphosisOpen() ? brood() : null),
    async (root) => (root ? pathExists(`${root}/pyproject.toml`) : false),
  );
  const offerVenv = () => brood() !== null && uvAvailable() !== null && !projectHasVenv();

  return (
    <Show when={metamorphosisOpen()}>
      <div class="sp-meta__backdrop" onClick={() => setMetamorphosisOpen(false)} />
      <div class="sp-meta" role="dialog" aria-label="Select Python Interpreter">
        <header class="sp-meta__header">
          <span class="sp-meta__title">Select Python Interpreter</span>
          <button
            class="sp-meta__refresh"
            disabled={refreshing()}
            onClick={() => void refreshInterpreters(brood())}
          >
            {refreshing() ? "Looking…" : "Refresh"}
          </button>
        </header>
        <Show when={candidates().length === 0}>
          <p class="sp-meta__empty">
            No Python found. Install uv or create a .venv in the project.
          </p>
        </Show>
        <Show when={interpreterWarning()}>{(w) => <p class="sp-meta__warning">{w()}</p>}</Show>
        <Show when={offerVenv()}>
          <div class="sp-meta__create">
            <span class="sp-meta__create-text">This project has no environment of its own.</span>
            <button
              class="sp-meta__action"
              disabled={creatingVenv()}
              title={`Runs: uv venv (in ${brood() ?? ""})`}
              onClick={() => void createProjectVenv(false)}
            >
              {creatingVenv() ? "Working…" : "Create .venv with uv"}
            </button>
            <Show when={hasPyproject()}>
              <button
                class="sp-meta__action"
                disabled={creatingVenv()}
                title={`Runs: uv sync (in ${brood() ?? ""}) — creates .venv and installs the dependencies from pyproject.toml`}
                onClick={() => void createProjectVenv(true)}
              >
                {creatingVenv() ? "Working…" : "uv sync (create + install dependencies)"}
              </button>
            </Show>
          </div>
        </Show>
        <ul class="sp-meta__list">
          <For each={candidates()}>
            {(candidate) => (
              <li>
                <button
                  class="sp-meta__item"
                  classList={{ "is-selected": candidate.path === selectedInterpreter() }}
                  title={candidate.path}
                  onClick={() => {
                    void selectInterpreter(candidate.path);
                    setMetamorphosisOpen(false);
                  }}
                >
                  <span
                    class="sp-meta__source"
                    classList={{ "is-system": candidate.source === "system" }}
                  >
                    {SOURCE_LABELS[candidate.source]}
                  </span>
                  <span class="sp-meta__path mono">{shorten(candidate.path)}</span>
                  <Show
                    when={candidate.path === selectedInterpreter() && interpreterInfo()}
                    fallback={
                      <Show when={candidate.version}>
                        {(v) => <span class="sp-meta__version">Python {v()}</span>}
                      </Show>
                    }
                  >
                    {(info) => <span class="sp-meta__version">Python {info().version}</span>}
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
        <button
          class="sp-meta__browse"
          title="Choose any Python, for example a venv outside this project"
          onClick={() => {
            void browseInterpreter();
            setMetamorphosisOpen(false);
          }}
        >
          Browse for a Python…
        </button>
        <Show when={envError()}>{(err) => <p class="sp-meta__croak">{err()}</p>}</Show>
      </div>
    </Show>
  );
}

/** Keep the tail of a long path readable: `…/.venv/bin/python`. */
function shorten(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-3).join("/")}`;
}
