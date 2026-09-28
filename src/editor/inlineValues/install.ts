/**
 * Wires inline values to the app: after each Interactive Console run, find
 * the assignment lines in what ran, keep them per file, and refresh the live
 * editor; drop everything when the console restarts or stops; follow the
 * setting and the active tab.
 */
import { createEffect, createRoot, on } from "solid-js";

import { settings } from "../../app/settings";
import { activeFilePath } from "../../app/state";
import { poolStatus } from "../../pool/client";
import { onExecFinished, type ExecFinished } from "../../pool/hooks";
import { documentText } from "../documents";
import { activeView } from "../view";
import { alignCodeLines, findAssignments } from "./assignments";
import { syncInlineValues } from "./decorations";
import { clearInlineValues, recordExec, type FreshAssignment } from "./store";

function sync(): void {
  const view = activeView();
  if (view) syncInlineValues(view, settings().editor.inlineValues);
}

function handleExec({ request, variables }: ExecFinished): void {
  const path = request.file;
  if (!path) return;
  const text = documentText(path);
  if (text === null) return;
  const codeLines = request.code.split("\n");
  const lines = alignCodeLines(codeLines, text.split("\n"), request.startLine);
  const fresh: FreshAssignment[] = [];
  for (const found of findAssignments(request.code)) {
    const line = lines[found.index];
    if (line !== null && line !== undefined)
      fresh.push({ line, names: found.names, text: found.text });
  }
  const mapped = lines.filter((n): n is number => n !== null);
  const executed =
    mapped.length > 0
      ? { from: Math.min(...mapped), to: Math.max(...mapped) }
      : { from: request.startLine, to: request.startLine + codeLines.length - 1 };
  recordExec(path, executed, fresh, variables);
  sync();
}

export function installInlineValues(): () => void {
  const unsubscribe = onExecFinished(handleExec);
  const dispose = createRoot((disposeRoot) => {
    createEffect(
      on(
        poolStatus,
        (status) => {
          if (status === "cold" || status === "croaked") {
            clearInlineValues();
            sync();
          }
        },
        { defer: true },
      ),
    );
    createEffect(on(() => settings().editor.inlineValues, sync, { defer: true }));
    // After the editor has swapped the new tab's state in.
    createEffect(on(activeFilePath, () => queueMicrotask(sync), { defer: true }));
    return disposeRoot;
  });
  return () => {
    unsubscribe();
    dispose();
  };
}
