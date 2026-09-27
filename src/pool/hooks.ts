/**
 * Listeners for a finished console exec. Features that react to what a cell
 * left behind (inline values beside code, dataset checks, hardware nudges)
 * subscribe here instead of each patching the console runtime. The runtime
 * fetches the variable listing once per exec and hands it to every listener.
 */
import type { ExecRequest, ExecResult, VariableInfo } from "./protocol";

export interface ExecFinished {
  request: ExecRequest;
  result: ExecResult;
  /** The console's variables after the exec; empty when it could not be read. */
  variables: readonly VariableInfo[];
}

type Listener = (info: ExecFinished) => void;

const listeners = new Set<Listener>();

/** Subscribe; returns the unsubscribe function. */
export function onExecFinished(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the console runtime once per finished exec. */
export function notifyExecFinished(info: ExecFinished): void {
  for (const listener of listeners) {
    try {
      listener(info);
    } catch (err) {
      console.error("exec listener failed", err);
    }
  }
}
