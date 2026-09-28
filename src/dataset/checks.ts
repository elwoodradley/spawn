/**
 * Dataset checks: after every Interactive Console exec, ask the console for a
 * plain-language health report on each DataFrame or 2-D array the exec
 * created or changed, and append it to the output after the exec's own
 * output. Rule-based, no model; the checks live in pool_health.py.
 */
import { settings } from "../app/settings";
import { pool } from "../pool/client";
import { onExecFinished } from "../pool/hooks";
import { output } from "../spawn/controller";
import { datasetTracker } from "./tracker";

async function report(names: readonly string[], exec: number): Promise<void> {
  for (const name of names) {
    if (datasetTracker.isDismissed(name)) continue;
    const health = await pool().datasetHealth(name);
    if (health) output.appendRich({ kind: "dataset", name, health }, exec);
  }
}

/** Subscribe to finished execs; returns the unsubscribe function. */
export function installDatasetChecks(): () => void {
  // Reports run one after another so two quick cells keep their order.
  let queue: Promise<void> = Promise.resolve();
  return onExecFinished(({ result, variables }) => {
    // Track even when the setting is off, so turning it on later does not
    // report every frame that already existed.
    const names = datasetTracker.plan(variables);
    if (!settings().console.datasetChecks || names.length === 0) return;
    queue = queue.then(() => report(names, result.exec)).catch(() => undefined);
  });
}
