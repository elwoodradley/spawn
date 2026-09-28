/**
 * The live pool client. Until a kernel is wired in this is a stub: it reports
 * `cold`, and every request resolves with nothing so the UI around it can be
 * built and tested. `setPoolClient` swaps in the real one.
 */
import { createSignal } from "solid-js";

import type {
  DisplayPayload,
  ExecRequest,
  ExecResult,
  PoolClient,
  PoolEvent,
  PoolStatus,
  VariableInfo,
} from "./protocol";

const [status, setStatus] = createSignal<PoolStatus>("cold");
export { status as poolStatus, setStatus as setPoolStatus };

/** Listeners for streamed pool events; the output model subscribes. */
const listeners = new Set<(event: PoolEvent) => void>();
export function onPoolEvent(listener: (event: PoolEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function emitPoolEvent(event: PoolEvent): void {
  for (const l of listeners) l(event);
}

let execCounter = 0;

const stub: PoolClient = {
  status,
  exec: (_request: ExecRequest): Promise<ExecResult> =>
    Promise.resolve({ exec: ++execCounter, ok: false, durationMs: 0 }),
  inspect: (_expression: string): Promise<DisplayPayload | null> => Promise.resolve(null),
  variables: (): Promise<VariableInfo[]> => Promise.resolve([]),
  datasetHealth: () => Promise.resolve(null),
  tableRows: () => Promise.resolve([]),
  matrixCells: () => Promise.resolve([]),
  interrupt: () => Promise.resolve(),
  restart: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

let client: PoolClient = stub;

export function pool(): PoolClient {
  return client;
}

export function setPoolClient(next: PoolClient | null): void {
  client = next ?? stub;
}
