/**
 * Which theme is active, which are available, and loading user themes from
 * the config directory. Solid signals so the chrome reacts.
 */
import { appConfigDir } from "@tauri-apps/api/path";
import { createEffect, createRoot, createSignal, on } from "solid-js";

import { settings, type Settings } from "../app/settings";
import { getSetting, joinPath, listDir, pathExists, readText, setSetting } from "../ipc";
import { applyTheme } from "./apply";
import { DEFAULT_THEME_NAME, builtinThemes, defaultTheme } from "./builtin";
import { parseTheme, type Theme } from "./schema";

const SETTING_KEY = "theme";

const [themes, setThemes] = createSignal<readonly Theme[]>(builtinThemes);
const [current, setCurrent] = createSignal<Theme>(defaultTheme);
const [loadErrors, setLoadErrors] = createSignal<readonly string[]>([]);

export { themes, current as currentTheme, loadErrors as themeLoadErrors };

/**
 * The theme as shown: the user's font and size overrides from settings on
 * top of the theme file, with zoom applied to every size.
 */
export function effectiveTheme(theme: Theme, ui: Settings["ui"]): Theme {
  const round = (px: number) => Math.max(6, Math.round(px * ui.zoom));
  return {
    ...theme,
    fonts: {
      ui: ui.fontUi ?? theme.fonts.ui,
      mono: ui.fontMono ?? theme.fonts.mono,
      sizeUi: round(ui.sizeUi ?? theme.fonts.sizeUi),
      sizeMono: round(ui.sizeMono ?? theme.fonts.sizeMono),
      lineHeight: ui.lineHeight ?? theme.fonts.lineHeight,
    },
  };
}

function applyCurrent(): void {
  applyTheme(effectiveTheme(current(), settings().ui));
}

// Re-apply whenever the theme or the font settings change. Lives in its own
// root because the theme store outlives any component.
createRoot(() => {
  createEffect(on([current, () => settings().ui], applyCurrent, { defer: true }));
});

export function selectTheme(name: string, persist = true): boolean {
  const theme = themes().find((t) => t.name === name);
  if (!theme) return false;
  setCurrent(theme);
  if (persist) void setSetting(SETTING_KEY, name);
  return true;
}

/** Apply the default now, then the persisted choice and user themes. */
export async function initTheme(): Promise<void> {
  applyCurrent();
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
