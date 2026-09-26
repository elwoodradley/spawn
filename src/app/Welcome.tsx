/** What the centre shows before a brood or file is open. */
import { For, Show } from "solid-js";

import { baseName, dirName } from "../ipc";
import { runCommand } from "./commands";
import { chordLabel } from "./keybindings";
import { recentBroods, recentFiles } from "./recent";
import { openBrood, openFile } from "./state";
import "./Welcome.css";

function RecentList(props: {
  title: string;
  items: readonly string[];
  onPick: (path: string) => void;
}) {
  return (
    <Show when={props.items.length > 0}>
      <section class="sp-welcome__recent">
        <h2>{props.title}</h2>
        <ul>
          <For each={props.items}>
            {(path) => (
              <li>
                <button class="sp-welcome__link" title={path} onClick={() => props.onPick(path)}>
                  <span class="sp-welcome__name">{baseName(path)}</span>
                  <span class="sp-welcome__dir">{dirName(path)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}

const TIPS: ReadonlyArray<[string, string]> = [
  ["Spawn the current file", "F5"],
  ["Command palette", "Mod-Shift-P"],
  ["Open a file", "Mod-O"],
  ["Send input to a running program", "Mod-I"],
  ["Settings", "Mod-,"],
];

function Tips() {
  return (
    <section class="sp-welcome__tips">
      <h2>Tips</h2>
      <ul>
        <For each={TIPS}>
          {([what, chord]) => (
            <li>
              <span>{what}</span>
              <kbd>{chordLabel(chord)}</kbd>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

export default function Welcome() {
  return (
    <div class="sp-welcome sp-chrome sp-no-print">
      <div class="sp-welcome__hero">
        <h1>SPAWN</h1>
        <p>A Python IDE for machine learning work.</p>
        <div class="sp-welcome__actions">
          <button class="sp-button" onClick={() => void runCommand("brood.open")}>
            Open a brood
          </button>
          <button class="sp-button is-secondary" onClick={() => void runCommand("file.open")}>
            Open a file
          </button>
        </div>
        <p class="sp-welcome-hint">
          A brood is a folder. Everything you spawn runs from it. You can also drop a folder or file
          onto this window.
        </p>
      </div>
      <div class="sp-welcome__lists">
        <RecentList title="Recent broods" items={recentBroods()} onPick={openBrood} />
        <RecentList
          title="Recent files"
          items={recentFiles()}
          onPick={(path) => void openFile(path)}
        />
        <Tips />
      </div>
    </div>
  );
}
