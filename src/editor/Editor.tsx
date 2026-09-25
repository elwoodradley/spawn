/**
 * The editor surface. One CodeMirror view; the active tab's state is swapped
 * in, and its scroll position restored, whenever the active file changes.
 */
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createEffect, on, onCleanup, onMount, Show } from "solid-js";

import { activeFilePath } from "../app/state";
import { currentTheme } from "../theme/store";
import { applyEditorTheme, createView } from "./createEditor";
import { getDocument, revealRequest, setCursorPosition } from "./documents";
import "./Editor.css";

export default function Editor() {
  let container: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  onMount(() => {
    if (!container) return;
    view = createView(container, currentTheme().appearance);
    onCleanup(() => view?.destroy());
  });

  let previous: string | null = null;
  createEffect(
    on(activeFilePath, (path) => {
      if (!view) return;
      if (previous) {
        const old = getDocument(previous);
        if (old) old.scrollTop = view.scrollDOM.scrollTop;
      }
      previous = path;

      const entry = path ? getDocument(path) : undefined;
      if (!entry) {
        setCursorPosition(null);
        return;
      }
      view.setState(entry.state);
      applyEditorTheme(view, currentTheme().appearance);
      view.scrollDOM.scrollTop = entry.scrollTop;
      const head = entry.state.selection.main.head;
      const line = entry.state.doc.lineAt(head);
      setCursorPosition({ line: line.number, col: head - line.from + 1 });
      view.focus();
    }),
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
            Pick one from the brood, or press Mod-N for a new file.
          </p>
        </div>
      </Show>
    </div>
  );
}
