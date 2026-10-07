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
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, type ViewUpdate } from "@codemirror/view";

import { settings } from "../app/settings";
import { spawnEditorTheme } from "../theme/codemirror";
import type { Theme } from "../theme/schema";
import { appKeys } from "./appKeys";
import { cellExtensions } from "./cellDecorations";
import { lspExtensionFor } from "../lsp/server";
import { mergedHover } from "../lsp/hover";
import { completionKeys } from "./completionKeys";
import {
  inlineValuesCompartment,
  inlineValuesExtension,
  inlineValuesPath,
} from "./inlineValues/decorations";
import { prefsExtensions } from "./prefs";

/** Holds the editor theme; reconfigured when the app theme changes. */
export const themeCompartment = new Compartment();
/** Holds the language server plugin for the document's file, or nothing. */
export const lspCompartment = new Compartment();

export function baseExtensions(appearance: Theme["appearance"]): Extension[] {
  return [
    ...prefsExtensions(settings().editor),
    completionKeys(),
    appKeys(),
    history(),
    foldGutter(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
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
    ...cellExtensions(),
    mergedHover(),
    inlineValuesCompartment.of(inlineValuesExtension(settings().editor.inlineValues)),
    themeCompartment.of(spawnEditorTheme(appearance)),
  ];
}

/** A document state with a per-document update listener. */
export function createDocumentState(
  text: string,
  appearance: Theme["appearance"],
  onUpdate: (update: ViewUpdate) => void,
  path: string | null = null,
): EditorState {
  return EditorState.create({
    doc: text,
    extensions: [
      ...baseExtensions(appearance),
      lspCompartment.of(lspExtensionFor(path)),
      inlineValuesPath.of(path),
      EditorView.updateListener.of(onUpdate),
    ],
  });
}

/** (Re)attach the language server plugin for `path` to the live view. */
export function applyLsp(view: EditorView, path: string | null): void {
  view.dispatch({ effects: lspCompartment.reconfigure(lspExtensionFor(path)) });
}

/** The single view; documents are swapped into it with `setState`. */
export function createView(parent: HTMLElement, appearance: Theme["appearance"]): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        ...baseExtensions(appearance),
        lspCompartment.of([]),
        EditorView.editable.of(false),
      ],
    }),
  });
}

/** Swap the theme in a live view. */
export function applyEditorTheme(view: EditorView, appearance: Theme["appearance"]): void {
  view.dispatch({ effects: themeCompartment.reconfigure(spawnEditorTheme(appearance)) });
}
