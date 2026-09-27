/**
 * Open documents: one CodeMirror EditorState per path, dirty tracking, save.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `saveAllDirty()` writes every dirty document; the spawn controller calls
 *   it before running so the file on disk is what the user sees.
 * - `isDirty(path)` for tab decorations.
 * - `cursorPosition()` for the status bar, 1-based line and column.
 */
import type { EditorState, StateEffect, TransactionSpec } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { createSignal } from "solid-js";

import { settings } from "../app/settings";
import { croakToast } from "../app/toast";
import { readText, writeText } from "../ipc";
import { currentTheme } from "../theme/store";
import { AutosaveTimers, ensureFinalNewline, trimTrailingWhitespace } from "./autosave";
import { createDocumentState } from "./createEditor";
import { activeView } from "./view";

export interface CursorPosition {
  line: number;
  col: number;
}

export interface DocEntry {
  /** Always the latest state; the update listener keeps it fresh. */
  state: EditorState;
  savedText: string;
  /**
   * Where the view was scrolled when this document was last shown, as the
   * effect `EditorView.scrollSnapshot()` returns. Dispatched after the state
   * is swapped back in, so a tab reopens exactly where it was left.
   */
  scroll: StateEffect<unknown> | null;
}

export interface RevealRequest {
  path: string;
  line: number;
  nonce: number;
}

const docs = new Map<string, DocEntry>();

const [cursorPosition, setCursorPosition] = createSignal<CursorPosition | null>(null);
const [dirtyPaths, setDirtyPaths] = createSignal<ReadonlySet<string>>(new Set());
const [revealRequest, setRevealRequest] = createSignal<RevealRequest | null>(null);
export { cursorPosition, setCursorPosition, dirtyPaths, revealRequest };

const autosave = new AutosaveTimers((path) => {
  saveDocument(path).catch((err: unknown) => {
    croakToast(`Autosave failed for ${path}: ${err instanceof Error ? err.message : String(err)}`);
  });
});

function setDirty(path: string, dirty: boolean): void {
  const current = dirtyPaths();
  if (current.has(path) === dirty) return;
  const next = new Set(current);
  if (dirty) next.add(path);
  else next.delete(path);
  setDirtyPaths(next);
}

function listenerFor(path: string): (update: ViewUpdate) => void {
  return (update) => {
    const entry = docs.get(path);
    if (!entry) return;
    entry.state = update.state;
    if (update.docChanged) {
      const dirty = update.state.doc.toString() !== entry.savedText;
      setDirty(path, dirty);
      const prefs = settings().editor;
      if (dirty && prefs.autosave === "afterDelay") autosave.schedule(path, prefs.autosaveDelayMs);
    }
    if (update.selectionSet || update.docChanged || update.focusChanged) {
      const head = update.state.selection.main.head;
      const line = update.state.doc.lineAt(head);
      setCursorPosition({ line: line.number, col: head - line.from + 1 });
    }
  };
}

/** Load a file into the registry (no-op if already open). */
export async function openDocument(path: string): Promise<DocEntry> {
  const existing = docs.get(path);
  if (existing) return existing;
  const text = await readText(path);
  const entry: DocEntry = {
    state: createDocumentState(text, currentTheme().appearance, listenerFor(path), path),
    savedText: text,
    scroll: null,
  };
  docs.set(path, entry);
  return entry;
}

export function getDocument(path: string): DocEntry | undefined {
  return docs.get(path);
}

export function documentText(path: string): string | null {
  return docs.get(path)?.state.doc.toString() ?? null;
}

/** Move a registry entry to a new path after a rename on disk. */
export function renameDocument(from: string, to: string): void {
  const entry = docs.get(from);
  if (!entry) return;
  autosave.cancel(from);
  docs.delete(from);
  docs.set(to, entry);
  const dirty = dirtyPaths().has(from);
  setDirty(from, false);
  setDirty(to, dirty);
}

export function closeDocument(path: string): void {
  autosave.cancel(path);
  docs.delete(path);
  setDirty(path, false);
}

/** Apply a change to a document, through the view if it is showing. */
function transact(entry: DocEntry, spec: TransactionSpec): void {
  const view = activeView();
  if (view && view.state === entry.state) view.dispatch(spec);
  else entry.state = entry.state.update(spec).state;
}

/** Save-time clean-ups from settings, applied as a real edit so undo works. */
function applySaveTransforms(entry: DocEntry): void {
  const prefs = settings().editor;
  const before = entry.state.doc.toString();
  let after = before;
  if (prefs.trimTrailingWhitespace) after = trimTrailingWhitespace(after);
  if (prefs.insertFinalNewline) after = ensureFinalNewline(after);
  if (after === before) return;
  transact(entry, { changes: { from: 0, to: before.length, insert: after } });
}

export async function saveDocument(path: string): Promise<void> {
  const entry = docs.get(path);
  if (!entry) return;
  autosave.cancel(path);
  applySaveTransforms(entry);
  const text = entry.state.doc.toString();
  await writeText(path, text);
  entry.savedText = text;
  setDirty(path, false);
}

export async function saveAllDirty(): Promise<void> {
  await Promise.all([...dirtyPaths()].map(saveDocument));
}

export function isDirty(path: string): boolean {
  return dirtyPaths().has(path);
}

/** Ask the editor to put the cursor on a 1-based line and scroll to it. */
export function reveal(path: string, line: number): void {
  setRevealRequest({ path, line, nonce: Date.now() });
}
