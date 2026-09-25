/**
 * Output panel: everything a spawn says, plus a way to talk back.
 *
 * Header: command, status dot, elapsed, exit code, Spawn/Stop, Clear.
 * Body: the line list, following the bottom unless the user scrolls up.
 * Footer: the stdin row, so input() works without leaving SPAWN.
 */
import { createEffect, on, onCleanup, Show } from "solid-js";

import { activeFilePath } from "../app/state";
import { baseName } from "../ipc";
import {
  elapsedMs,
  exitCode,
  outcome,
  output,
  spawnCommand,
  spawnFile,
  spawnStatus,
  stopSpawn,
} from "../spawn/controller";
import OutputLines from "./OutputLines";
import "./OutputPanel.css";
import StdinRow from "./StdinRow";

export default function OutputPanel() {
  let scroller: HTMLDivElement | undefined;
  let following = true;

  const onScroll = () => {
    if (!scroller) return;
    following = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
  };

  // New lines: stick to the bottom if we were already there.
  createEffect(
    on(
      () => output.lines.length,
      () => {
        if (following && scroller) scroller.scrollTop = scroller.scrollHeight;
      },
    ),
  );

  // A fresh spawn always starts at the bottom.
  createEffect(
    on(spawnStatus, (status) => {
      if (status === "running") following = true;
    }),
  );

  onCleanup(() => output.flush());

  const commandLabel = () => {
    const cmd = spawnCommand();
    if (!cmd) return "nothing spawned yet";
    return `${baseName(cmd.program)} ${cmd.args.map(baseName).join(" ")}`;
  };

  const commandTitle = () => {
    const cmd = spawnCommand();
    return cmd ? `${cmd.program} ${cmd.args.join(" ")}\nin ${cmd.cwd}` : "";
  };

  const dotState = () => (spawnStatus() === "running" ? "running" : outcome());

  return (
    <section class="sp-output sp-no-print" aria-label="Output">
      <header class="sp-output__header">
        <span class="sp-output__dot" classList={{ [`is-${dotState()}`]: true }} />
        <span class="sp-output__command mono" title={commandTitle()}>
          {commandLabel()}
        </span>
        <Show when={spawnCommand()}>
          <span class="sp-output__meta">{formatElapsed(elapsedMs())}</span>
          <Show when={exitCode() !== null}>
            <span class="sp-output__meta">exit {exitCode()}</span>
          </Show>
        </Show>
        <span class="sp-output__spacer" />
        <Show
          when={spawnStatus() === "running"}
          fallback={
            <button
              class="sp-output__button is-primary"
              disabled={activeFilePath() === null}
              title="Spawn the current file (F5)"
              onClick={() => {
                const path = activeFilePath();
                if (path) void spawnFile(path);
              }}
            >
              Spawn
            </button>
          }
        >
          <button
            class="sp-output__button is-stop"
            title="Stop the spawn (Shift+F5)"
            onClick={() => void stopSpawn()}
          >
            Stop
          </button>
        </Show>
        <button class="sp-output__button" title="Clear the output" onClick={() => output.clear()}>
          Clear
        </button>
      </header>
      <div class="sp-output__scroller" ref={(el) => (scroller = el)} onScroll={onScroll}>
        <OutputLines lines={output.lines} />
      </div>
      <StdinRow />
    </section>
  );
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`
    : `${seconds}.${tenths}s`;
}
