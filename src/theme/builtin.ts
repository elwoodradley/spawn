/**
 * Themes that ship with SPAWN. They are plain JSON under `themes/` and go
 * through the same validator as a user's file, so a broken shipped theme
 * fails the test suite rather than the app. Every file in the folder is
 * picked up; adding a theme means adding a file.
 */
import { parseTheme, type Theme } from "./schema";

export const DEFAULT_THEME_NAME = "Pond";

const files = import.meta.glob<unknown>("../../themes/*.json", { eager: true, import: "default" });

function mustParse(input: unknown, file: string): Theme {
  const result = parseTheme(input);
  if (!result.ok) {
    throw new Error(`built-in theme ${file} is invalid: ${result.error}`);
  }
  return result.theme;
}

const all = Object.entries(files).map(([file, json]) => mustParse(json, file));

const found = all.find((t) => t.name === DEFAULT_THEME_NAME);
if (!found) throw new Error(`built-in theme ${DEFAULT_THEME_NAME} is missing`);
export const defaultTheme: Theme = found;

/** The default first, then dark themes, then light, each alphabetical. */
export const builtinThemes: readonly Theme[] = [
  defaultTheme,
  ...all
    .filter((t) => t !== defaultTheme)
    .sort((a, b) =>
      a.appearance === b.appearance
        ? a.name.localeCompare(b.name)
        : a.appearance === "dark"
          ? -1
          : 1,
    ),
];
