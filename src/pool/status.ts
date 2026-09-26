/** How the pool's state reads in the chrome. */
import { poolStatus } from "./client";
import type { PoolStatus } from "./protocol";

const LABELS: Record<PoolStatus, string> = {
  cold: "pool: cold",
  starting: "pool: starting",
  idle: "pool: idle",
  busy: "pool: busy",
  croaked: "pool: croaked",
};

const TITLES: Record<PoolStatus, string> = {
  cold: "No kernel running. Spawn a cell to start one.",
  starting: "The kernel is starting.",
  idle: "The kernel is ready. Click to show variables.",
  busy: "The kernel is running code. Interrupt with Ctrl+Shift+.",
  croaked: "The kernel died. Click to restart it.",
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
