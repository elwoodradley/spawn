/** Native menu IPC: the macOS menu bar sends command ids (see src-tauri/src/menu.rs). */
import { listen } from "@tauri-apps/api/event";

/** Call `run` with each command id a native menu item asks for. */
export function onMenuCommand(run: (commandId: string) => void): Promise<() => void> {
  return listen<string>("menu-command", (event) => run(event.payload));
}
