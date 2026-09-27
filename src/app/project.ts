/**
 * Per-project settings, kept in `<project>/.spawn/project.json` so they
 * travel with the folder (and can be committed, like an editor config).
 *
 * Today only `workingDirectory` is read. `pythonPath` and `testCommand` are
 * reserved for the interpreter and Tests work and must round-trip untouched.
 */
import { createEffect, createRoot, createSignal, on } from "solid-js";
import { z } from "zod";

import { baseName, dirName, joinPath, makeDir, pathExists, readText, writeText } from "../ipc";
import { settings } from "./settings";
import { brood } from "./state";

export const WorkingDirectory = z.enum(["file", "project"]);
export type WorkingDirectory = z.infer<typeof WorkingDirectory>;

export const ProjectSettingsSchema = z
  .object({
    workingDirectory: WorkingDirectory.optional(),
    pythonPath: z.string().nullable().optional(),
    testCommand: z.array(z.string()).nullable().optional(),
  })
  .passthrough();
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const PROJECT_DIR = ".spawn";
export const PROJECT_FILE = "project.json";

const [projectSettings, setProjectSettings] = createSignal<ProjectSettings>({});
export { projectSettings };

/** Accept whatever is on disk; unknown keys survive, bad values are dropped. */
export function normalizeProjectSettings(input: unknown): ProjectSettings {
  const direct = ProjectSettingsSchema.safeParse(input);
  if (direct.success) return direct.data;
  if (typeof input !== "object" || input === null) return {};
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };
  for (const key of ["workingDirectory", "pythonPath", "testCommand"] as const) {
    const shape = ProjectSettingsSchema.shape[key];
    if (!shape.safeParse(raw[key]).success) delete out[key];
  }
  return ProjectSettingsSchema.parse(out);
}

function settingsPath(root: string): string {
  return joinPath(root, PROJECT_DIR, PROJECT_FILE);
}

export async function loadProjectSettings(root: string | null): Promise<ProjectSettings> {
  if (!root) {
    setProjectSettings({});
    return {};
  }
  let loaded: ProjectSettings = {};
  try {
    const path = settingsPath(root);
    if (await pathExists(path)) loaded = normalizeProjectSettings(JSON.parse(await readText(path)));
  } catch {
    loaded = {};
  }
  setProjectSettings(loaded);
  return loaded;
}

/** Merge a patch into the project file; `undefined` in the patch removes a key. */
export async function updateProjectSettings(patch: Partial<ProjectSettings>): Promise<void> {
  const root = brood();
  if (!root) return;
  const next: Record<string, unknown> = { ...projectSettings() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const normalized = normalizeProjectSettings(next);
  setProjectSettings(normalized);
  const dir = joinPath(root, PROJECT_DIR);
  if (!(await pathExists(dir))) await makeDir(dir);
  await writeText(settingsPath(root), `${JSON.stringify(normalized, null, 2)}\n`);
}

/** The project's choice if it made one, else the global default. */
export function effectiveWorkingDirectoryMode(): WorkingDirectory {
  return projectSettings().workingDirectory ?? settings().run.workingDirectory;
}

/**
 * Where a run of `filePath` starts: the file's own folder (what `python
 * file.py` from a terminal gives you) or the project root, per the mode.
 * Without a project, always the file's folder.
 */
export function resolveWorkingDirectory(
  filePath: string,
  mode: WorkingDirectory = effectiveWorkingDirectoryMode(),
  root: string | null = brood(),
): string {
  if (mode === "project" && root) return root;
  return dirName(filePath);
}

/** `puzzles/` for display when inside the project, else the full path. */
export function describeWorkingDirectory(cwd: string, root: string | null = brood()): string {
  if (root && (cwd === root || cwd.startsWith(`${root}/`) || cwd.startsWith(`${root}\\`))) {
    const rel = cwd.slice(root.length).replace(/^[\\/]+/, "");
    return rel ? `${rel}/` : `${baseName(root)}/`;
  }
  return cwd;
}

/**
 * Reload the project file whenever the project changes. Called once from App
 * on mount rather than at import time, so module load order (state ↔ editor
 * ↔ run modules form a cycle) cannot run the effect before `brood` exists.
 */
export function installProjectSettings(): () => void {
  return createRoot((dispose) => {
    createEffect(on(brood, (root) => void loadProjectSettings(root)));
    return dispose;
  });
}
