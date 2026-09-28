/**
 * The side of the error cards that touches the machine: what the buttons
 * do, and what the matcher needs to know about the run. `installPlan` is
 * pure so the rule "never install into the system Python" is tested.
 *
 * Nothing here runs without a click, and every button's label names the
 * exact command it will run.
 */
import { createSignal } from "solid-js";

import { resolveWorkingDirectory, updateProjectSettings } from "../app/project";
import { brood } from "../app/state";
import {
  selectedCandidate,
  selectedInterpreter,
  toggleMetamorphosis,
  uvAvailable,
} from "../env/store";
import { dirName, joinPath, pathExists, spawnProcess } from "../ipc";
import { variables } from "../pool/variables";
import { output, spawnCommand, spawnFile } from "../spawn/controller";
import type { Croak } from "../spawn/croak";
import { entryFrame } from "./frames";
import { installPlan, type InstallPlan } from "./install";
import type { ActionSpec, ErrorContext, ProbeFs } from "./types";

/** What the matcher knows about the run, read reactively. */
export function buildContext(source: "run" | "console", croak: Croak): ErrorContext {
  const entry = entryFrame(croak.frames);
  const ran = spawnCommand();
  let cwd: string | null;
  if (source === "run" && ran && (!entry || ran.args.includes(entry.file))) cwd = ran.cwd;
  else if (entry) cwd = resolveWorkingDirectory(entry.file);
  else cwd = brood();
  return {
    source,
    cwd,
    projectRoot: brood(),
    consoleVariables: variables.list.map((v) => ({ name: v.name, type: v.type })),
  };
}

export const probeFs: ProbeFs = { exists: pathExists, join: joinPath, dirName };

const [installing, setInstalling] = createSignal<string | null>(null);
export { installing };

/** Run the plan, streaming its output as system lines. Resolves to the exit code. */
async function runPlan(plan: Extract<InstallPlan, { kind: "command" }>): Promise<number | null> {
  output.system(`$ ${plan.display}${plan.cwd ? ` · in ${plan.cwd}` : ""}`);
  return new Promise<number | null>((resolve, reject) => {
    spawnProcess(
      { program: plan.program, args: plan.args, cwd: plan.cwd ?? undefined, env: {} },
      (event) => {
        if (event.kind === "stdout" || event.kind === "stderr") output.append("system", event.text);
        else if (event.kind === "exit") resolve(event.code);
        else if (event.kind === "croak") reject(new Error(event.message));
      },
    ).catch(reject);
  });
}

async function currentInstallPlan(packageName: string): Promise<InstallPlan> {
  const root = brood();
  const hasPyproject = root ? await pathExists(joinPath(root, "pyproject.toml")) : false;
  return installPlan({
    packageName,
    uv: uvAvailable(),
    interpreter: selectedInterpreter(),
    interpreterSource: selectedCandidate()?.source ?? null,
    projectRoot: root,
    hasPyproject,
  });
}

// Resolved actions -------------------------------------------------------------

/** A button on the card. `run` resolves to the line shown after it finishes. */
export interface ResolvedAction {
  label: string;
  title: string;
  run(): Promise<string>;
}

async function installAction(
  spec: Extract<ActionSpec, { kind: "install" }>,
): Promise<ResolvedAction> {
  const plan = await currentInstallPlan(spec.packageName);
  if (plan.kind === "select-interpreter") {
    return {
      label: plan.label,
      title: `${plan.reason} Opens Select Python Interpreter.`,
      run: () => {
        toggleMetamorphosis(true);
        return Promise.resolve("");
      },
    };
  }
  return {
    label: `Install ${spec.packageName} · runs ${plan.display}`,
    title: `Runs ${plan.display}${plan.cwd ? ` in ${plan.cwd}` : ""}. Output streams into this panel.`,
    run: async () => {
      if (installing()) return "Another install is still running.";
      setInstalling(spec.packageName);
      try {
        const code = await runPlan(plan);
        if (code === 0) {
          const done = `Installed ${spec.packageName}. Run again.`;
          output.system(done);
          return done;
        }
        return `${plan.display} exited with code ${code ?? "?"}. The lines above say why.`;
      } catch (err) {
        return `Could not run ${plan.display}: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        setInstalling(null);
      }
    },
  };
}

function workingDirectoryAction(
  spec: Extract<ActionSpec, { kind: "workingDirectory" }>,
  context: ErrorContext,
): ResolvedAction | null {
  if (!context.projectRoot) return null;
  const where = spec.mode === "project" ? "the project root" : "the file's own folder";
  const rerun = context.source === "run" && spec.file !== null;
  return {
    label: rerun ? `Run from ${where}` : `Use ${where} as working directory`,
    title: `Saves workingDirectory = "${spec.mode}" in this project's settings file${rerun ? ", then runs the file again" : ""}.`,
    run: async () => {
      await updateProjectSettings({ workingDirectory: spec.mode });
      if (rerun && spec.file) {
        void spawnFile(spec.file);
        return `This project now runs from ${where}. Running again.`;
      }
      return `This project now runs from ${where}. Run the cell again.`;
    },
  };
}

export async function resolveActions(
  specs: readonly ActionSpec[],
  context: ErrorContext,
): Promise<ResolvedAction[]> {
  const out: ResolvedAction[] = [];
  for (const spec of specs) {
    if (spec.kind === "install") out.push(await installAction(spec));
    else {
      const action = workingDirectoryAction(spec, context);
      if (action) out.push(action);
    }
  }
  return out;
}
