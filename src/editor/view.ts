/**
 * The one live EditorView, so menus and commands can act on the editor
 * without the component tree passing it around.
 */
import type { Command } from "@codemirror/view";
import { createSignal } from "solid-js";
import type { EditorView } from "@codemirror/view";

const [activeView, setActiveView] = createSignal<EditorView | null>(null);
export { activeView, setActiveView };

/** Focus the editor and run a CodeMirror command on it. False if no editor. */
export function runEditorCommand(command: Command): boolean {
  const view = activeView();
  if (!view) return false;
  view.focus();
  return command(view);
}
