/** What happens around a spawn. */
import { settings, updateSettings } from "../../app/settings";
import { Toggle } from "./Field";

export default function SpawnPane() {
  const spawn = () => settings().spawn;
  const set = (patch: Partial<ReturnType<typeof spawn>>) => void updateSettings({ spawn: patch });

  return (
    <div class="sp-settings-pane">
      <h2>Spawn</h2>
      <Toggle
        label="Save all files before spawning"
        hint="So the file on disk is the one you see."
        checked={spawn().saveBeforeSpawn}
        onChange={(v) => set({ saveBeforeSpawn: v })}
      />
      <Toggle
        label="Clear the output on each spawn"
        checked={spawn().clearOutputOnSpawn}
        onChange={(v) => set({ clearOutputOnSpawn: v })}
      />
      <Toggle
        label="Switch to the Run tab when metrics appear"
        checked={spawn().autoShowRunTab}
        onChange={(v) => set({ autoShowRunTab: v })}
      />
      <Toggle
        label="Notify when a spawn finishes while SPAWN is in the background"
        checked={spawn().notifyWhenDone}
        onChange={(v) => set({ notifyWhenDone: v })}
      />
    </div>
  );
}
