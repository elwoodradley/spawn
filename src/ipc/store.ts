/**
 * Persistent settings via the Tauri store plugin. One JSON file in the app
 * config directory, autosaved shortly after each write.
 */
import { load, type Store } from "@tauri-apps/plugin-store";

const FILE = "spawn.json";
let storePromise: Promise<Store> | null = null;

function store(): Promise<Store> {
  storePromise ??= load(FILE, { autoSave: 200, defaults: {} });
  return storePromise;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const value = await (await store()).get<T>(key);
  return value === undefined || value === null ? fallback : value;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await (await store()).set(key, value);
}
