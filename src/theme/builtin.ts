/**
 * Themes that ship with SPAWN. They are plain JSON under `themes/` and go
 * through the same validator as a user's file, so a broken shipped theme
 * fails the test suite rather than the app.
 */
import bog from "../../themes/bog.json";
import lily from "../../themes/lily.json";
import pond from "../../themes/pond.json";
import { parseTheme, type Theme } from "./schema";

export const DEFAULT_THEME_NAME = "Pond";

function mustParse(input: unknown, file: string): Theme {
  const result = parseTheme(input);
  if (!result.ok) {
    throw new Error(`built-in theme ${file} is invalid: ${result.error}`);
  }
  return result.theme;
}

export const defaultTheme: Theme = mustParse(pond, "pond.json");

export const builtinThemes: readonly Theme[] = [
  defaultTheme,
  mustParse(bog, "bog.json"),
  mustParse(lily, "lily.json"),
];
