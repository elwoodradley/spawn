/** Things you can do with the console's text: copy it, save it. */
import { setLastCroak } from "../app/state";
import { baseName, pickSavePath, writeText } from "../ipc";
import { output, spawnCommand } from "../spawn/controller";

export async function copyOutput(): Promise<void> {
  try {
    await navigator.clipboard.writeText(output.text());
    output.system(`copied ${output.lines.length} lines`);
  } catch {
    setLastCroak("Could not access the clipboard");
  }
}

export async function saveOutput(): Promise<void> {
  const ran = spawnCommand();
  const stem = ran
    ? baseName(ran.args[ran.args.length - 1] ?? "spawn").replace(/\.py$/, "")
    : "spawn";
  const path = await pickSavePath(`${stem}-output.txt`);
  if (!path) return;
  try {
    await writeText(path, `${output.text()}\n`);
    output.system(`saved output to ${path}`);
  } catch (err) {
    setLastCroak(`Could not save output: ${err instanceof Error ? err.message : String(err)}`);
  }
}
