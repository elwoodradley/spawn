import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCommands,
  listCommands,
  registerCommand,
  registerCommands,
  runCommand,
} from "./commands";
import { chordLabel, installKeybindings, matchesChord, parseChord } from "./keybindings";

beforeEach(() => clearCommands());

describe("command registry", () => {
  it("registers, lists and runs", async () => {
    const run = vi.fn();
    registerCommand({ id: "t.one", title: "One", run });
    expect(listCommands().map((c) => c.id)).toEqual(["t.one"]);
    expect(await runCommand("t.one")).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("hides and refuses disabled commands", async () => {
    const run = vi.fn();
    registerCommand({ id: "t.off", title: "Off", run, enabled: () => false });
    expect(listCommands()).toEqual([]);
    expect(await runCommand("t.off")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("returns false for unknown ids", async () => {
    expect(await runCommand("nope")).toBe(false);
  });

  it("disposes a batch", () => {
    const dispose = registerCommands([
      { id: "a", title: "A", run: () => {} },
      { id: "b", title: "B", run: () => {} },
    ]);
    expect(listCommands()).toHaveLength(2);
    dispose();
    expect(listCommands()).toHaveLength(0);
  });
});

describe("parseChord", () => {
  it("maps Mod to ctrl off mac and meta on mac", () => {
    expect(parseChord("Mod-S", false)).toMatchObject({ key: "s", ctrl: true, meta: false });
    expect(parseChord("Mod-S", true)).toMatchObject({ key: "s", ctrl: false, meta: true });
  });

  it("handles function keys and Space", () => {
    expect(parseChord("Shift-F5", false)).toMatchObject({ key: "f5", shift: true });
    expect(parseChord("Ctrl-Space", false)).toMatchObject({ key: " ", ctrl: true });
  });

  it("treats a trailing dash as the minus key", () => {
    expect(parseChord("Mod--", false)).toMatchObject({ key: "-", ctrl: true });
    expect(parseChord("-", false)).toMatchObject({ key: "-", ctrl: false });
  });

  it("rejects unknown modifiers", () => {
    expect(() => parseChord("Hyper-S", false)).toThrow(/unknown modifier/);
  });
});

describe("matchesChord", () => {
  const event = (
    key: string,
    mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {},
  ) => ({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  });

  it("requires exact modifiers", () => {
    const chord = parseChord("Mod-S", false);
    expect(matchesChord(chord, event("s", { ctrlKey: true }))).toBe(true);
    expect(matchesChord(chord, event("S", { ctrlKey: true }))).toBe(true);
    expect(matchesChord(chord, event("s", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesChord(chord, event("s"))).toBe(false);
  });
});

describe("chordLabel", () => {
  it("renders platform labels", () => {
    expect(chordLabel("Mod-Shift-P", false)).toBe("Ctrl+Shift+P");
    expect(chordLabel("Mod-Shift-P", true)).toBe("⇧⌘P");
    expect(chordLabel("F5", false)).toBe("f5".toUpperCase() === "F5" ? "f5" : "f5");
  });
});

describe("installKeybindings", () => {
  it("dispatches a matching chord and skips defaultPrevented events", () => {
    const run = vi.fn();
    registerCommand({ id: "t.save", title: "Save", keys: "Ctrl-S", run });
    const listeners: Array<(e: KeyboardEvent) => void> = [];
    const fakeWindow = {
      addEventListener: (_: string, fn: (e: KeyboardEvent) => void) => listeners.push(fn),
      removeEventListener: () => {},
    } as unknown as Window;
    const uninstall = installKeybindings(fakeWindow);

    const fire = (defaultPrevented: boolean) => {
      const preventDefault = vi.fn();
      const ev = {
        key: "s",
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        defaultPrevented,
        preventDefault,
      } as unknown as KeyboardEvent;
      listeners.forEach((l) => l(ev));
      return preventDefault;
    };

    fire(true);
    expect(run).not.toHaveBeenCalled();
    const preventDefault = fire(false);
    expect(run).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalled();
    uninstall();
  });
});
