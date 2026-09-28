/** Editor behaviour: indentation, wrapping, gutters, autosave, save clean-ups. */
import { Show } from "solid-js";

import { settings, updateSettings } from "../../app/settings";
import { DIAGNOSTIC_LEVELS, LEVEL_LABELS } from "../../lsp/diagnostics";
import { lspDetail, lspStatus } from "../../lsp/server";
import { Field, NumberInput, Select, TextInput, Toggle } from "./Field";

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
      <Toggle
        label="Inline values"
        hint="After a run in the Interactive Console, show each assigned variable's shape or value at the end of its line."
        checked={editor().inlineValues}
        onChange={(v) => set({ inlineValues: v })}
      />

      <h3>Language intelligence</h3>
      <p class="sp-settings__hint">
        Completion, problems, hover documentation, signatures and go-to-definition come from
        pyright, the standard Python language server. Status: {lspStatus()}
        {lspDetail() ? ` · ${lspDetail()}` : ""}
      </p>
      <Toggle
        label="Enable language intelligence (pyright)"
        checked={settings().lsp.enabled}
        onChange={(v) => void updateSettings({ lsp: { enabled: v } })}
      />
      <Field label="Problems shown" hint="Essential keeps a beginner's editor free of noise.">
        <Select
          value={settings().lsp.diagnostics}
          options={DIAGNOSTIC_LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] }))}
          onChange={(v) => void updateSettings({ lsp: { diagnostics: v } })}
        />
      </Field>
      <Toggle
        label="Run pyright through uv when it is not installed"
        checked={settings().lsp.useUv}
        onChange={(v) => void updateSettings({ lsp: { useUv: v } })}
      />
      <p class="sp-settings__hint">
        The first run downloads pyright and its own Node.js into uv's cache (about 250 MB). Nothing
        is installed into your project.
      </p>
      <Field label="pyright-langserver path" hint="Leave empty to find it on PATH.">
        <TextInput
          value={settings().lsp.serverPath ?? ""}
          placeholder="auto"
          onInput={(v) => void updateSettings({ lsp: { serverPath: v.trim() ? v.trim() : null } })}
        />
      </Field>

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
