/**
 * Which variables deserve a dataset check after an exec. Pure, so the change
 * detection is unit-tested; `checks.ts` wires it to the console.
 *
 * A variable is "the same dataset" while its type, shape and size match what
 * we saw last time; reassigning it with different rows or columns makes it new
 * again, and a name that disappears is forgotten so re-creating it is checked.
 */
import type { VariableInfo } from "../pool/protocol";

/** Below this many rows the checks say nothing useful. */
export const MIN_ROWS = 20;
/** Checks per exec: a cell that builds a dozen splits should not flood the output. */
export const MAX_CHECKS_PER_EXEC = 3;

/** A pandas or polars DataFrame, or a 2-D numpy array with at least two columns. */
export function isDataset(v: VariableInfo): boolean {
  if (!v.shape || v.shape.length !== 2) return false;
  const [rows, cols] = v.shape;
  if (rows === undefined || cols === undefined || rows < MIN_ROWS || cols < 1) return false;
  if (v.type === "DataFrame") return true;
  // A square array is far more often an image, a weight matrix or a
  // distance matrix than a table of samples, so it is not checked.
  return v.type === "ndarray" && cols >= 2 && rows !== cols;
}

export function signatureOf(v: VariableInfo): string {
  return `${v.type}:${(v.shape ?? []).join("x")}:${v.size ?? "?"}`;
}

export class DatasetTracker {
  private seen = new Map<string, string>();
  private readonly dismissed = new Set<string>();

  /**
   * Names to check now, at most `max`, in the order the console lists them.
   * Every dataset variable is remembered, checked or not, so nothing is
   * reported later for an exec that did not touch it.
   */
  plan(variables: readonly VariableInfo[], max = MAX_CHECKS_PER_EXEC): string[] {
    const next = new Map<string, string>();
    const fresh: string[] = [];
    for (const v of variables) {
      if (!isDataset(v)) continue;
      const signature = signatureOf(v);
      next.set(v.name, signature);
      if (this.seen.get(v.name) !== signature && !this.dismissed.has(v.name)) fresh.push(v.name);
    }
    this.seen = next;
    return fresh.slice(0, max);
  }

  /** "Don't check this variable again": for the rest of the session. */
  dismiss(name: string): void {
    this.dismissed.add(name);
  }

  isDismissed(name: string): boolean {
    return this.dismissed.has(name);
  }

  reset(): void {
    this.seen.clear();
    this.dismissed.clear();
  }
}

/** The one tracker the console feeds and the dataset card's dismiss button talks to. */
export const datasetTracker = new DatasetTracker();

export function dismissDatasetChecks(name: string): void {
  datasetTracker.dismiss(name);
}
