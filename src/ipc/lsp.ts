/** Language-server IPC: start a stdio server, exchange whole JSON messages. */
import { Channel, invoke } from "@tauri-apps/api/core";

export type LspEvent =
  | { kind: "message"; json: string }
  | { kind: "log"; text: string }
  | { kind: "exit"; code: number | null }
  | { kind: "croak"; message: string };

export interface LspStartRequest {
  program: string;
  args: string[];
  cwd: string | null;
  env?: Record<string, string>;
}

export async function lspStart(
  request: LspStartRequest,
  onEvent: (event: LspEvent) => void,
): Promise<number> {
  const channel = new Channel<LspEvent>();
  channel.onmessage = onEvent;
  return invoke<number>("lsp_start", {
    request: { ...request, env: request.env ?? {} },
    onEvent: channel,
  });
}

export function lspSend(id: number, json: string): Promise<void> {
  return invoke("lsp_send", { id, json });
}

export function lspStop(id: number): Promise<void> {
  return invoke("lsp_stop", { id });
}
