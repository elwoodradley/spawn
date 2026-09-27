/**
 * Smart Enter for completions.
 *
 * The completion list often offers the very word already typed (`name` after
 * typing `name`). A plain Enter would "accept" that no-op and swallow the
 * newline, which reads as broken indentation. Here Enter accepts only when
 * the selected completion would change the text; otherwise the list closes
 * and Enter inserts an indented newline as usual. Tab accepts whenever the
 * list is open, matching what students know from other editors.
 */
import {
  acceptCompletion,
  closeCompletion,
  completionStatus,
  selectedCompletion,
  type Completion,
} from "@codemirror/autocomplete";
import { insertNewlineAndIndent } from "@codemirror/commands";
import { Prec, type EditorState } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";

/** The identifier fragment immediately before `pos`. */
export function typedPrefix(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const m = /[A-Za-z_][\w]*$/.exec(before);
  return m ? m[0] : "";
}

/** Would applying this completion change the document? */
export function completionChangesText(typed: string, completion: Completion): boolean {
  const insert = typeof completion.apply === "string" ? completion.apply : completion.label;
  // A function `apply` (server text edits) may do anything; assume it matters
  // unless the label is exactly what is already there.
  if (typeof completion.apply === "function") return completion.label !== typed;
  return insert !== typed;
}

const smartEnter: Command = (view) => {
  if (completionStatus(view.state) !== "active") return false;
  const selected = selectedCompletion(view.state);
  const typed = typedPrefix(view.state, view.state.selection.main.head);
  if (selected && completionChangesText(typed, selected)) return acceptCompletion(view);
  closeCompletion(view);
  return insertNewlineAndIndent(view);
};

const tabAccept: Command = (view) => {
  if (completionStatus(view.state) !== "active" || !selectedCompletion(view.state)) return false;
  return acceptCompletion(view);
};

/** Add before the default keymaps so these win over the library's Enter. */
export function completionKeys() {
  return Prec.highest(
    keymap.of([
      { key: "Enter", run: smartEnter },
      { key: "Tab", run: tabAccept },
    ]),
  );
}
