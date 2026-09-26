/** View and settings commands: zoom, word wrap, the Settings dialog. */
import { registerCommands, type Command } from "./commands";
import { settings, updateSettings } from "./settings";
import { stepZoom, zoomLabel } from "./settingsHelpers";
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
    id: "view.toggleWordWrap",
    title: "Toggle word wrap",
    keys: "Alt-Z",
    run: () => updateSettings({ editor: { wordWrap: !settings().editor.wordWrap } }),
  },
];

export function registerViewCommands(): () => void {
  return registerCommands(viewCommands);
}
