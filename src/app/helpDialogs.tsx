/** Help-menu dialogs: shortcuts, about, and where themes live. */
import { For } from "solid-js";

import pkg from "../../package.json";
import { showDialog } from "../ui/Dialog";
import { listCommands } from "./commands";
import { chordLabel } from "./keybindings";
import { EDITOR_HINTS } from "./editCommands";

export const REPO_URL = "https://github.com/elwoodradley/spawn";

const EDITOR_ROWS: Array<[string, string]> = [
  ["Undo / Redo", `${chordLabel(EDITOR_HINTS.undo)} / ${chordLabel(EDITOR_HINTS.redo)}`],
  ["Select all", chordLabel(EDITOR_HINTS.selectAll)],
  ["Go to line", chordLabel(EDITOR_HINTS.gotoLine)],
  ["Indent / dedent selection", "Tab / Shift+Tab"],
  ["Toggle fold", chordLabel("Ctrl-Shift-[")],
];

/** Every command with a chord, plus the editor's own keys, for tables. */
export function shortcutRows(): Array<readonly [string, string]> {
  const rows = listCommands()
    .filter((c) => c.keys && !c.hidden)
    .map((c) => [c.title, chordLabel(c.keys ?? "")] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return [...rows, ...EDITOR_ROWS];
}

export function showShortcuts(): void {
  showDialog({
    title: "Keyboard shortcuts",
    wide: true,
    content: (
      <table>
        <tbody>
          <For each={shortcutRows()}>
            {([title, keys]) => (
              <tr>
                <td>{title}</td>
                <td>{keys}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    ),
  });
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable; the text is still on screen */
  }
  return true;
}

export function showAbout(): void {
  showDialog({
    title: "About SPAWN",
    content: (
      <>
        <p>
          <strong>SPAWN {pkg.version}</strong>
        </p>
        <p>A Python IDE for machine learning work. Open source, MIT licensed.</p>
        <p>
          Source, issues and docs: <code>{REPO_URL}</code>
        </p>
        <p>Made by Stone Toad.</p>
      </>
    ),
    actions: [
      { label: "Copy link", run: () => copy(REPO_URL) },
      { label: "Close", primary: true },
    ],
  });
}

export function showThemeFolder(dir: string): void {
  showDialog({
    title: "Your themes",
    content: (
      <>
        <p>
          Drop theme files (JSON) into this folder, then run “Reload themes” from the View menu:
        </p>
        <p>
          <code>{dir}</code>
        </p>
        <p>Every shipped theme in the repo’s themes/ folder is a template you can copy.</p>
      </>
    ),
    actions: [
      { label: "Copy path", run: () => copy(dir) },
      { label: "Close", primary: true },
    ],
  });
}
