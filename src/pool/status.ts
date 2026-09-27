/** How the Interactive Console's state reads in the chrome. */
import { poolStatus } from "./client";
import type { PoolStatus } from "./protocol";

const LABELS: Record<PoolStatus, string> = {
  cold: "console: cold",
  starting: "console: starting",
  idle: "console: idle",
  busy: "console: busy",
  croaked: "console: error",
};

const TITLES: Record<PoolStatus, string> = {
  cold: "Interactive Console not running. Run a cell to start it.",
  starting: "The Interactive Console is starting.",
  idle: "The Interactive Console is ready. Click to show variables.",
  busy: "The Interactive Console is running code. Interrupt with Ctrl+Shift+.",
  croaked: "The Interactive Console stopped unexpectedly. Click to restart it.",
};

export function poolLabel(status: PoolStatus = poolStatus()): string {
  return LABELS[status];
}

export function poolTitle(status: PoolStatus = poolStatus()): string {
  return TITLES[status];
}

/** The command a click on the status item should run. */
export function poolClickCommand(status: PoolStatus = poolStatus()): string {
  return status === "croaked" ? "pool.restart" : "pool.toggleVariables";
}
