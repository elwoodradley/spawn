/**
 * The output area: one header (status, command, Spawn/Stop, Clear) and two
 * tabs under it. "Output" is the console with stdin; "Run" is the live
 * metrics view. The Run tab opens itself the first time a spawn prints a
 * metric, unless the user has picked a tab by hand this session.
 */
import { createEffect, createSignal, on, Show } from "solid-js";

import { activeFilePath } from "../app/state";
import { baseName } from "../ipc";
import {
  elapsedMs,
  exitCode,
  metrics,
  outcome,
  output,
  spawnCommand,
  spawnFile,
  spawnStatus,
  stopSpawn,
} from "../spawn/controller";
import OutputConsole from "./OutputConsole";
import "./OutputPanel.css";
import RunPanel from "./RunPanel";

type Tab = "output" | "run";

const [tab, setTab] = createSignal<Tab>("output");
let userPicked = false;

export function showOutputTab(next: Tab): void {
  userPicked = true;
  setTab(next);
}

export default function OutputPanel() {
  createEffect(
    on(
      () => metrics.series.length,
      (count) => {
        if (count > 0 && !userPicked && spawnStatus() === "running") setTab("run");
      },
    ),
  );

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
        <div class="sp-output__tabs" role="tablist">
          <TabButton id="output" label="Output" current={tab()} />
          <TabButton id="run" label="Run" current={tab()} badge={metrics.series.length} />
        </div>
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
      <Show when={tab() === "output"} fallback={<RunPanel />}>
        <OutputConsole />
      </Show>
    </section>
  );
}

function TabButton(props: { id: Tab; label: string; current: Tab; badge?: number }) {
  return (
    <button
      role="tab"
      class="sp-output__tab"
      classList={{ "is-active": props.current === props.id }}
      aria-selected={props.current === props.id}
      onClick={() => showOutputTab(props.id)}
    >
      {props.label}
      <Show when={(props.badge ?? 0) > 0}>
        <span class="sp-output__tab-badge">{props.badge}</span>
      </Show>
    </button>
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
