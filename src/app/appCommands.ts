/**
 * Commands owned by the app shell: brood, files, tabs, view, theme, print.
 * Spawn commands live in `spawn/commands.ts`.
 */
import { createEffect, on, onCleanup } from "solid-js";

import { documentText, saveAllDirty, saveDocument } from "../editor/documents";
import { baseName, joinPath, pickFolder, pickSavePath, printPage, writeText } from "../ipc";
import { currentTheme, loadUserThemes, selectTheme, themes } from "../theme/store";
import { openPalette } from "../ui/CommandPalette";
import { registerCommands, type Command } from "./commands";
import { outputVisible, setOutputVisible, setSidebarVisible, sidebarVisible } from "./layout";
import { activeFilePath, brood, closeTab, openBrood, openFile } from "./state";

export const PRINT_HOST_ID = "sp-print";

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function newFile(): Promise<void> {
  const root = brood();
  const path = await pickSavePath(root ? joinPath(root, "untitled.py") : undefined);
  if (!path) return;
  await writeText(path, "");
  await openFile(path);
}

/** Copy the active document into the print-only element and open the dialog. */
async function printActive(): Promise<void> {
  const path = activeFilePath();
  const text = path ? documentText(path) : null;
  const host = document.getElementById(PRINT_HOST_ID);
  if (!path || text === null || !host) return;
  host.textContent = `# ${baseName(path)}\n\n${text}`;
  await printPage();
}

function cycleTheme(): void {
  const list = themes();
  const index = list.findIndex((t) => t.name === currentTheme().name);
  const next = list[(index + 1) % list.length];
  if (next) selectTheme(next.name);
}

const shellCommands: Command[] = [
  {
    id: "brood.open",
    title: "Open a brood",
    keys: "Mod-Shift-O",
    run: async () => {
      const picked = await pickFolder(brood() ?? undefined);
      if (picked) openBrood(picked);
    },
  },
  { id: "file.new", title: "New file", keys: "Mod-N", run: newFile },
  {
    id: "file.save",
    title: "Save file",
    keys: "Mod-S",
    enabled: () => activeFilePath() !== null,
    run: async () => {
      const path = activeFilePath();
      if (path) await saveDocument(path);
    },
  },
  { id: "file.saveAll", title: "Save all files", keys: "Mod-Alt-S", run: saveAllDirty },
  {
    id: "file.print",
    title: "Print file",
    keys: "Mod-P",
    enabled: () => activeFilePath() !== null,
    run: printActive,
  },
  {
    id: "tab.close",
    title: "Close tab",
    keys: "Mod-W",
    enabled: () => activeFilePath() !== null,
    run: async () => {
      const path = activeFilePath();
      if (path) await closeTab(path);
    },
  },
  { id: "palette.open", title: "Command palette", keys: "Mod-Shift-P", run: openPalette },
  {
    id: "view.toggleSidebar",
    title: "Toggle brood sidebar",
    keys: "Mod-B",
    run: () => setSidebarVisible(!sidebarVisible()),
  },
  {
    id: "view.toggleOutput",
    title: "Toggle output panel",
    keys: "Mod-J",
    run: () => setOutputVisible(!outputVisible()),
  },
  { id: "theme.cycle", title: "Next theme", run: cycleTheme },
  {
    id: "theme.reload",
    title: "Reload themes",
    run: async () => {
      await loadUserThemes();
      selectTheme(currentTheme().name, false);
    },
  },
];

/** Register shell commands and keep one "Theme: X" command per known theme. */
export function registerAppCommands(): void {
  const disposeShell = registerCommands(shellCommands);
  onCleanup(disposeShell);

  createEffect(
    on(themes, (list) => {
      const dispose = registerCommands(
        list.map((theme) => ({
          id: `theme.select.${slug(theme.name)}`,
          title: `Theme: ${theme.name}`,
          run: () => {
            selectTheme(theme.name);
          },
        })),
      );
      onCleanup(dispose);
    }),
  );
}
