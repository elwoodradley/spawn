/** Pane sizes and visibility. Persisted in the clutch. */
import { createSignal } from "solid-js";

export const SIDEBAR_MIN = 160;
export const OUTPUT_MIN = 80;

const [sidebarWidth, setSidebarWidth] = createSignal(260);
const [outputHeight, setOutputHeight] = createSignal(240);
const [sidebarVisible, setSidebarVisible] = createSignal(true);
const [outputVisible, setOutputVisible] = createSignal(true);

export {
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
