/**
 * Process IPC: the TypeScript side of a spawn.
 *
 * Rust gives us a process id and streams `ProcEvent`s over a `Channel`, in
 * order. This module is the only place that knows the command names.
 */
import { Channel, invoke } from "@tauri-apps/api/core";

export type ProcEvent =
  | { kind: "started"; pid: number | null }
  | { kind: "stdout"; text: string }
  | { kind: "stderr"; text: string }
  | { kind: "exit"; code: number | null; signal: number | null }
  | { kind: "croak"; message: string };

export interface SpawnRequest {
  program: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export interface ProcHandle {
  readonly id: number;
  /** Write to the child's stdin. Include the newline yourself. */
  write(data: string): Promise<void>;
  /** Send EOF; Python's input() raises EOFError after this. */
  closeStdin(): Promise<void>;
  kill(): Promise<void>;
}

export async function spawnProcess(
  request: SpawnRequest,
  onEvent: (event: ProcEvent) => void,
): Promise<ProcHandle> {
  const channel = new Channel<ProcEvent>();
  channel.onmessage = onEvent;
  const id = await invoke<number>("proc_spawn", {
    request: { ...request, args: request.args, env: request.env ?? {} },
    onEvent: channel,
  });
  return {
    id,
    write: (data) => invoke("proc_write", { id, data }),
    closeStdin: () => invoke("proc_close_stdin", { id }),
    kill: () => invoke("proc_kill", { id }),
  };
}
