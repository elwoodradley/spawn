/**
 * User settings: one typed, validated object persisted under the `settings`
 * key of the store. Every module reads `settings()` reactively and writes
 * through `updateSettings`, so the Settings dialog, keyboard commands and
 * menus all agree.
 *
 * Fonts and sizes here are *overrides*: `null` means "use the theme's value".
 */
import { createSignal } from "solid-js";
import { z } from "zod";

import { getSetting, setSetting } from "../ipc";

const STORE_KEY = "settings";

export const RunPattern = z.object({
  name: z.string().min(1).max(24),
  regex: z.string().min(1),
});
export type RunPattern = z.infer<typeof RunPattern>;

export const SettingsSchema = z.object({
  ui: z
    .object({
      /** UI font family override, or null for the theme's font. */
      fontUi: z.string().nullable().default(null),
      /** Editor and output font family override, or null for the theme's. */
      fontMono: z.string().nullable().default(null),
      /** Pixel size overrides, or null for the theme's sizes. */
      sizeUi: z.number().int().min(8).max(40).nullable().default(null),
      sizeMono: z.number().int().min(8).max(40).nullable().default(null),
      lineHeight: z.number().min(1).max(3).nullable().default(null),
      /** Multiplies every font size; changed with Mod-= / Mod-- / Mod-0. */
      zoom: z.number().min(0.5).max(3).default(1),
    })
    .prefault({}),
  editor: z
    .object({
      tabSize: z.number().int().min(1).max(8).default(4),
      wordWrap: z.boolean().default(false),
      lineNumbers: z.boolean().default(true),
      highlightActiveLine: z.boolean().default(true),
      autosave: z.enum(["off", "afterDelay", "onFocusChange"]).default("off"),
      autosaveDelayMs: z.number().int().min(100).max(60_000).default(1000),
      trimTrailingWhitespace: z.boolean().default(false),
      insertFinalNewline: z.boolean().default(true),
    })
    .prefault({}),
  spawn: z
    .object({
      saveBeforeSpawn: z.boolean().default(true),
      clearOutputOnSpawn: z.boolean().default(false),
      autoShowRunTab: z.boolean().default(true),
      /** Desktop notification when a spawn ends while SPAWN is not focused. */
      notifyWhenDone: z.boolean().default(true),
    })
    .prefault({}),
  run: z
    .object({
      patterns: z.array(RunPattern).default([]),
      /** Finished runs kept for comparison in the run panel. */
      keepRuns: z.number().int().min(0).max(20).default(5),
      /** Draw the previous runs' curves behind the live one. */
      overlayPrevious: z.boolean().default(true),
    })
    .prefault({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

const [settings, setSettingsSignal] = createSignal<Settings>(DEFAULT_SETTINGS);
export { settings };

/** Accept whatever is on disk; a malformed field falls back to its default. */
export function normalizeSettings(input: unknown): Settings {
  const direct = SettingsSchema.safeParse(input);
  if (direct.success) return direct.data;
  // Salvage section by section so one bad value does not reset everything.
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const salvaged: Record<string, unknown> = {};
  for (const key of Object.keys(SettingsSchema.shape) as (keyof Settings)[]) {
    const section = SettingsSchema.shape[key].safeParse(raw[key]);
    salvaged[key] = section.success ? section.data : DEFAULT_SETTINGS[key];
  }
  return SettingsSchema.parse(salvaged);
}

export async function loadSettings(): Promise<Settings> {
  const loaded = normalizeSettings(await getSetting<unknown>(STORE_KEY, null));
  setSettingsSignal(loaded);
  return loaded;
}

/** Deep-merge a partial update, validate, persist, and notify readers. */
export async function updateSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const next = normalizeSettings(merge(settings(), patch));
  setSettingsSignal(next);
  await setSetting(STORE_KEY, next);
  return next;
}

export async function resetSettings(): Promise<void> {
  setSettingsSignal(DEFAULT_SETTINGS);
  await setSetting(STORE_KEY, DEFAULT_SETTINGS);
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object | null
      ? DeepPartial<NonNullable<T[K]>> | null
      : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function merge<T>(base: T, patch: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) return (patch ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = base[key];
    out[key] =
      isPlainObject(current) && isPlainObject(value)
        ? merge(current, value as DeepPartial<typeof current>)
        : value;
  }
  return out as T;
}
