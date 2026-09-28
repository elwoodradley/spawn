/** What happens around a run. */
import { Show } from "solid-js";

import { projectSettings, updateProjectSettings } from "../../app/project";
import { settings, updateSettings } from "../../app/settings";
import { brood } from "../../app/state";
import { Field, NumberInput, Select, Toggle } from "./Field";

export default function SpawnPane() {
  const spawn = () => settings().spawn;
  const set = (patch: Partial<ReturnType<typeof spawn>>) => void updateSettings({ spawn: patch });
  const run = () => settings().run;

  return (
    <div class="sp-settings-pane">
      <h2>Run</h2>
      <Toggle
        label="Save all files before running"
        hint="So the file on disk is the one you see."
        checked={spawn().saveBeforeSpawn}
        onChange={(v) => set({ saveBeforeSpawn: v })}
      />
      <Toggle
        label="Clear the output on each run"
        checked={spawn().clearOutputOnSpawn}
        onChange={(v) => set({ clearOutputOnSpawn: v })}
      />
      <Toggle
        label="Switch to the Metrics tab when metrics appear"
        checked={spawn().autoShowRunTab}
        onChange={(v) => set({ autoShowRunTab: v })}
      />
      <Toggle
        label="Notify when a run finishes while SPAWN is in the background"
        checked={spawn().notifyWhenDone}
        onChange={(v) => set({ notifyWhenDone: v })}
      />
      <Field
        label="Working directory"
        hint="Where relative paths resolve from when you run. The file's folder matches `python tester.py` from a terminal. Applies to F5 and to cells in the Interactive Console alike."
      >
        <Select
          value={run().workingDirectory}
          options={[
            { value: "file", label: "The file's own folder" },
            { value: "project", label: "The project root" },
          ]}
          onChange={(v) => void updateSettings({ run: { workingDirectory: v } })}
        />
      </Field>
      <Show when={brood()}>
        <Field
          label="For this project"
          hint="Overrides the default above; saved in the project's own settings file."
        >
          <Select
            value={projectSettings().workingDirectory ?? "default"}
            options={[
              { value: "default", label: "Use the default" },
              { value: "file", label: "The file's own folder" },
              { value: "project", label: "The project root" },
            ]}
            onChange={(v) =>
              void updateProjectSettings({ workingDirectory: v === "default" ? undefined : v })
            }
          />
        </Field>
      </Show>
      <h2>Interactive Console</h2>
      <Toggle
        label="Check new datasets for common problems"
        hint="After a cell runs, each new DataFrame or 2-D array gets a short report in the output: missing values, class imbalance, possible leakage, columns on very different scales, duplicate rows, constant and ID columns."
        checked={settings().console.datasetChecks}
        onChange={(v) => void updateSettings({ console: { datasetChecks: v } })}
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
