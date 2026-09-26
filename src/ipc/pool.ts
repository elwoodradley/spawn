/** Pool IPC: start the kernel process, send protocol lines, interrupt it. */
import { Channel, invoke } from "@tauri-apps/api/core";

import type { ProcEvent } from "./proc";

export interface PoolStartRequest {
  python: string;
  cwd: string | null;
}

/**
 * Start a pool. Process output (stdout, stderr, exit) arrives on `onProc`;
 * protocol JSON lines on `onMessage`, ending with `{"event":"closed"}`.
 * Returns the process id, which also works with `proc_write` and `proc_kill`.
 */
export async function poolStart(
  request: PoolStartRequest,
  onProc: (event: ProcEvent) => void,
  onMessage: (line: string) => void,
): Promise<number> {
  const procChannel = new Channel<ProcEvent>();
  procChannel.onmessage = onProc;
  const messageChannel = new Channel<string>();
  messageChannel.onmessage = onMessage;
  return invoke<number>("pool_start", {
    python: request.python,
    cwd: request.cwd,
    onProc: procChannel,
    onMessage: messageChannel,
  });
}

export function poolSend(id: number, line: string): Promise<void> {
  return invoke("pool_send", { id, line });
}

export function poolInterrupt(id: number): Promise<void> {
  return invoke("pool_interrupt", { id });
}
