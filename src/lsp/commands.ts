/**
 * Language-intelligence commands: navigation through the server, and
 * server control. Keys F12 / Shift+F12 / F2 are also bound inside the editor
 * by the client's keymaps; these commands make them reachable from menus
 * and the palette.
 */
import { findReferences, jumpToDefinition, renameSymbol } from "@codemirror/lsp-client";

import { registerCommands, type Command } from "../app/commands";
import { updateSettings } from "../app/settings";
import { activeFilePath } from "../app/state";
import { toast } from "../app/toast";
import { runEditorCommand } from "../editor/view";
import { lspStatus, restartServer } from "./server";

const hasPython = () => /\.pyw?$/i.test(activeFilePath() ?? "");
const ready = () => hasPython() && lspStatus() === "ready";

export const lspCommands: Command[] = [
  {
    id: "lsp.definition",
    title: "Go to definition",
    keys: "F12",
    enabled: ready,
    run: () => {
      if (!runEditorCommand(jumpToDefinition)) toast("No definition found here.");
    },
  },
  {
    id: "lsp.references",
    title: "Find references",
    keys: "Shift-F12",
    enabled: ready,
    run: () => {
      if (!runEditorCommand(findReferences)) toast("No references found here.");
    },
  },
  {
    id: "lsp.rename",
    title: "Rename symbol",
    enabled: ready,
    run: () => {
      if (!runEditorCommand(renameSymbol)) toast("Nothing to rename here.");
    },
  },
  {
    id: "lsp.restart",
    title: "Restart language server",
    run: async () => {
      await restartServer();
      toast(`Language server: ${lspStatus()}`);
    },
  },
  {
    id: "lsp.enableUv",
    title: "Run pyright through uv",
    enabled: () => lspStatus() === "missing",
    run: async () => {
      await updateSettings({ lsp: { useUv: true } });
      toast("Starting pyright through uv; the first run downloads it.", { timeoutMs: 4000 });
    },
  },
];

export function registerLspCommands(): () => void {
  return registerCommands(lspCommands);
}
