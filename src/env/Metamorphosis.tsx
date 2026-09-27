/**
 * Metamorphosis: the interpreter switcher. A popover above the status bar
 * listing every Python SPAWN found, where it came from, and a refresh button.
 */
import { For, Show } from "solid-js";

import { brood } from "../app/state";
import "./Metamorphosis.css";
import {
  browseInterpreter,
  candidates,
  envError,
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

  return (
    <Show when={metamorphosisOpen()}>
      <div class="sp-meta__backdrop" onClick={() => setMetamorphosisOpen(false)} />
      <div
        class="sp-meta"
        role="dialog"
        aria-label="Select Python Interpreter"
        onKeyDown={onKeyDown}
      >
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
                  <span class="sp-meta__source">{SOURCE_LABELS[candidate.source]}</span>
                  <span class="sp-meta__path mono">{shorten(candidate.path)}</span>
                  <Show when={candidate.path === selectedInterpreter() && interpreterInfo()}>
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
