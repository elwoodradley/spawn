/**
 * Create the project's own environment with uv, from the picker. Lives apart
 * from the store because it needs the Output panel, and the run controller
 * needs the store: importing both here keeps the modules acyclic.
 */
import { createSignal } from "solid-js";

import { brood } from "../app/state";
import { spawnProcess } from "../ipc";
import { output } from "../spawn/controller";
import {
  candidates,
  refreshInterpreters,
  selectInterpreter,
  setEnvError,
  uvAvailable,
} from "./store";

/** True while `uv venv` / `uv sync` runs from the picker. */
const [creatingVenv, setCreatingVenv] = createSignal(false);
export { creatingVenv };

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * `uv venv`, or `uv sync` when asked (creates .venv and installs the
 * dependencies declared in pyproject.toml). Output streams to the Output
 * panel; on success the new interpreter is selected. Never runs without the
 * person's click.
 */
export async function createProjectVenv(sync: boolean): Promise<void> {
  const root = brood();
  const uv = uvAvailable();
  if (!root || !uv || creatingVenv()) return;
  const args = sync ? ["sync"] : ["venv"];
  setCreatingVenv(true);
  setEnvError(null);
  output.system(`uv ${args.join(" ")} · in ${root}`);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      spawnProcess({ program: uv, args, cwd: root, env: {} }, (event) => {
        if (event.kind === "stdout") output.append("stdout", event.text);
        else if (event.kind === "stderr") output.append("stderr", event.text);
        else if (event.kind === "exit") resolve(event.code);
        else if (event.kind === "croak") reject(new Error(event.message));
      }).catch(reject);
    });
    if (code !== 0) {
      setEnvError(`uv ${args.join(" ")} exited with code ${code ?? "?"}`);
      return;
    }
    output.system("environment ready");
    await refreshInterpreters(root);
    const created = candidates().find((c) => c.source === "broodVenv");
    if (created) await selectInterpreter(created.path);
  } catch (err) {
    setEnvError(describe(err));
  } finally {
    setCreatingVenv(false);
  }
}
