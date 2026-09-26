/** Native dialogs. */
import { ask, open, save } from "@tauri-apps/plugin-dialog";

export async function pickFolder(defaultPath?: string): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false, defaultPath });
  return typeof picked === "string" ? picked : null;
}

export async function pickFile(defaultPath?: string): Promise<string | null> {
  const picked = await open({
    directory: false,
    multiple: false,
    defaultPath,
    filters: [
      { name: "Python", extensions: ["py", "pyi"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  return save({ defaultPath, filters: [{ name: "Python", extensions: ["py"] }] });
}

/** Save dialog for an image export; `ext` is `png` or `svg`. */
export async function pickSaveImage(
  defaultName: string,
  ext: "png" | "svg",
): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
}

export function confirm(message: string, title = "SPAWN"): Promise<boolean> {
  return ask(message, { title, kind: "warning" });
}
