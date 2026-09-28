/**
 * Which command installs a package for the selected interpreter. Pure, so
 * the rule that matters, never install into the system Python, is tested.
 */
import type { CandidateSource } from "../ipc";

export interface InstallInput {
  packageName: string;
  /** Path of uv, or null when it is not installed. */
  uv: string | null;
  interpreter: string | null;
  interpreterSource: CandidateSource | null;
  projectRoot: string | null;
  hasPyproject: boolean;
}

export type InstallPlan =
  | { kind: "select-interpreter"; label: string; reason: string }
  | { kind: "command"; program: string; args: string[]; cwd: string | null; display: string };

/**
 * Which command installs a package here. The project's own .venv with a
 * pyproject gets `uv add` (it records the dependency); any other
 * non-system interpreter gets `uv pip install --python <it>`, or `-m pip`
 * when uv is missing. The system Python is never touched.
 */
export function installPlan(input: InstallInput): InstallPlan {
  const { packageName, uv, interpreter, interpreterSource, projectRoot, hasPyproject } = input;
  if (!interpreter || interpreterSource === "system") {
    return {
      kind: "select-interpreter",
      label: "Create a .venv first",
      reason: interpreter
        ? "The selected interpreter is the operating system's own Python, which SPAWN never installs into. Create a project environment, then install there."
        : "No Python Interpreter is selected.",
    };
  }
  if (uv && interpreterSource === "broodVenv" && hasPyproject && projectRoot) {
    return {
      kind: "command",
      program: uv,
      args: ["add", packageName],
      cwd: projectRoot,
      display: `uv add ${packageName}`,
    };
  }
  if (uv) {
    return {
      kind: "command",
      program: uv,
      args: ["pip", "install", "--python", interpreter, packageName],
      cwd: projectRoot,
      display: `uv pip install --python ${interpreter} ${packageName}`,
    };
  }
  return {
    kind: "command",
    program: interpreter,
    args: ["-m", "pip", "install", packageName],
    cwd: projectRoot,
    display: `python -m pip install ${packageName}`,
  };
}
