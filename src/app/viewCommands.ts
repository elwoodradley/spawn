/** View and settings commands: zoom, word wrap, the Settings dialog. */
import { registerCommands, type Command } from "./commands";
import { settings, updateSettings } from "./settings";
import { stepZoom, zoomLabel } from "./settingsHelpers";
import { RESIZE_STEP, resizeOutput, toggleOutputMaximized } from "./layout";
import { toast } from "./toast";
import { openSettings } from "../ui/SettingsDialog";

async function zoomTo(zoom: number): Promise<void> {
  await updateSettings({ ui: { zoom } });
  toast(`Zoom ${zoomLabel(zoom)}`, { timeoutMs: 1200 });
}

export const viewCommands: Command[] = [
  { id: "settings.open", title: "Settings", keys: "Mod-,", run: () => openSettings() },
  {
    id: "view.zoomIn",
    title: "Zoom in",
    keys: "Mod-=",
    run: () => zoomTo(stepZoom(settings().ui.zoom, 1)),
  },
  {
    id: "view.zoomInAlt",
    title: "Zoom in",
    keys: "Mod-Shift-=",
    hidden: true,
    run: () => zoomTo(stepZoom(settings().ui.zoom, 1)),
  },
  {
    id: "view.zoomOut",
    title: "Zoom out",
    keys: "Mod--",
    run: () => zoomTo(stepZoom(settings().ui.zoom, -1)),
  },
  { id: "view.zoomReset", title: "Reset zoom", keys: "Mod-0", run: () => zoomTo(1) },
  {
    id: "view.outputTaller",
    title: "Output panel taller",
    keys: "Mod-Alt-Up",
    run: () => resizeOutput(RESIZE_STEP),
  },
  {
    id: "view.outputShorter",
    title: "Output panel shorter",
    keys: "Mod-Alt-Down",
    run: () => resizeOutput(-RESIZE_STEP),
  },
  {
    id: "view.outputMaximize",
    title: "Maximize / restore output panel",
    keys: "Mod-Shift-J",
    run: () => toggleOutputMaximized(),
  },
  {
    id: "view.toggleWordWrap",
    title: "Toggle word wrap",
    keys: "Alt-Z",
    run: () => updateSettings({ editor: { wordWrap: !settings().editor.wordWrap } }),
  },
];

export function registerViewCommands(): () => void {
  return registerCommands(viewCommands);
}
