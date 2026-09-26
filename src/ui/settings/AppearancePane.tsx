/** Theme, fonts, sizes and zoom. Every change applies as you type. */
import { For } from "solid-js";

import { settings, updateSettings } from "../../app/settings";
import {
  MONO_FONT_SUGGESTIONS,
  parseOptionalFloat,
  parseOptionalInt,
  UI_FONT_SUGGESTIONS,
  zoomLabel,
} from "../../app/settingsHelpers";
import { currentTheme, selectTheme, themes } from "../../theme/store";
import { Field, NumberInput, TextInput } from "./Field";

export default function AppearancePane() {
  const ui = () => settings().ui;
  const theme = () => currentTheme();

  const setFont = (key: "fontUi" | "fontMono", value: string) =>
    void updateSettings({ ui: { [key]: value.trim() === "" ? null : value } });
  const setSize = (key: "sizeUi" | "sizeMono", raw: string) =>
    void updateSettings({ ui: { [key]: parseOptionalInt(raw, 8, 40) } });

  return (
    <div class="sp-settings-pane">
      <h2>Appearance</h2>

      <Field label="Theme" hint="Drop your own JSON themes in the themes folder (View › Theme).">
        <select
          class="sp-input"
          value={theme().name}
          onChange={(e) => selectTheme(e.currentTarget.value)}
        >
          <For each={themes()}>
            {(t) => (
              <option value={t.name} selected={t.name === theme().name}>
                {t.name} ({t.appearance})
              </option>
            )}
          </For>
        </select>
      </Field>

      <Field label="UI font" hint={`Leave empty for the theme's font (${theme().fonts.ui}).`}>
        <TextInput
          value={ui().fontUi ?? ""}
          placeholder={theme().fonts.ui}
          suggestions={UI_FONT_SUGGESTIONS}
          listId="sp-ui-fonts"
          onInput={(v) => setFont("fontUi", v)}
        />
      </Field>

      <Field
        label="Editor font"
        hint={`Used by the editor and output. Empty means the theme's (${theme().fonts.mono}).`}
      >
        <TextInput
          value={ui().fontMono ?? ""}
          placeholder={theme().fonts.mono}
          suggestions={MONO_FONT_SUGGESTIONS}
          listId="sp-mono-fonts"
          onInput={(v) => setFont("fontMono", v)}
        />
      </Field>

      <div class="sp-settings-row">
        <Field label="UI size (px)">
          <NumberInput
            value={ui().sizeUi}
            placeholder={String(theme().fonts.sizeUi)}
            min={8}
            max={40}
            onInput={(v) => setSize("sizeUi", v)}
          />
        </Field>
        <Field label="Editor size (px)">
          <NumberInput
            value={ui().sizeMono}
            placeholder={String(theme().fonts.sizeMono)}
            min={8}
            max={40}
            onInput={(v) => setSize("sizeMono", v)}
          />
        </Field>
        <Field label="Line height">
          <NumberInput
            value={ui().lineHeight}
            placeholder={String(theme().fonts.lineHeight)}
            min={1}
            max={3}
            step={0.05}
            onInput={(v) =>
              void updateSettings({ ui: { lineHeight: parseOptionalFloat(v, 1, 3) } })
            }
          />
        </Field>
      </div>

      <Field label={`Zoom ${zoomLabel(ui().zoom)}`} hint="Mod-= and Mod-- change it anywhere.">
        <input
          class="sp-input sp-input--range"
          type="range"
          min={50}
          max={300}
          step={10}
          value={Math.round(ui().zoom * 100)}
          onInput={(e) =>
            void updateSettings({ ui: { zoom: Number(e.currentTarget.value) / 100 } })
          }
        />
      </Field>

      <div class="sp-settings-actions">
        <button
          class="sp-dialog__button"
          onClick={() =>
            void updateSettings({
              ui: {
                fontUi: null,
                fontMono: null,
                sizeUi: null,
                sizeMono: null,
                lineHeight: null,
                zoom: 1,
              },
            })
          }
        >
          Reset to theme
        </button>
      </div>
    </div>
  );
}
