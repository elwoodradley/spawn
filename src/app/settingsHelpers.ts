/** Pure helpers behind the Settings dialog and the zoom commands. */

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.1;

/** Next zoom level in a direction, rounded to avoid 1.2000000000000002. */
export function stepZoom(current: number, direction: 1 | -1): number {
  const next = Math.round((current + direction * ZOOM_STEP) * 10) / 10;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/**
 * Why a run-pattern regex is unusable, or null when it is fine. A pattern
 * needs exactly one capture group, which is where the number comes from.
 */
export function validatePattern(regex: string): string | null {
  if (regex.trim().length === 0) return "Enter a regular expression.";
  let compiled: RegExp;
  try {
    compiled = new RegExp(regex);
  } catch (err) {
    return err instanceof Error ? err.message : "Invalid regular expression.";
  }
  const groups = countCaptureGroups(compiled.source);
  if (groups === 0) return "Add one capture group around the number, e.g. (\\d+\\.?\\d*).";
  if (groups > 1) return "Use exactly one capture group.";
  return null;
}

/** Count capturing groups: `(` not escaped and not `(?`. */
export function countCaptureGroups(source: string): number {
  let count = 0;
  let escaped = false;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "(" && source[i + 1] !== "?") count++;
  }
  return count;
}

export function validatePatternName(name: string): string | null {
  if (name.trim().length === 0) return "Name the metric.";
  if (name.length > 24) return "Keep names under 24 characters.";
  return null;
}

/** Families offered in the font pickers; anything can still be typed. */
export const UI_FONT_SUGGESTIONS = [
  "Adwaita Sans",
  "Inter",
  "Cantarell",
  "Noto Sans",
  "SF Pro Text",
  "Segoe UI",
  "Roboto",
  "Ubuntu",
];

export const MONO_FONT_SUGGESTIONS = [
  "JetBrains Mono",
  "Fira Code",
  "Cascadia Code",
  "IBM Plex Mono",
  "Source Code Pro",
  "Hack",
  "Iosevka",
  "Menlo",
  "Consolas",
];

/** Parse a number input; empty means "use the theme value". */
export function parseOptionalInt(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function parseOptionalFloat(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
