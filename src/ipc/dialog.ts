/** Native dialogs. */
import { ask, open, save } from "@tauri-apps/plugin-dialog";

export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, defaultPath });
  return typeof picked === "string" ? picked : null;
}

export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  return save({ defaultPath, filters: [{ name: "Python", extensions: ["py"] }] });
}

export function confirm(message: string, title = "SPAWN"): Promise<boolean> {
  return ask(message, { title, kind: "warning" });
}
