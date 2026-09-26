/**
 * Commands owned by the app shell: brood, files, tabs, view, theme, help,
 * print, quit. Edit-menu commands live in `editCommands.ts`, spawn commands
 * in `spawn/commands.ts`.
 */
import { createEffect, on, onCleanup } from "solid-js";

import { beginNewDir, beginNewFile } from "../brood/ops";
import { refreshTree } from "../brood/store";
import { documentText, saveAllDirty, saveDocument } from "../editor/documents";
import {
  baseName,
  dirName,
  pickFile,
  pickFolder,
  pickSavePath,
  printPage,
  writeText,
} from "../ipc";
import { currentTheme, loadUserThemes, selectTheme, themes, userThemeDir } from "../theme/store";
import { openPalette } from "../ui/CommandPalette";
import { registerCommands, type Command } from "./commands";
import { showAbout, showShortcuts, showThemeFolder } from "./helpDialogs";
import { outputVisible, setOutputVisible, setSidebarVisible, sidebarVisible } from "./layout";
import { activeFilePath, brood, closeTab, openBrood, openFile } from "./state";
import { requestQuit } from "./window";

export const PRINT_HOST_ID = "sp-print";

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** New file: inline in the tree when a brood is open, a save dialog otherwise. */
async function newFile(): Promise<void> {
  const root = brood();
  if (root) {
    beginNewFile(root);
    return;
  }
  const path = await pickSavePath("untitled.py");
  if (!path) return;
  await writeText(path, "");
  openBrood(dirName(path));
  await openFile(path);
}

async function openAFile(): Promise<void> {
  const root = brood();
  const path = await pickFile(root ?? undefined);
  if (!path) return;
  if (!root) openBrood(dirName(path));
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

const hasBrood = () => brood() !== null;
const hasFile = () => activeFilePath() !== null;

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
  { id: "file.open", title: "Open a file", keys: "Mod-O", run: openAFile },
  { id: "file.new", title: "New file", keys: "Mod-N", run: newFile },
  {
    id: "brood.newFolder",
    title: "New folder",
    enabled: hasBrood,
    run: () => {
      const root = brood();
      if (root) beginNewDir(root);
    },
  },
  { id: "brood.refresh", title: "Refresh brood tree", enabled: hasBrood, run: refreshTree },
  {
    id: "file.save",
    title: "Save file",
    keys: "Mod-S",
    enabled: hasFile,
    run: async () => {
      const path = activeFilePath();
      if (path) await saveDocument(path);
    },
  },
  { id: "file.saveAll", title: "Save all files", keys: "Mod-Alt-S", run: saveAllDirty },
  { id: "file.print", title: "Print file", keys: "Mod-P", enabled: hasFile, run: printActive },
  {
    id: "tab.close",
    title: "Close tab",
    keys: "Mod-W",
    enabled: hasFile,
    run: async () => {
      const path = activeFilePath();
      if (path) await closeTab(path);
    },
  },
  { id: "app.quit", title: "Quit SPAWN", keys: "Mod-Q", run: requestQuit },
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
  {
    id: "theme.openFolder",
    title: "Where are my themes?",
    run: async () => showThemeFolder(await userThemeDir()),
  },
  { id: "help.shortcuts", title: "Keyboard shortcuts", keys: "F1", run: showShortcuts },
  { id: "help.about", title: "About SPAWN", run: showAbout },
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
