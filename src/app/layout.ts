/** Pane sizes and visibility. Persisted in the clutch. */
import { createSignal } from "solid-js";

export const SIDEBAR_MIN = 160;
export const OUTPUT_MIN = 80;
export const SIDEBAR_DEFAULT = 260;
export const OUTPUT_DEFAULT = 240;
/** Keyboard resize step in pixels. */
export const RESIZE_STEP = 48;

const [sidebarWidth, setSidebarWidth] = createSignal(SIDEBAR_DEFAULT);
const [outputHeight, setOutputHeight] = createSignal(OUTPUT_DEFAULT);
const [sidebarVisible, setSidebarVisible] = createSignal(true);
const [outputVisible, setOutputVisible] = createSignal(true);

export type SidebarTab = "brood" | "pool";
const [sidebarTab, setSidebarTab] = createSignal<SidebarTab>("brood");

export {
  sidebarTab,
  setSidebarTab,
  sidebarWidth,
  setSidebarWidth,
  outputHeight,
  setOutputHeight,
  sidebarVisible,
  setSidebarVisible,
  outputVisible,
  setOutputVisible,
};

export function clampSidebar(width: number, max: number): number {
  return Math.max(SIDEBAR_MIN, Math.min(width, max));
}

export function clampOutput(height: number, max: number): number {
  return Math.max(OUTPUT_MIN, Math.min(height, max));
}

/** The largest the output panel may be: most of the window, never all of it. */
export function outputMax(): number {
  return Math.max(OUTPUT_MIN, (globalThis.innerHeight || 800) * 0.8);
}

export function resizeOutput(delta: number): void {
  setOutputVisible(true);
  setOutputHeight(clampOutput(outputHeight() + delta, outputMax()));
}

/** Flip between a tall output and the default height. */
export function toggleOutputMaximized(): void {
  setOutputVisible(true);
  const tall = outputMax();
  setOutputHeight(outputHeight() >= tall - 1 ? OUTPUT_DEFAULT : tall);
}
