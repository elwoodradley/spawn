/**
 * The menu bar's contents. Built from commands plus live data (recent
 * items, themes), so it is a function the bar calls when it renders.
 */
import { currentTheme, selectTheme, themes } from "../theme/store";
import { cmd, separator, type Menu, type MenuEntry } from "../ui/menus";
import { EDITOR_HINTS } from "./editCommands";
import { forgetRecent, recentBroods, recentFiles } from "./recent";
import { openBrood, openFile } from "./state";

function recentEntries(): MenuEntry[] {
  const broods: MenuEntry[] = recentBroods().map((path) => ({
    kind: "action",
    label: path,
    run: () => openBrood(path),
  }));
  const files: MenuEntry[] = recentFiles().map((path) => ({
    kind: "action",
    label: path,
    run: () => openFile(path),
  }));
  if (broods.length === 0 && files.length === 0) return [];
  return [
    ...broods,
    ...(broods.length && files.length ? [separator] : []),
    ...files,
    separator,
    {
      kind: "action",
      label: "Clear recent",
      run: () => {
        for (const p of [...recentBroods(), ...recentFiles()]) forgetRecent(p);
      },
    },
  ];
}

function themeEntries(): MenuEntry[] {
  const current = currentTheme().name;
  const list: MenuEntry[] = themes().map((theme) => ({
    kind: "action",
    label: theme.name,
    checked: theme.name === current,
    run: () => {
      selectTheme(theme.name);
    },
  }));
  return [...list, separator, cmd("theme.reload"), cmd("theme.openFolder")];
}

export function appMenus(): Menu[] {
  return [
    {
      label: "File",
      items: [
        cmd("file.new"),
        cmd("file.open", { label: "Open file…" }),
        cmd("brood.open", { label: "Open brood…" }),
        { kind: "submenu", label: "Open recent", items: recentEntries() },
        separator,
        cmd("file.save"),
        cmd("file.saveAll"),
        separator,
        cmd("file.print", { label: "Print…" }),
        separator,
        cmd("tab.close"),
        cmd("app.quit"),
      ],
    },
    {
      label: "Edit",
      items: [
        cmd("edit.undo", { hint: EDITOR_HINTS.undo }),
        cmd("edit.redo", { hint: EDITOR_HINTS.redo }),
        separator,
        cmd("edit.find"),
        cmd("edit.replace"),
        cmd("edit.selectAll", { hint: EDITOR_HINTS.selectAll }),
        separator,
        cmd("edit.gotoLine", { label: "Go to line…", hint: EDITOR_HINTS.gotoLine }),
      ],
    },
    {
      label: "Spawn",
      items: [
        cmd("spawn.run"),
        cmd("spawn.stop"),
        separator,
        cmd("output.clear"),
        cmd("output.focusStdin"),
      ],
    },
    {
      label: "View",
      items: [
        cmd("view.toggleSidebar"),
        cmd("view.toggleOutput"),
        separator,
        cmd("palette.open"),
        separator,
        { kind: "submenu", label: "Theme", items: themeEntries() },
      ],
    },
    {
      label: "Help",
      items: [cmd("help.shortcuts"), cmd("help.about")],
    },
  ];
}
