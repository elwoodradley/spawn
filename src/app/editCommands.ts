/**
 * Edit-menu commands. They forward to CodeMirror on the live editor. Keys
 * are mostly left to CodeMirror's own keymap, which runs first when the
 * editor has focus; the menu shows those chords as hints.
 */
import { redo, selectAll, undo } from "@codemirror/commands";
import { gotoLine, openSearchPanel } from "@codemirror/search";

import { runEditorCommand } from "../editor/view";
import { DOCX_FIND_EVENT } from "../viewer/DocxView";
import { isViewerPath } from "../viewer/docx";
import { registerCommands, type Command } from "./commands";
import { activeFilePath } from "./state";

const hasEditor = () => activeFilePath() !== null;

/** Chords CodeMirror binds itself; shown in menus, not registered globally. */
export const EDITOR_HINTS = {
  undo: "Mod-Z",
  redo: "Mod-Shift-Z",
  selectAll: "Mod-A",
  gotoLine: "Alt-G",
} as const;

const editCommands: Command[] = [
  { id: "edit.undo", title: "Undo", enabled: hasEditor, run: () => void runEditorCommand(undo) },
  { id: "edit.redo", title: "Redo", enabled: hasEditor, run: () => void runEditorCommand(redo) },
  {
    id: "edit.find",
    title: "Find",
    keys: "Mod-F",
    enabled: () => hasEditor() || isViewerPath(activeFilePath()),
    run: () => {
      // A handout tab has its own find box; the editor has CodeMirror's panel.
      if (isViewerPath(activeFilePath())) {
        window.dispatchEvent(new CustomEvent(DOCX_FIND_EVENT));
        return;
      }
      void runEditorCommand(openSearchPanel);
    },
  },
  {
    id: "edit.replace",
    title: "Find and replace",
    keys: "Mod-H",
    enabled: hasEditor,
    run: () => void runEditorCommand(openSearchPanel),
  },
  {
    id: "edit.selectAll",
    title: "Select all",
    enabled: hasEditor,
    run: () => void runEditorCommand(selectAll),
  },
  {
    id: "edit.gotoLine",
    title: "Go to line",
    enabled: hasEditor,
    run: () => void runEditorCommand(gotoLine),
  },
];

export function registerEditCommands(): () => void {
  return registerCommands(editCommands);
}
