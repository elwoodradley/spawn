/**
 * App chords that CodeMirror's default keymap would otherwise take while the
 * editor has focus (it calls preventDefault, so the window-level dispatcher
 * never sees them): Mod-Enter inserts a blank line, Mod-I selects the parent
 * syntax node. Also Alt-G for Go to line, which the menus and the guide
 * promise but CodeMirror binds as Mod-Alt-G.
 */
import { gotoLine } from "@codemirror/search";
import { Prec, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";

import { getCommand, runCommand } from "../app/commands";

/** Run a command when it is available; otherwise leave the key to the editor. */
function runIfEnabled(id: string): boolean {
  const command = getCommand(id);
  if (!command || command.enabled?.() === false) return false;
  void runCommand(id);
  return true;
}

export function appKeys(): Extension {
  return Prec.high(
    keymap.of([
      { key: "Mod-Enter", run: () => runIfEnabled("spawn.runAlt") },
      { key: "Mod-i", run: () => runIfEnabled("output.focusStdin") },
      { key: "Alt-g", run: gotoLine },
    ]),
  );
}
