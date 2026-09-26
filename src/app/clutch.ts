/**
 * The clutch: a saved session. Which brood is open, which tabs, which one is
 * active, and how the panes are sized. Restored at startup, saved whenever
 * any of it changes.
 */
import { createEffect, on } from "solid-js";

import { getSetting, pathExists, setSetting } from "../ipc";
import {
  outputHeight,
  outputVisible,
  setOutputHeight,
  setOutputVisible,
  setSidebarTab,
  setSidebarVisible,
  setSidebarWidth,
  sidebarTab,
  sidebarVisible,
  sidebarWidth,
  type SidebarTab,
} from "./layout";
import { activeFilePath, brood, openBrood, openFile, tabs } from "./state";

const KEY = "clutch";

export interface Clutch {
  brood: string | null;
  tabs: string[];
  active: string | null;
  sidebarWidth: number;
  outputHeight: number;
  sidebarVisible: boolean;
  outputVisible: boolean;
  /** Which sidebar tab was showing: the brood tree or the pool's variables. */
  sidebarTab: SidebarTab;
}

export const EMPTY_CLUTCH: Clutch = {
  brood: null,
  tabs: [],
  active: null,
  sidebarWidth: 260,
  outputHeight: 240,
  sidebarVisible: true,
  outputVisible: true,
  sidebarTab: "brood",
};

/** Accept whatever was on disk; anything malformed falls back to defaults. */
export function normalizeClutch(input: unknown): Clutch {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    brood: str(raw.brood),
    tabs: Array.isArray(raw.tabs) ? raw.tabs.filter((t): t is string => typeof t === "string") : [],
    active: str(raw.active),
    sidebarWidth: num(raw.sidebarWidth, EMPTY_CLUTCH.sidebarWidth),
    outputHeight: num(raw.outputHeight, EMPTY_CLUTCH.outputHeight),
    sidebarVisible: bool(raw.sidebarVisible, true),
    outputVisible: bool(raw.outputVisible, true),
    sidebarTab: raw.sidebarTab === "pool" ? "pool" : "brood",
  };
}

export function snapshotClutch(): Clutch {
  return {
    brood: brood(),
    tabs: tabs().map((t) => t.path),
    active: activeFilePath(),
    sidebarWidth: sidebarWidth(),
    outputHeight: outputHeight(),
    sidebarVisible: sidebarVisible(),
    outputVisible: outputVisible(),
    sidebarTab: sidebarTab(),
  };
}

export async function restoreClutch(): Promise<void> {
  const clutch = normalizeClutch(await getSetting<unknown>(KEY, null));
  setSidebarWidth(clutch.sidebarWidth);
  setOutputHeight(clutch.outputHeight);
  setSidebarVisible(clutch.sidebarVisible);
  setOutputVisible(clutch.outputVisible);
  setSidebarTab(clutch.sidebarTab);

  if (clutch.brood && (await pathExists(clutch.brood))) {
    openBrood(clutch.brood);
  }
  for (const path of clutch.tabs) {
    if (await pathExists(path)) await openFile(path);
  }
  if (clutch.active && (await pathExists(clutch.active))) {
    await openFile(clutch.active);
  }
}

/** Save the clutch whenever any part of it changes. Call once, inside a root. */
export function autosaveClutch(): void {
  createEffect(
    on(
      [
        brood,
        tabs,
        activeFilePath,
        sidebarWidth,
        outputHeight,
        sidebarVisible,
        outputVisible,
        sidebarTab,
      ],
      () => {
        void setSetting(KEY, snapshotClutch());
      },
      { defer: true },
    ),
  );
}
