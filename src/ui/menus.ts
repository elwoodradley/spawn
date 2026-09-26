/**
 * Menu entries. A menu is data: mostly command ids, resolved against the
 * registry when drawn, so the menu bar, context menus and the palette never
 * disagree about what a thing is called or what key it has.
 */
import { getCommand, runCommand } from "../app/commands";
import { chordLabel } from "../app/keybindings";

export type MenuEntry =
  | {
      kind: "command";
      id: string;
      /** Override the command's title. */
      label?: string;
      /** A chord to display when the command has no global key (e.g. editor keys). */
      hint?: string;
    }
  | {
      kind: "action";
      label: string;
      run: () => void | Promise<void>;
      checked?: boolean;
      disabled?: boolean;
    }
  | { kind: "submenu"; label: string; items: MenuEntry[] }
  | { kind: "separator" };

export interface Menu {
  label: string;
  items: MenuEntry[];
}

/** What a renderer needs to draw one entry. */
export interface ResolvedEntry {
  entry: MenuEntry;
  label: string;
  keys: string;
  disabled: boolean;
  checked: boolean;
  hasSubmenu: boolean;
  separator: boolean;
}

export function resolveEntry(entry: MenuEntry): ResolvedEntry {
  switch (entry.kind) {
    case "command": {
      const command = getCommand(entry.id);
      const keys = command?.keys ?? entry.hint;
      return {
        entry,
        label: entry.label ?? command?.title ?? entry.id,
        keys: keys ? chordLabel(keys) : "",
        disabled: !command || command.enabled?.() === false,
        checked: false,
        hasSubmenu: false,
        separator: false,
      };
    }
    case "action":
      return {
        entry,
        label: entry.label,
        keys: "",
        disabled: entry.disabled ?? false,
        checked: entry.checked ?? false,
        hasSubmenu: false,
        separator: false,
      };
    case "submenu":
      return {
        entry,
        label: entry.label,
        keys: "",
        disabled: entry.items.length === 0,
        checked: false,
        hasSubmenu: true,
        separator: false,
      };
    case "separator":
      return {
        entry,
        label: "",
        keys: "",
        disabled: true,
        checked: false,
        hasSubmenu: false,
        separator: true,
      };
  }
}

/** Run an entry. Submenus and separators do nothing. */
export async function activateEntry(entry: MenuEntry): Promise<void> {
  if (entry.kind === "command") await runCommand(entry.id);
  else if (entry.kind === "action") await entry.run();
}

export const separator: MenuEntry = { kind: "separator" };
export const cmd = (id: string, extra?: { label?: string; hint?: string }): MenuEntry => ({
  kind: "command",
  id,
  ...extra,
});
