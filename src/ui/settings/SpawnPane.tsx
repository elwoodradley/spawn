/** What happens around a spawn. */
import { settings, updateSettings } from "../../app/settings";
import { Field, NumberInput, Toggle } from "./Field";

export default function SpawnPane() {
  const spawn = () => settings().spawn;
  const set = (patch: Partial<ReturnType<typeof spawn>>) => void updateSettings({ spawn: patch });
  const run = () => settings().run;

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
      <h2>Run panel</h2>
      <Field
        label="Runs to keep for comparison"
        hint="Finished runs whose curves can be overlaid on the next one. 0 keeps none."
      >
        <NumberInput
          value={run().keepRuns}
          min={0}
          max={20}
          onInput={(raw) => {
            const n = Number.parseInt(raw, 10);
            if (Number.isFinite(n)) void updateSettings({ run: { keepRuns: n } });
          }}
        />
      </Field>
      <Toggle
        label="Overlay previous runs on the live charts"
        hint="Dashed, muted lines behind the current run; toggle each one in the chart legend."
        checked={run().overlayPrevious}
        onChange={(v) => void updateSettings({ run: { overlayPrevious: v } })}
      />
    </div>
  );
}
