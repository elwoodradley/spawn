/**
 * Commands for Check Before Submitting. The app shell registers them once.
 * F6 sits next to F5 (Run File); Ctrl+Shift+Enter already runs a cell.
 */
import { registerCommands } from "../app/commands";
import { setOutputVisible } from "../app/layout";
import { activeFilePath } from "../app/state";
import { showOutputTab } from "../output/OutputPanel";
import { cancelCheck, checkStatus, runCheck } from "./runner";

const isPython = (path: string | null) => path !== null && /\.pyw?$/i.test(path);

export async function checkActiveFile(): Promise<void> {
  const path = activeFilePath();
  if (!path) return;
  setOutputVisible(true);
  showOutputTab("check");
  await runCheck(path);
}

export function registerCheckCommands(): () => void {
  return registerCommands([
    {
      id: "check.run",
      title: "Check Before Submitting",
      keys: "F6",
      enabled: () => isPython(activeFilePath()) && checkStatus() === "idle",
      run: checkActiveFile,
    },
    {
      id: "check.cancel",
      title: "Cancel Check Before Submitting",
      enabled: () => checkStatus() === "running",
      run: cancelCheck,
    },
    {
      id: "output.showCheck",
      title: "Output: show the Check tab",
      run: () => showOutputTab("check"),
    },
  ]);
}
