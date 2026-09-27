/**
 * The language server for the open project: find pyright, start it, tell it
 * which interpreter and diagnostic level to use, restart it when those
 * change, and expose its status to the chrome.
 *
 * Pyright is a Node program. Students rarely have Node, so the fallback is
 * running it through uv (`uvx --from pyright pyright-langserver --stdio`),
 * which fetches pyright and its own Node into uv's cache on first use. That
 * is a download of roughly 250 MB, so it never happens without the user
 * turning it on in Settings; until then the editor simply has no server.
 */
import type { LSPClient } from "@codemirror/lsp-client";
import type { Extension } from "@codemirror/state";
import { createEffect, createRoot, createSignal, on } from "solid-js";

import { settings } from "../app/settings";
import { brood } from "../app/state";
import { selectedInterpreter } from "../env/store";
import { uvPath, which } from "../ipc";
import { createClient } from "./client";
import { pyrightSettings, type DiagnosticLevel } from "./diagnostics";
import { startServerProcess, type ServerProcess } from "./transport";
import { pathToUri } from "./uri";

export type LspStatus = "off" | "missing" | "starting" | "ready" | "error";

const [status, setStatus] = createSignal<LspStatus>("off");
const [detail, setDetail] = createSignal<string>("");
const [logLines, setLogLines] = createSignal<readonly string[]>([]);
/** Bumps whenever the client instance changes, so editors re-attach. */
const [clientGeneration, setClientGeneration] = createSignal(0);
export { status as lspStatus, detail as lspDetail, logLines as lspLog, clientGeneration };

let client: LSPClient | null = null;
let process: ServerProcess | null = null;
let startedFor: { root: string; python: string | null } | null = null;
let restarts = 0;
const MAX_RESTARTS = 3;

export function lspClient(): LSPClient | null {
  return client;
}

/** The per-file editor extension: the server's plugin for this path, or nothing. */
export function lspExtensionFor(path: string | null): Extension {
  if (!client || !path || !/\.pyw?$/i.test(path)) return [];
  return client.plugin(pathToUri(path), "python");
}

interface Launch {
  program: string;
  args: string[];
  how: string;
}

/** Decide how to run pyright, or null with a reason. */
export async function locateServer(): Promise<Launch | { missing: string }> {
  const cfg = settings().lsp;
  if (cfg.serverPath) return { program: cfg.serverPath, args: ["--stdio"], how: "configured path" };
  const onPath = await which("pyright-langserver");
  if (onPath) return { program: onPath, args: ["--stdio"], how: "pyright-langserver on PATH" };
  const uv = await uvPath();
  if (uv && cfg.useUv) {
    return {
      program: uv,
      args: ["tool", "run", "--from", "pyright", "pyright-langserver", "--stdio"],
      how: "pyright via uv",
    };
  }
  return {
    missing: uv
      ? "pyright is not installed. Turn on “Run pyright through uv” in Settings › Editor."
      : "pyright is not installed and uv was not found. Install pyright (npm i -g pyright) or uv.",
  };
}

function log(line: string): void {
  setLogLines((prev) => [...prev.slice(-199), line]);
}

async function stop(): Promise<void> {
  const p = process;
  const c = client;
  process = null;
  client = null;
  startedFor = null;
  setClientGeneration((g) => g + 1);
  try {
    c?.disconnect();
  } catch {
    // Already gone.
  }
  if (p) await p.stop().catch(() => undefined);
}

async function start(root: string): Promise<void> {
  await stop();
  if (!settings().lsp.enabled) {
    setStatus("off");
    return;
  }
  const launch = await locateServer();
  if ("missing" in launch) {
    setStatus("missing");
    setDetail(launch.missing);
    return;
  }
  setStatus("starting");
  setDetail(launch.how);
  const python = selectedInterpreter();
  try {
    const proc = await startServerProcess(
      { program: launch.program, args: launch.args, cwd: root },
      {
        rootUri: pathToUri(root),
        onLog: log,
        onExit: (code) => {
          if (process?.id !== proc.id) return;
          process = null;
          client = null;
          setClientGeneration((g) => g + 1);
          setStatus("error");
          setDetail(`pyright exited with code ${code ?? "?"}`);
          if (restarts < MAX_RESTARTS && settings().lsp.enabled) {
            restarts += 1;
            void start(root);
          }
        },
        onCroak: (message) => log(`croak: ${message}`),
      },
    );
    process = proc;
    const next = createClient({
      rootUri: pathToUri(root),
      level: () => settings().lsp.diagnostics,
    });
    next.connect(proc.transport);
    client = next;
    startedFor = { root, python };
    setClientGeneration((g) => g + 1);
    await next.initializing;
    sendConfiguration(next, settings().lsp.diagnostics, python);
    restarts = 0;
    setStatus("ready");
    setDetail(`${launch.how} · ${python ?? "no interpreter"}`);
  } catch (err) {
    setStatus("error");
    setDetail(err instanceof Error ? err.message : String(err));
  }
}

function sendConfiguration(c: LSPClient, level: DiagnosticLevel, python: string | null): void {
  c.notification("workspace/didChangeConfiguration", { settings: pyrightSettings(level, python) });
}

/** Restart with the current project and interpreter (menu / status bar action). */
export async function restartServer(): Promise<void> {
  restarts = 0;
  const root = brood();
  if (root) await start(root);
  else await stop();
}

/**
 * Wire the server to the project, interpreter and settings. The server
 * starts when a project opens, restarts when the project or interpreter
 * changes, and re-sends settings when the diagnostic level changes.
 */
export function installLanguageServer(): () => void {
  const dispose = createRoot((disposeRoot) => {
    createEffect(
      on([brood, selectedInterpreter, () => settings().lsp.enabled], ([root, python, enabled]) => {
        if (!enabled || !root) {
          void stop().then(() => setStatus(enabled ? "off" : "off"));
          return;
        }
        if (startedFor && startedFor.root === root && startedFor.python === python) return;
        restarts = 0;
        void start(root);
      }),
    );
    createEffect(
      on(
        () => settings().lsp.diagnostics,
        (level) => {
          if (client) sendConfiguration(client, level, selectedInterpreter());
        },
        { defer: true },
      ),
    );
    createEffect(
      on(
        () => [settings().lsp.useUv, settings().lsp.serverPath] as const,
        () => {
          if (status() === "missing" || status() === "error") void restartServer();
        },
        { defer: true },
      ),
    );
    return disposeRoot;
  });
  return () => {
    dispose();
    void stop();
  };
}
