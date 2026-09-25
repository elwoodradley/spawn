/**
 * Which theme is active, which are available, and loading user themes from
 * the config directory. Solid signals so the chrome reacts.
 */
import { appConfigDir } from "@tauri-apps/api/path";
import { createSignal } from "solid-js";

import { getSetting, joinPath, listDir, pathExists, readText, setSetting } from "../ipc";
import { applyTheme } from "./apply";
import { DEFAULT_THEME_NAME, builtinThemes, defaultTheme } from "./builtin";
import { parseTheme, type Theme } from "./schema";

const SETTING_KEY = "theme";

const [themes, setThemes] = createSignal<readonly Theme[]>(builtinThemes);
const [current, setCurrent] = createSignal<Theme>(defaultTheme);
const [loadErrors, setLoadErrors] = createSignal<readonly string[]>([]);

export { themes, current as currentTheme, loadErrors as themeLoadErrors };

export function selectTheme(name: string, persist = true): boolean {
  const theme = themes().find((t) => t.name === name);
  if (!theme) return false;
  setCurrent(theme);
  applyTheme(theme);
  if (persist) void setSetting(SETTING_KEY, name);
  return true;
}

/** Apply the default now, then the persisted choice and user themes. */
export async function initTheme(): Promise<void> {
  applyTheme(current());
  await loadUserThemes();
  const saved = await getSetting<string>(SETTING_KEY, DEFAULT_THEME_NAME);
  selectTheme(saved, false);
}

/** Directory where a user drops their own `*.json` themes. */
export async function userThemeDir(): Promise<string> {
  return joinPath(await appConfigDir(), "themes");
}

export async function loadUserThemes(): Promise<void> {
  const dir = await userThemeDir();
  if (!(await pathExists(dir))) return;

  const loaded: Theme[] = [];
  const errors: string[] = [];
  for (const entry of await listDir(dir)) {
    if (entry.isDirectory || !entry.name.endsWith(".json")) continue;
    try {
      const result = parseTheme(JSON.parse(await readText(entry.path)));
      if (result.ok) loaded.push(result.theme);
      else errors.push(`${entry.name}: ${result.error}`);
    } catch (err) {
      errors.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // User themes override a built-in with the same name.
  const names = new Set(loaded.map((t) => t.name));
  setThemes([...builtinThemes.filter((t) => !names.has(t.name)), ...loaded]);
  setLoadErrors(errors);
}
