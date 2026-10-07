import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearCommands, registerCommand } from "./commands";
import { installKeybindings } from "./keybindings";

beforeEach(() => clearCommands());

function press(keys: string, init: Partial<KeyboardEvent>) {
  const run = vi.fn();
  registerCommand({ id: "t.cmd", title: "T", keys, run });
  const listeners: Array<(e: KeyboardEvent) => void> = [];
  const fakeWindow = {
    addEventListener: (_: string, fn: (e: KeyboardEvent) => void) => listeners.push(fn),
    removeEventListener: () => {},
  } as unknown as Window;
  const uninstall = installKeybindings(fakeWindow);
  const ev = {
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    ...init,
  } as unknown as KeyboardEvent;
  listeners.forEach((l) => l(ev));
  uninstall();
  return run;
}

describe("chords whose key a modifier rewrites", () => {
  it("matches Ctrl+Shift+. although the key reads >", () => {
    const run = press("Ctrl-Shift-.", { key: ">", code: "Period", ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledOnce();
  });

  it("matches Ctrl+Shift+= although the key reads +", () => {
    const run = press("Ctrl-Shift-=", { key: "+", code: "Equal", ctrlKey: true, shiftKey: true });
    expect(run).toHaveBeenCalledOnce();
  });

  it("matches Cmd+Option+J although macOS reports ∆", () => {
    const run = press("Meta-Alt-J", { key: "∆", code: "KeyJ", metaKey: true, altKey: true });
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not use the physical key without Shift or Option", () => {
    // AZERTY: the key labelled A sits where QWERTY has Q.
    const run = press("Ctrl-Q", { key: "a", code: "KeyQ", ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });
});
