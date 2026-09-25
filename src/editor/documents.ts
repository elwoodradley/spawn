/**
 * Open documents: one CodeMirror EditorState per path, dirty tracking, save.
 *
 * CONTRACT (other modules import these; keep the signatures):
 * - `saveAllDirty()` writes every dirty document; the spawn controller calls
 *   it before running so the file on disk is what the user sees.
 * - `isDirty(path)` for tab decorations.
 * - `cursorPosition()` for the status bar, 1-based line and column.
 */
import { createSignal } from "solid-js";

export interface CursorPosition {
  line: number;
  col: number;
}

const [cursorPosition, setCursorPosition] = createSignal<CursorPosition | null>(null);
export { cursorPosition, setCursorPosition };

export async function saveAllDirty(): Promise<void> {}

export function isDirty(_path: string): boolean {
  return false;
}
