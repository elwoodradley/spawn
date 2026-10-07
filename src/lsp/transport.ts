/**
 * The Transport the CodeMirror LSP client speaks, over SPAWN's IPC. Rust
 * frames and deframes; this side only passes whole JSON strings.
 */
import type { Transport } from "@codemirror/lsp-client";

import { lspSend, lspStart, lspStop, type LspEvent, type LspStartRequest } from "../ipc";
import { uriToPath } from "./uri";

export interface ServerProcess {
  id: number;
  transport: Transport;
  stop(): Promise<void>;
}

export interface TransportHooks {
  onLog?: (line: string) => void;
  onExit?: (code: number | null) => void;
  onCroak?: (message: string) => void;
  /** Project root URI; added to `initialize` as workspaceFolders/rootPath. */
  rootUri?: string;
}

/**
 * The client library sends only `rootUri`. Pyright reads `workspaceFolders`
 * (and, failing that, the older `rootPath`), so add both to the initialize
 * request; every other message passes through untouched.
 */
export function withWorkspaceFolders(message: string, rootUri: string | undefined): string {
  if (!rootUri || !message.includes('"initialize"')) return message;
  try {
    const parsed = JSON.parse(message) as { method?: string; params?: Record<string, unknown> };
    if (parsed.method !== "initialize" || !parsed.params) return message;
    const name = decodeURIComponent(rootUri.split("/").filter(Boolean).pop() ?? "project");
    parsed.params.rootUri = rootUri;
    parsed.params.rootPath = uriToPath(rootUri);
    parsed.params.workspaceFolders = [{ uri: rootUri, name }];
    return JSON.stringify(parsed);
  } catch {
    return message;
  }
}

export async function startServerProcess(
  request: LspStartRequest,
  hooks: TransportHooks = {},
): Promise<ServerProcess> {
  const handlers = new Set<(value: string) => void>();
  const onEvent = (event: LspEvent) => {
    switch (event.kind) {
      case "message":
        for (const h of handlers) h(event.json);
        break;
      case "log":
        hooks.onLog?.(event.text);
        break;
      case "exit":
        hooks.onExit?.(event.code);
        break;
      case "croak":
        hooks.onCroak?.(event.message);
        break;
    }
  };
  const id = await lspStart(request, onEvent);
  const transport: Transport = {
    send(message: string) {
      void lspSend(id, withWorkspaceFolders(message, hooks.rootUri)).catch((err: unknown) =>
        hooks.onCroak?.(String(err)),
      );
    },
    subscribe(handler) {
      handlers.add(handler);
    },
    unsubscribe(handler) {
      handlers.delete(handler);
    },
  };
  return { id, transport, stop: () => lspStop(id) };
}
