/**
 * Persistent settings via the Tauri store plugin. `spawn.json` in the app
 * data directory holds settings, the session and recents; it is rewritten on
 * every change, so it stays small. Run history, which carries a copy of the
 * code of each run, lives in its own `runs.json`.
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

const RUNS_FILE = "runs.json";
let runsPromise: Promise<Store> | null = null;

function runsStore(): Promise<Store> {
  runsPromise ??= (async () => {
    const runs = await load(RUNS_FILE, { autoSave: 500, defaults: {} });
    await migrateRunHistory(runs);
    return runs;
  })();
  return runsPromise;
}

/** Older builds kept run history in spawn.json; move it once. */
async function migrateRunHistory(runs: Store): Promise<void> {
  const settings = await store();
  const old = await settings.get<unknown>(RUN_HISTORY_KEY);
  if (old === undefined || old === null) return;
  if ((await runs.get<unknown>(RUN_HISTORY_KEY)) === undefined) {
    await runs.set(RUN_HISTORY_KEY, old);
  }
  await settings.delete(RUN_HISTORY_KEY);
}

export const RUN_HISTORY_KEY = "runs.history";

export async function getRunHistory(): Promise<unknown> {
  return (await (await runsStore()).get<unknown>(RUN_HISTORY_KEY)) ?? {};
}

export async function setRunHistory(value: unknown): Promise<void> {
  await (await runsStore()).set(RUN_HISTORY_KEY, value);
}
