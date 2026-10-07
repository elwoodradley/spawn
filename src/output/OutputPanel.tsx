/**
 * The output area: one header (status, command, Spawn/Stop, Clear, more)
 * and two tabs under it. "Output" is the console with stdin; "Metrics" is the
 * live training-metrics view. The Metrics tab opens itself the first time a run prints
 * a metric, when the setting allows and the user has not picked a tab by
 * hand this session.
 */
import { createEffect, createSignal, Match, on, Show, Switch } from "solid-js";

import { runCommand } from "../app/commands";
import CheckPanel from "../check/CheckPanel";
import { settings } from "../app/settings";
import { activeFilePath } from "../app/state";
import { describeWorkingDirectory } from "../app/project";
import { baseName } from "../ipc";
import NudgeBar from "../nudges/NudgeBar";
import {
  elapsedMs,
  exitCode,
  metrics,
  outcome,
  output,
  spawnCommand,
  spawnStatus,
  stopSpawn,
} from "../spawn/controller";
import { showContextMenu } from "../ui/ContextMenu";
import Icon from "../ui/Icon";
import { cmd, separator, type MenuEntry } from "../ui/menus";
import OutputConsole from "./OutputConsole";
import "./OutputPanel.css";
import RunPanel from "./RunPanel";
import { setShowTimestamps, setWrapLines, showTimestamps, wrapLines } from "./view";

type Tab = "output" | "run" | "check";

const [tab, setTab] = createSignal<Tab>("output");
let userPicked = false;

export function showOutputTab(next: Tab): void {
  userPicked = true;
  setTab(next);
}

/** The right-click / "more" menu for the console. */
export function outputMenu(): MenuEntry[] {
  return [
    cmd("output.find"),
    cmd("output.copy"),
    cmd("output.save"),
    separator,
    {
      kind: "action",
      label: "Wrap long lines",
      checked: wrapLines(),
      run: () => {
        setWrapLines(!wrapLines());
      },
    },
    {
      kind: "action",
      label: "Show timestamps",
      checked: showTimestamps(),
      run: () => {
        setShowTimestamps(!showTimestamps());
      },
    },
    separator,
    cmd("output.clear"),
  ];
}

export default function OutputPanel() {
  createEffect(
    on(
      () => metrics.series.length,
      (count) => {
        if (
          count > 0 &&
          !userPicked &&
          settings().spawn.autoShowRunTab &&
          spawnStatus() === "running"
        ) {
          setTab("run");
        }
      },
    ),
  );

  const commandLabel = () => {
    const ran = spawnCommand();
    if (!ran) return "nothing run yet";
    return `${baseName(ran.program)} ${ran.args.map(baseName).join(" ")} · in ${describeWorkingDirectory(ran.cwd)}`;
  };

  const commandTitle = () => {
    const ran = spawnCommand();
    return ran ? `${ran.program} ${ran.args.join(" ")}\nin ${ran.cwd}` : "";
  };

  const dotState = () => (spawnStatus() === "running" ? "running" : outcome());

  const linesLabel = () => {
    const dropped = output.dropped();
    return dropped > 0 ? `${output.lines.length} lines · ${dropped} dropped` : "";
  };

  const openMore = (e: MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    showContextMenu(rect.left, rect.bottom + 2, outputMenu());
  };

  return (
    <section
      class="sp-output sp-no-print"
      aria-label="Output"
      onContextMenu={(e) => {
        if (tab() !== "output") return;
        e.preventDefault();
        showContextMenu(e.clientX, e.clientY, outputMenu());
      }}
    >
      <header class="sp-output__header">
        <div class="sp-output__tabs" role="tablist">
          <TabButton id="output" label="Output" current={tab()} />
          <TabButton id="run" label="Metrics" current={tab()} badge={metrics.series.length} />
          <TabButton id="check" label="Check" current={tab()} />
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
        <Show when={linesLabel()}>
          <span
            class="sp-output__meta sp-output__dropped"
            title="The console keeps the last 10,000 lines"
          >
            {linesLabel()}
          </span>
        </Show>
        <span class="sp-output__spacer" />
        <Show
          when={spawnStatus() === "running"}
          fallback={
            <button
              class="sp-output__button is-primary"
              disabled={!/\.pyw?$/i.test(activeFilePath() ?? "")}
              title="Run the current file (F5)"
              onClick={() => void runCommand("spawn.run")}
            >
              Run
            </button>
          }
        >
          <button
            class="sp-output__button is-stop"
            title="Stop the run (Shift+F5)"
            onClick={() => void stopSpawn()}
          >
            Stop
          </button>
        </Show>
        <button
          class="sp-output__button"
          disabled={!/\.pyw?$/i.test(activeFilePath() ?? "")}
          title="Check the current file before submitting (F6)"
          onClick={() => void runCommand("check.run")}
        >
          Check
        </button>
        <button class="sp-output__button" title="Clear the output" onClick={() => output.clear()}>
          Clear
        </button>
        <button
          class="sp-output__button sp-output__icon-button"
          title="Find in output (Ctrl+F while the output is focused)"
          aria-label="Find in output"
          onClick={() => void runCommand("output.find")}
        >
          <Icon name="search" size={14} />
        </button>
        <button
          class="sp-output__button sp-output__icon-button"
          title="More"
          aria-label="More output actions"
          onClick={openMore}
        >
          ⋯
        </button>
      </header>
      <NudgeBar />
      <Switch fallback={<RunPanel />}>
        <Match when={tab() === "output"}>
          <OutputConsole />
        </Match>
        <Match when={tab() === "check"}>
          <CheckPanel />
        </Match>
      </Switch>
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
