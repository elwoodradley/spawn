/**
 * Commands for spawning, the output panel, and metamorphosis. The app shell
 * calls `registerSpawnCommands()` once on mount.
 */
import { createEffect, createRoot, on } from "solid-js";

import { registerCommands } from "../app/commands";
import { activeFilePath, brood } from "../app/state";
import {
  refreshInterpreters,
  refreshMlInfo,
  startMemoryPolling,
  toggleMetamorphosis,
} from "../env/store";
import { showOutputTab } from "../output/OutputPanel";
import {
  loadRunPatterns,
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
      enabled: () => activeFilePath() !== null && spawnStatus() === "idle",
      run: runActive,
    },
    {
      id: "spawn.runAlt",
      title: "Spawn: run the current file (alternate key)",
      keys: "Mod-Enter",
      enabled: () => activeFilePath() !== null && spawnStatus() === "idle",
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
  ]);

  void loadRunPatterns();
  const stopMemory = startMemoryPolling();

  // Rediscover interpreters whenever the brood changes (and once at start).
  const disposeRoot = createRoot((disposeFn) => {
    createEffect(on(brood, (root) => void refreshInterpreters(root)));
    return disposeFn;
  });

  return () => {
    dispose();
    disposeRoot();
    stopMemory();
  };
}
