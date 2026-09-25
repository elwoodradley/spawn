/**
 * CodeMirror wiring. One place lists the extensions every SPAWN document
 * gets, so behaviour is identical across tabs and easy to audit.
 */
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";

import { spawnEditorTheme } from "../theme/codemirror";
import type { Theme } from "../theme/schema";

/** Holds the editor theme; reconfigured when the app theme changes. */
export const themeCompartment = new Compartment();

export const PYTHON_INDENT = "    ";

export function baseExtensions(appearance: Theme["appearance"]): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    history(),
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of(PYTHON_INDENT),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ top: true }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    python(),
    themeCompartment.of(spawnEditorTheme(appearance)),
  ];
}

/** A document state with a per-document update listener. */
export function createDocumentState(
  text: string,
  appearance: Theme["appearance"],
  onUpdate: (update: ViewUpdate) => void,
): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [...baseExtensions(appearance), EditorView.updateListener.of(onUpdate)],
  });
}

/** The single view; documents are swapped into it with `setState`. */
export function createView(parent: HTMLElement, appearance: Theme["appearance"]): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [...baseExtensions(appearance), EditorView.editable.of(false)],
    }),
  });
}

/** Swap the theme in a live view. */
export function applyEditorTheme(view: EditorView, appearance: Theme["appearance"]): void {
  view.dispatch({ effects: themeCompartment.reconfigure(spawnEditorTheme(appearance)) });
}
