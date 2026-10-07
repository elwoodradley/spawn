// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("../ipc", () => ({
  baseName: (p: string) => p.split("/").pop() ?? p,
  dirName: (p: string) => p.slice(0, p.lastIndexOf("/")),
  getSetting: <T>(_key: string, fallback: T) => Promise.resolve(fallback),
  setSetting: () => Promise.resolve(),
}));

const { getCommand } = await import("../app/commands");
const { parseChord } = await import("../app/keybindings");
const { registerTabCommands } = await import("./tabCommands");

describe("tab cycling keys", () => {
  it("use Ctrl on macOS too, since Cmd-Tab is the system app switcher", () => {
    const dispose = registerTabCommands();
    for (const id of ["tab.cycle", "tab.cycleBack"]) {
      const chord = parseChord(getCommand(id)?.keys ?? "", true);
      expect(chord).toMatchObject({ key: "tab", ctrl: true, meta: false });
    }
    dispose();
  });
});
