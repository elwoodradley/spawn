/**
 * Pool commands: spawn a cell, a selection, everything above, or the whole
 * file into the persistent kernel; interrupt or restart it; show the
 * variables pane. The app shell calls `registerPoolCommands()` once.
 */
import type { EditorView } from "@codemirror/view";

import { registerCommands } from "../app/commands";
import {
  outputVisible,
  setOutputVisible,
  setSidebarTab,
  setSidebarVisible,
  sidebarTab,
  sidebarVisible,
} from "../app/layout";
import { settings } from "../app/settings";
import { activeFilePath } from "../app/state";
import { toast } from "../app/toast";
import { cellAt, cellCode, cellsThrough, nextCell, parseCells } from "../editor/cells";
import { setCellRunner } from "../editor/cellDecorations";
import { saveAllDirty } from "../editor/documents";
import { activeView } from "../editor/view";
import { baseName } from "../ipc";
import { showOutputTab } from "../output/OutputPanel";
import { output } from "../spawn/controller";
import { pool, poolStatus } from "./client";
import type { ExecRequest } from "./protocol";
import { refreshVariables } from "./variables";

interface Piece {
  code: string;
  startLine: number;
  endLine: number;
  scope: ExecRequest["scope"];
}

/** Send one piece of the active file to the pool, with console bookkeeping. */
async function spawnPiece(piece: Piece): Promise<boolean> {
  const file = activeFilePath();
  if (piece.code.trim().length === 0) {
    toast("Nothing to spawn: the cell is empty", { kind: "info" });
    return false;
  }
  if (settings().spawn.saveBeforeSpawn) await saveAllDirty();
  setOutputVisible(true);
  showOutputTab("output");
  const where = file ? `${baseName(file)}:${piece.startLine}–${piece.endLine}` : "scratch";
  output.system(`spawn ${piece.scope} · ${where}`);
  const result = await pool().exec({
    code: piece.code,
    file,
    startLine: piece.startLine,
    scope: piece.scope,
  });
  await refreshVariables();
  return result.ok;
}

function pieceForCellAt(
  view: EditorView,
  pos: number,
): { piece: Piece; next: number | null } | null {
  const cells = parseCells(view.state.doc);
  const cell = cellAt(cells, pos);
  if (!cell) return null;
  const { code, startLine } = cellCode(view.state.doc, cell);
  const following = nextCell(cells, cell);
  return {
    piece: { code, startLine, endLine: cell.toLine, scope: "cell" },
    next: following ? following.from : null,
  };
}

async function spawnCell(advance: boolean): Promise<void> {
  const view = activeView();
  if (!view) return;
  const found = pieceForCellAt(view, view.state.selection.main.head);
  if (!found) return;
  if (advance && found.next !== null) {
    view.dispatch({ selection: { anchor: found.next }, scrollIntoView: true });
  }
  await spawnPiece(found.piece);
}

async function spawnSelection(): Promise<void> {
  const view = activeView();
  if (!view) return;
  const { from, to, head } = view.state.selection.main;
  const doc = view.state.doc;
  if (from === to) {
    const line = doc.lineAt(head);
    await spawnPiece({
      code: line.text,
      startLine: line.number,
      endLine: line.number,
      scope: "selection",
    });
    return;
  }
  const startLine = doc.lineAt(from).number;
  const endLine = doc.lineAt(to).number;
  await spawnPiece({ code: doc.sliceString(from, to), startLine, endLine, scope: "selection" });
}

async function spawnAbove(): Promise<void> {
  const view = activeView();
  if (!view) return;
  const doc = view.state.doc;
  const cells = cellsThrough(parseCells(doc), view.state.selection.main.head);
  const last = cells[cells.length - 1];
  if (!last) return;
  const code = cells.map((c) => cellCode(doc, c).code).join("\n");
  const first = cells[0];
  await spawnPiece({
    code,
    startLine: first ? cellCode(doc, first).startLine : 1,
    endLine: last.toLine,
    scope: "cell",
  });
}

async function spawnWholeFile(): Promise<void> {
  const view = activeView();
  if (!view) return;
  const doc = view.state.doc;
  await spawnPiece({ code: doc.toString(), startLine: 1, endLine: doc.lines, scope: "file" });
}

function toggleVariables(): void {
  if (!sidebarVisible()) {
    setSidebarVisible(true);
    setSidebarTab("pool");
    return;
  }
  setSidebarTab(sidebarTab() === "pool" ? "brood" : "pool");
}

const hasEditor = () => activeView() !== null;
const poolWarm = () => poolStatus() !== "cold";

export function registerPoolCommands(): () => void {
  setCellRunner((view, pos) => {
    const found = pieceForCellAt(view, pos);
    if (found) void spawnPiece(found.piece);
  });
  const dispose = registerCommands([
    {
      id: "pool.spawnCell",
      title: "Spawn cell into pool and advance",
      keys: "Shift-Enter",
      enabled: hasEditor,
      run: () => spawnCell(true),
    },
    {
      id: "pool.spawnCellStay",
      title: "Spawn cell into pool",
      keys: "Mod-Shift-Enter",
      enabled: hasEditor,
      run: () => spawnCell(false),
    },
    {
      id: "pool.spawnSelection",
      title: "Spawn selection or line into pool",
      keys: "Alt-Enter",
      enabled: hasEditor,
      run: spawnSelection,
    },
    {
      id: "pool.spawnAbove",
      title: "Spawn cells above and current into pool",
      enabled: hasEditor,
      run: spawnAbove,
    },
    {
      id: "pool.spawnFile",
      title: "Spawn whole file into pool",
      keys: "Mod-Shift-F5",
      enabled: hasEditor,
      run: spawnWholeFile,
    },
    {
      id: "pool.interrupt",
      title: "Interrupt the pool",
      keys: "Mod-Shift-.",
      enabled: poolWarm,
      run: async () => {
        await pool().interrupt();
        output.system("pool interrupted");
      },
    },
    {
      id: "pool.restart",
      title: "Restart the pool",
      run: async () => {
        await pool().restart();
        output.system("pool restarted: all variables are gone");
        await refreshVariables();
      },
    },
    {
      id: "pool.toggleVariables",
      title: "Toggle the pool variables pane",
      keys: "Mod-Shift-V",
      run: toggleVariables,
    },
    {
      id: "pool.showOutput",
      title: "Show the output panel",
      hidden: true,
      run: () => {
        if (!outputVisible()) setOutputVisible(true);
      },
    },
  ]);
  return () => {
    setCellRunner(null);
    dispose();
  };
}
