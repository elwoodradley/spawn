/**
 * The LSP client for one project: pyright behind @codemirror/lsp-client.
 *
 * Diagnostics are filtered to the chosen level before the library's own
 * handler sees them, so the editor's lint gutter only ever shows what the
 * level allows. The library's hover is left out in favour of SPAWN's merged
 * hover (docs plus live value), see hover.ts.
 */
import {
  findReferencesKeymap,
  jumpToDefinitionKeymap,
  LSPClient,
  renameKeymap,
  serverCompletion,
  serverDiagnostics,
  signatureHelp,
} from "@codemirror/lsp-client";
import { keymap } from "@codemirror/view";
import DOMPurify from "dompurify";

import { filterDiagnostics, type DiagnosticLevel, type LspDiagnostic } from "./diagnostics";

export interface ClientOptions {
  rootUri: string;
  level: () => DiagnosticLevel;
}

interface PublishParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

/** Language-server log lines, newest last, capped. */
export const LOG_CAP = 200;

export function createClient(options: ClientOptions): LSPClient {
  return new LSPClient({
    rootUri: options.rootUri,
    // Pyright through uv can take a while to boot on a cold cache.
    timeout: 20000,
    sanitizeHTML: (html) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }),
    notificationHandlers: {
      "textDocument/publishDiagnostics": (_client, params: PublishParams) => {
        // Filter in place, then let the built-in handler render what is left.
        params.diagnostics = filterDiagnostics(options.level(), params.diagnostics);
        return false;
      },
    },
    extensions: [
      serverCompletion(),
      signatureHelp(),
      serverDiagnostics(),
      keymap.of([...jumpToDefinitionKeymap, ...findReferencesKeymap, ...renameKeymap]),
    ],
  });
}
