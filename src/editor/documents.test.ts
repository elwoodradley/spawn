// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();

vi.mock("../ipc", () => ({
  readText: (path: string) => Promise.resolve(disk.get(path) ?? ""),
  writeText: (path: string, text: string) => {
    disk.set(path, text);
    return Promise.resolve();
  },
  getSetting: <T>(_key: string, fallback: T) => Promise.resolve(fallback),
  setSetting: () => Promise.resolve(),
  listUserThemes: () => Promise.resolve([]),
  readUserTheme: () => Promise.resolve(""),
  userThemesDir: () => Promise.resolve("/themes"),
}));

const { closeDocument, getDocument, isDirty, openDocument, renameDocument, saveDocument } =
  await import("./documents");

// jsdom has no layout; give CodeMirror's measuring code inert rectangles.
const emptyRect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
Range.prototype.getClientRects = () =>
  ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => ({ ...emptyRect, toJSON: () => emptyRect });

beforeEach(() => disk.clear());

describe("a renamed open document", () => {
  it("keeps tracking edits and saves them to the new path", async () => {
    disk.set("/p/old.py", "x = 1\n");
    const entry = await openDocument("/p/old.py");
    const view = new EditorView({ parent: document.body, state: entry.state });

    renameDocument("/p/old.py", "/p/new.py");
    view.dispatch({ changes: { from: 4, to: 5, insert: "2" } });

    expect(isDirty("/p/new.py")).toBe(true);
    expect(getDocument("/p/new.py")?.state.doc.toString()).toBe("x = 2\n");
    await saveDocument("/p/new.py");
    expect(disk.get("/p/new.py")).toBe("x = 2\n");
    expect(isDirty("/p/new.py")).toBe(false);

    view.destroy();
    closeDocument("/p/new.py");
  });
});
