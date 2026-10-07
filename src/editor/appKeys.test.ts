// @vitest-environment jsdom
import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, runScopeHandlers } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearCommands, registerCommand } from "../app/commands";
import { appKeys } from "./appKeys";

function editor(): EditorView {
  return new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: "x = 1", extensions: [appKeys(), keymap.of(defaultKeymap)] }),
  });
}

function press(view: EditorView, init: KeyboardEventInit): boolean {
  return runScopeHandlers(view, new KeyboardEvent("keydown", init), "editor");
}

afterEach(() => clearCommands());

describe("app keys inside the editor", () => {
  it("Ctrl+Enter runs the file instead of inserting a blank line", () => {
    const run = vi.fn();
    registerCommand({ id: "spawn.runAlt", title: "Run File", keys: "Mod-Enter", run });
    const view = editor();
    expect(press(view, { key: "Enter", ctrlKey: true })).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(view.state.doc.toString()).toBe("x = 1");
    view.destroy();
  });

  it("leaves Ctrl+Enter to the editor while Run is unavailable", () => {
    registerCommand({
      id: "spawn.runAlt",
      title: "Run File",
      run: vi.fn(),
      enabled: () => false,
    });
    const view = editor();
    press(view, { key: "Enter", ctrlKey: true });
    expect(view.state.doc.lines).toBe(2);
    view.destroy();
  });

  it("Ctrl+I focuses the stdin line", () => {
    const run = vi.fn();
    registerCommand({ id: "output.focusStdin", title: "Focus stdin", run });
    const view = editor();
    expect(press(view, { key: "i", ctrlKey: true })).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    view.destroy();
  });
});
