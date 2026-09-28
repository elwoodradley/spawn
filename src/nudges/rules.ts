/**
 * Hardware nudges: one-line suggestions computed from what the Interactive
 * Console holds, the torch device probe and system memory. Pure: given the
 * inputs, the messages. Which one shows (at most one, never a dismissed one)
 * is `pickNudge`.
 */
import type { MemoryInfo, MlInfo } from "../ipc/env";
import type { VariableInfo } from "../pool/protocol";

export interface Nudge {
  /** Stable id; a dismissal is remembered by it. */
  id: string;
  message: string;
}

export interface NudgeContext {
  variables: readonly VariableInfo[];
  ml: MlInfo | null;
  memory: MemoryInfo | null;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;
/** One variable above this share of RAM is worth a word. */
const ONE_VARIABLE_SHARE = 0.25;
/** All variables together above this share of RAM. */
const ALL_VARIABLES_SHARE = 0.6;
/** The console holds at least this share of what is still free... */
const HEAVY_SHARE_OF_AVAILABLE = 0.5;
/** ...and at least this much in absolute terms, so small machines stay quiet. */
const HEAVY_MIN_BYTES = 1 * GB;

/** `6 GB`, `1.5 GB`, `800 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
  }
  return `${Math.max(1, Math.round(bytes / MB))} MB`;
}

function kindWord(v: VariableInfo): string {
  if (/tensor/i.test(v.type)) return "tensor";
  if (/dataframe/i.test(v.type)) return "DataFrame";
  if (v.shape && v.dtype) return "array";
  return "variable";
}

function deviceNudge(ctx: NudgeContext): Nudge | null {
  const device = ctx.ml?.device;
  if (device !== "cuda" && device !== "mps") return null;
  if (!ctx.variables.some((v) => v.device === "cpu")) return null;
  const label = device === "cuda" ? "CUDA" : "MPS";
  const name = ctx.ml?.deviceName ? `${label} (${ctx.ml.deviceName})` : label;
  return {
    id: `device-cpu-${device}`,
    message: `This run is on CPU. ${name} is available and would be much faster.`,
  };
}

function sized(ctx: NudgeContext): VariableInfo[] {
  return ctx.variables.filter((v) => v.size !== null && v.size > 0);
}

function bigVariableNudge(ctx: NudgeContext): Nudge | null {
  const total = ctx.memory?.total ?? 0;
  if (total <= 0) return null;
  const largest = sized(ctx).sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  if (!largest || (largest.size ?? 0) <= ONE_VARIABLE_SHARE * total) return null;
  return {
    id: `big-variable:${largest.name}`,
    message: `The ${kindWord(largest)} ${largest.name} is ${formatBytes(largest.size ?? 0)}, and this machine has ${formatBytes(total)}.`,
  };
}

function heavyConsoleNudge(ctx: NudgeContext): Nudge | null {
  if (!ctx.memory) return null;
  const sum = sized(ctx).reduce((acc, v) => acc + (v.size ?? 0), 0);
  const available = Math.max(0, ctx.memory.total - ctx.memory.used);
  if (sum < HEAVY_MIN_BYTES || sum < HEAVY_SHARE_OF_AVAILABLE * available) return null;
  return {
    id: "console-heavy",
    message: `The console holds ${formatBytes(sum)} of arrays; restart it to free memory if you are done with them.`,
  };
}

function allVariablesNudge(ctx: NudgeContext): Nudge | null {
  const total = ctx.memory?.total ?? 0;
  if (total <= 0) return null;
  const sum = sized(ctx).reduce((acc, v) => acc + (v.size ?? 0), 0);
  if (sum <= ALL_VARIABLES_SHARE * total) return null;
  return {
    id: "big-total",
    message: `Your variables hold ${formatBytes(sum)} together, and this machine has ${formatBytes(total)}.`,
  };
}

/**
 * Every nudge that applies, most useful first. The sizes come before the
 * restart suggestion: first what is large, then what to do about it.
 */
export function evaluateNudges(ctx: NudgeContext): Nudge[] {
  return [
    deviceNudge(ctx),
    bigVariableNudge(ctx),
    allVariablesNudge(ctx),
    heavyConsoleNudge(ctx),
  ].filter((n): n is Nudge => n !== null);
}

/** The one to show: the first that was neither dismissed for good nor put off this session. */
export function pickNudge(
  candidates: readonly Nudge[],
  dismissed: readonly string[],
  snoozed: ReadonlySet<string>,
): Nudge | null {
  return candidates.find((n) => !dismissed.includes(n.id) && !snoozed.has(n.id)) ?? null;
}
