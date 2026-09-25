/**
 * Status bar: the environment awareness strip. Brood and spawn state on the
 * left; cursor, interpreter, uv, and theme on the right.
 */
import { Show } from "solid-js";

import { runCommand } from "../app/commands";
import { brood } from "../app/state";
import { cursorPosition } from "../editor/documents";
import Metamorphosis from "../env/Metamorphosis";
import {
  interpreterInfo,
  selectedCandidate,
  selectedInterpreter,
  SOURCE_LABELS,
  toggleMetamorphosis,
  uvAvailable,
} from "../env/store";
import { baseName } from "../ipc";
import { elapsedMs, outcome, spawnStatus } from "../spawn/controller";
import { currentTheme } from "../theme/store";
import "./StatusBar.css";

export default function StatusBar() {
  const spawnLabel = () => {
    if (spawnStatus() === "running") return `spawning · ${(elapsedMs() / 1000).toFixed(1)}s`;
    switch (outcome()) {
      case "ok":
        return "spawn finished";
      case "croak":
        return "spawn croaked";
      case "stopped":
        return "spawn stopped";
      default:
        return "idle";
    }
  };

  const interpreterLabel = () => {
    const path = selectedInterpreter();
    if (!path) return "no Python";
    const info = interpreterInfo();
    const source = selectedCandidate()?.source;
    const version = info ? `Python ${info.version}` : baseName(path);
    return source ? `${version} · ${SOURCE_LABELS[source]}` : version;
  };

  return (
    <footer class="sp-statusbar sp-no-print" classList={{ [`is-${outcome()}`]: true }}>
      <div class="sp-statusbar__group">
        <span class="sp-statusbar__item" title={brood() ?? "No brood open"}>
          {brood() ? baseName(brood() ?? "") : "no brood"}
        </span>
        <span
          class="sp-statusbar__item sp-statusbar__spawn"
          classList={{ "is-running": spawnStatus() === "running" }}
        >
          {spawnLabel()}
        </span>
      </div>
      <div class="sp-statusbar__group">
        <Show when={cursorPosition()}>
          {(pos) => (
            <span class="sp-statusbar__item">
              Ln {pos().line}, Col {pos().col}
            </span>
          )}
        </Show>
        <button
          class="sp-statusbar__item sp-statusbar__button"
          title={selectedInterpreter() ?? "Choose an interpreter"}
          onClick={() => toggleMetamorphosis()}
        >
          {interpreterLabel()}
        </button>
        <Show when={uvAvailable()}>
          {(uv) => (
            <span class="sp-statusbar__item sp-statusbar__badge" title={uv()}>
              uv
            </span>
          )}
        </Show>
        <button
          class="sp-statusbar__item sp-statusbar__button"
          title="Cycle theme"
          onClick={() => void runCommand("theme.cycle")}
        >
          {currentTheme().name}
        </button>
      </div>
      <Metamorphosis />
    </footer>
  );
}
