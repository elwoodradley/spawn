/**
 * Commands for spawning, the output panel, and metamorphosis. The app shell
 * calls `registerSpawnCommands()` once on mount.
 */
import { createEffect, createRoot, on } from "solid-js";

import { registerCommands } from "../app/commands";
import { settings } from "../app/settings";
import { activeFilePath, brood } from "../app/state";
import {
  refreshInterpreters,
  refreshMlInfo,
  startMemoryPolling,
  toggleMetamorphosis,
} from "../env/store";
import { copyOutput, saveOutput } from "../output/outputActions";
import { showOutputTab } from "../output/OutputPanel";
import {
  openFind,
  setShowTimestamps,
  setWrapLines,
  showTimestamps,
  wrapLines,
} from "../output/view";
import { openFindInFiles } from "../ui/FindInFiles";
import { openQuickOpen } from "../ui/QuickOpen";
import {
  applyRunPatterns,
  output,
  requestStdinFocus,
  spawnFile,
  spawnStatus,
  stopSpawn,
} from "./controller";

export function registerSpawnCommands(): () => void {
  const runActive = async () => {
    const path = activeFilePath();
    if (path) await spawnFile(path);
  };

  const dispose = registerCommands([
    {
      id: "spawn.run",
      title: "Spawn: run the current file",
      keys: "F5",
      enabled: () => isPython(activeFilePath()) && spawnStatus() === "idle",
      run: runActive,
    },
    {
      id: "spawn.runAlt",
      title: "Spawn: run the current file (alternate key)",
      keys: "Mod-Enter",
      enabled: () => isPython(activeFilePath()) && spawnStatus() === "idle",
      run: runActive,
    },
    {
      id: "spawn.stop",
      title: "Spawn: stop",
      keys: "Shift-F5",
      enabled: () => spawnStatus() === "running",
      run: stopSpawn,
    },
    {
      id: "output.clear",
      title: "Output: clear",
      run: () => output.clear(),
    },
    {
      id: "output.focusStdin",
      title: "Output: focus the stdin line",
      keys: "Mod-I",
      run: requestStdinFocus,
    },
    {
      id: "metamorphosis.open",
      title: "Metamorphosis: choose an interpreter",
      run: () => toggleMetamorphosis(),
    },
    {
      id: "metamorphosis.refresh",
      title: "Metamorphosis: rediscover interpreters",
      run: () => refreshInterpreters(brood()),
    },
    {
      id: "env.probeMl",
      title: "Environment: re-probe numpy, torch and the device",
      run: refreshMlInfo,
    },
    {
      id: "output.showRun",
      title: "Output: show the run panel",
      run: () => showOutputTab("run"),
    },
    {
      id: "output.showConsole",
      title: "Output: show the console",
      run: () => showOutputTab("output"),
    },
    {
      id: "output.find",
      title: "Output: find in output",
      run: () => {
        showOutputTab("output");
        openFind();
      },
    },
    { id: "output.copy", title: "Output: copy all", run: copyOutput },
    { id: "output.save", title: "Output: save to file…", run: saveOutput },
    {
      id: "output.toggleWrap",
      title: "Output: toggle line wrapping",
      run: () => {
        setWrapLines(!wrapLines());
      },
    },
    {
      id: "output.toggleTimestamps",
      title: "Output: toggle timestamps",
      run: () => {
        setShowTimestamps(!showTimestamps());
      },
    },
    {
      id: "brood.quickOpen",
      title: "Go to file…",
      keys: "Mod-P",
      enabled: () => brood() !== null,
      run: openQuickOpen,
    },
    {
      id: "brood.findInFiles",
      title: "Find in files…",
      keys: "Mod-Shift-F",
      enabled: () => brood() !== null,
      run: openFindInFiles,
    },
  ]);

  const stopMemory = startMemoryPolling();

  // Rediscover interpreters whenever the brood changes (and once at start);
  // keep the metrics parser in step with the user's patterns.
  const disposeRoot = createRoot((disposeFn) => {
    createEffect(on(brood, (root) => void refreshInterpreters(root)));
    createEffect(on(() => settings().run.patterns, applyRunPatterns));
    return disposeFn;
  });

  return () => {
    dispose();
    disposeRoot();
    stopMemory();
  };
}

/** Only Python files spawn; a handout in a viewer tab does not. */
function isPython(path: string | null): boolean {
  return path !== null && /\.pyw?$/i.test(path);
}
