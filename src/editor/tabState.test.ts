// @vitest-environment jsdom
import { redo, undo } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";

import { createDocumentState } from "./createEditor";

// jsdom has no layout; give CodeMirror's measuring code inert rectangles so
// its measure cycle does not throw in the background.
const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
Range.prototype.getClientRects = () =>
  ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => ({ ...emptyRect, toJSON: () => emptyRect });

/**
 * Tabs share one EditorView; each keeps its own EditorState. This proves that
 * swapping states back and forth preserves undo history, selection and the
 * text, which is what "a tab keeps its place" means beyond scroll offset.
 */
describe("per-tab editor state across a view swap", () => {
  it("keeps undo history, selection and text through setState round trips", () => {
    const view = new EditorView({ parent: document.body });
    let stateA = createDocumentState("a = 1\n", "dark", (u) => (stateA = u.state), "/p/a.py");
    let stateB = createDocumentState("b = 2\n", "dark", (u) => (stateB = u.state), "/p/b.py");

    // Edit A twice, then move the cursor.
    view.setState(stateA);
    view.dispatch({ changes: { from: 5, insert: "0" } }); // a = 10
    view.dispatch({ changes: { from: 6, insert: "0" } }); // a = 100
    view.dispatch({ selection: { anchor: 3 } });
    expect(stateA.doc.toString()).toBe("a = 100\n");

    // Switch to B, edit it, switch back to A.
    view.setState(stateB);
    view.dispatch({ changes: { from: 0, insert: "# b\n" } });
    expect(stateB.doc.toString()).toBe("# b\nb = 2\n");
    view.setState(stateA);

    // A's cursor and undo history are intact. The two quick edits form one
    // undo group (CodeMirror merges adjacent typing), so one undo reverts
    // both and one redo restores both.
    expect(view.state.selection.main.head).toBe(3);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("a = 1\n");
    expect(redo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("a = 100\n");

    // B was not touched by A's undos.
    view.setState(stateB);
    expect(view.state.doc.toString()).toBe("# b\nb = 2\n");
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("b = 2\n");
    view.destroy();
  });

  it("scrollSnapshot yields an effect the swapped-in state accepts", () => {
    const view = new EditorView({ parent: document.body });
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
    let state = createDocumentState(lines, "dark", (u) => (state = u.state), "/p/long.py");
    view.setState(state);
    const snapshot = view.scrollSnapshot();
    expect(snapshot).toBeTruthy();
    view.setState(createDocumentState("other", "dark", () => {}, "/p/o.py"));
    view.setState(state);
    // Dispatching the snapshot must not throw against the restored state.
    expect(() => view.dispatch({ effects: snapshot })).not.toThrow();
    view.destroy();
  });
});
