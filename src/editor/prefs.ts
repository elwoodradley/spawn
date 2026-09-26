/**
 * Editor preferences from settings, as CodeMirror compartments. One set of
 * compartments is shared by every document state; the live view is
 * reconfigured when settings change or a document is swapped in.
 */
import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  lineNumbers,
} from "@codemirror/view";

import type { Settings } from "../app/settings";

export type EditorPrefs = Settings["editor"];

const tabSizeCompartment = new Compartment();
const wrapCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();
const activeLineCompartment = new Compartment();

function tabSizeExtension(prefs: EditorPrefs): Extension {
  return [indentUnit.of(" ".repeat(prefs.tabSize)), EditorState.tabSize.of(prefs.tabSize)];
}

function wrapExtension(prefs: EditorPrefs): Extension {
  return prefs.wordWrap ? EditorView.lineWrapping : [];
}

function lineNumbersExtension(prefs: EditorPrefs): Extension {
  return prefs.lineNumbers ? lineNumbers() : [];
}

function activeLineExtension(prefs: EditorPrefs): Extension {
  return prefs.highlightActiveLine ? [highlightActiveLine(), highlightActiveLineGutter()] : [];
}

/** Extensions for a new document state. */
export function prefsExtensions(prefs: EditorPrefs): Extension[] {
  return [
    tabSizeCompartment.of(tabSizeExtension(prefs)),
    wrapCompartment.of(wrapExtension(prefs)),
    lineNumbersCompartment.of(lineNumbersExtension(prefs)),
    activeLineCompartment.of(activeLineExtension(prefs)),
  ];
}

/** Push current preferences into a live view. */
export function applyEditorPrefs(view: EditorView, prefs: EditorPrefs): void {
  view.dispatch({
    effects: [
      tabSizeCompartment.reconfigure(tabSizeExtension(prefs)),
      wrapCompartment.reconfigure(wrapExtension(prefs)),
      lineNumbersCompartment.reconfigure(lineNumbersExtension(prefs)),
      activeLineCompartment.reconfigure(activeLineExtension(prefs)),
    ],
  });
}
