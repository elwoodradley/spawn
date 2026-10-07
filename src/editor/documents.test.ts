// @vitest-environment jsdom
import { EditorView } from "@codemirror/view";
import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = new Map<string, string>();

vi.mock("../ipc", () => ({
  readBytes: (path: string) => Promise.resolve(new TextEncoder().encode(disk.get(path) ?? "")),
  fileSize: (path: string) => Promise.resolve((disk.get(path) ?? "").length),
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

describe("saving", () => {
  it("stays unsaved when typing continues while the write is in flight", async () => {
    disk.set("/p/a.py", "a\n");
    const entry = await openDocument("/p/a.py");
    const view = new EditorView({ parent: document.body, state: entry.state });
    view.dispatch({ changes: { from: 0, insert: "b" } });

    const saving = saveDocument("/p/a.py");
    view.dispatch({ changes: { from: 0, insert: "c" } });
    await saving;

    expect(disk.get("/p/a.py")).toBe("ba\n");
    expect(isDirty("/p/a.py")).toBe(true);
    view.destroy();
    closeDocument("/p/a.py");
  });
});

describe("line endings", () => {
  it("saves a CRLF file with CRLF and is clean after undoing an edit", async () => {
    disk.set("/p/win.py", "a = 1\r\nb = 2\r\n");
    const entry = await openDocument("/p/win.py");
    const view = new EditorView({ parent: document.body, state: entry.state });

    view.dispatch({ changes: { from: 0, insert: "#" } });
    expect(isDirty("/p/win.py")).toBe(true);
    view.dispatch({ changes: { from: 0, to: 1 } });
    expect(isDirty("/p/win.py")).toBe(false);

    view.dispatch({ changes: { from: 0, insert: "# x\n" } });
    await saveDocument("/p/win.py");
    expect(disk.get("/p/win.py")).toBe("# x\r\na = 1\r\nb = 2\r\n");

    view.destroy();
    closeDocument("/p/win.py");
  });
});
