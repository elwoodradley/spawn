/**
 * The editor surface. One CodeMirror view; the active tab's state is swapped
 * in, and its scroll position restored, whenever the active file changes.
 */
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEffect, on, onCleanup, onMount, Show } from "solid-js";

import { settings } from "../app/settings";
import { activeFilePath } from "../app/state";
import { currentTheme } from "../theme/store";
import { clientGeneration } from "../lsp/server";
import { applyEditorTheme, applyLsp, createView } from "./createEditor";
import { getDocument, isDirty, revealRequest, saveDocument, setCursorPosition } from "./documents";
import { applyEditorPrefs } from "./prefs";
import { setActiveView } from "./view";
import "./Editor.css";

export default function Editor() {
  let container: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  onMount(() => {
    if (!container) return;
    view = createView(container, currentTheme().appearance);
    setActiveView(view);
    onCleanup(() => {
      setActiveView(null);
      view?.destroy();
    });
  });

  let previous: string | null = null;
  createEffect(
    on(activeFilePath, (path) => {
      if (!view) return;
      if (previous) {
        const old = getDocument(previous);
        // scrollSnapshot() captures the viewport as an effect that survives a
        // setState swap; a raw scrollTop written after setState is discarded
        // by CodeMirror's next measure cycle.
        if (old) old.scroll = view.scrollSnapshot();
        if (settings().editor.autosave === "onFocusChange" && isDirty(previous)) {
          void saveDocument(previous);
        }
      }
      previous = path;

      const entry = path ? getDocument(path) : undefined;
      if (!entry) {
        setCursorPosition(null);
        return;
      }
      view.setState(entry.state);
      applyEditorTheme(view, currentTheme().appearance);
      applyEditorPrefs(view, settings().editor);
      applyLsp(view, path);
      if (entry.scroll) view.dispatch({ effects: entry.scroll });
      const head = entry.state.selection.main.head;
      const line = entry.state.doc.lineAt(head);
      setCursorPosition({ line: line.number, col: head - line.from + 1 });
      view.focus();
    }),
  );

  // A (re)started language server means a new client: re-attach its plugin.
  createEffect(
    on(
      clientGeneration,
      () => {
        if (view && activeFilePath()) applyLsp(view, activeFilePath());
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      currentTheme,
      (theme) => {
        if (view) applyEditorTheme(view, theme.appearance);
      },
      { defer: true },
    ),
  );

  createEffect(
    on(
      () => settings().editor,
      (prefs) => {
        if (view) applyEditorPrefs(view, prefs);
      },
      { defer: true },
    ),
  );

  createEffect(
    on(revealRequest, (request) => {
      if (!view || !request || request.path !== activeFilePath()) return;
      const doc = view.state.doc;
      const number = Math.max(1, Math.min(request.line, doc.lines));
      const line = doc.line(number);
      view.dispatch({
        selection: EditorSelection.cursor(line.from),
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
      view.focus();
    }),
  );

  return (
    <div class="sp-editor">
      <div class="sp-editor-surface" ref={(el) => (container = el)} />
      <Show when={!activeFilePath()}>
        <div class="sp-editor-empty sp-chrome">
          <p>No file open.</p>
          <p class="sp-editor-empty-hint">
            Pick one from the project, or press Mod-N for a new file.
          </p>
        </div>
      </Show>
    </div>
  );
}
