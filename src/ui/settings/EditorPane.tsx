/** Editor behaviour: indentation, wrapping, gutters, autosave, save clean-ups. */
import { Show } from "solid-js";

import { settings, updateSettings } from "../../app/settings";
import { Field, NumberInput, Select, Toggle } from "./Field";

export default function EditorPane() {
  const editor = () => settings().editor;
  const set = (patch: Partial<ReturnType<typeof editor>>) => void updateSettings({ editor: patch });

  return (
    <div class="sp-settings-pane">
      <h2>Editor</h2>

      <div class="sp-settings-row">
        <Field label="Tab size" hint="Spaces per indent level. Python wants 4.">
          <NumberInput
            value={editor().tabSize}
            min={1}
            max={8}
            onInput={(v) => {
              const n = Number.parseInt(v, 10);
              if (Number.isFinite(n)) set({ tabSize: Math.min(8, Math.max(1, n)) });
            }}
          />
        </Field>
      </div>

      <Toggle
        label="Word wrap"
        hint="Alt-Z toggles it too."
        checked={editor().wordWrap}
        onChange={(v) => set({ wordWrap: v })}
      />
      <Toggle
        label="Line numbers"
        checked={editor().lineNumbers}
        onChange={(v) => set({ lineNumbers: v })}
      />
      <Toggle
        label="Highlight the active line"
        checked={editor().highlightActiveLine}
        onChange={(v) => set({ highlightActiveLine: v })}
      />

      <h3>Saving</h3>

      <Field label="Autosave">
        <Select
          value={editor().autosave}
          options={[
            { value: "off", label: "Off" },
            { value: "afterDelay", label: "After a delay" },
            { value: "onFocusChange", label: "When switching tabs or windows" },
          ]}
          onChange={(v) => set({ autosave: v })}
        />
      </Field>
      <Show when={editor().autosave === "afterDelay"}>
        <Field label="Delay (ms)">
          <NumberInput
            value={editor().autosaveDelayMs}
            min={100}
            max={60_000}
            step={100}
            onInput={(v) => {
              const n = Number.parseInt(v, 10);
              if (Number.isFinite(n)) set({ autosaveDelayMs: Math.min(60_000, Math.max(100, n)) });
            }}
          />
        </Field>
      </Show>
      <Toggle
        label="Trim trailing whitespace on save"
        checked={editor().trimTrailingWhitespace}
        onChange={(v) => set({ trimTrailingWhitespace: v })}
      />
      <Toggle
        label="Insert a final newline on save"
        checked={editor().insertFinalNewline}
        onChange={(v) => set({ insertFinalNewline: v })}
      />
    </div>
  );
}
