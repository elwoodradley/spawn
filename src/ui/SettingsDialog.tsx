/**
 * The Settings window: a section list on the left, live forms on the right.
 * Nothing needs saving; every control writes through `updateSettings`.
 */
import { createSignal, For, Match, Show, Switch } from "solid-js";

import { resetSettings } from "../app/settings";
import { toast } from "../app/toast";
import { confirm } from "../ipc";
import AppearancePane from "./settings/AppearancePane";
import EditorPane from "./settings/EditorPane";
import PatternsPane from "./settings/PatternsPane";
import ShortcutsPane from "./settings/ShortcutsPane";
import SpawnPane from "./settings/SpawnPane";
import "./SettingsDialog.css";

export type SettingsSection = "appearance" | "editor" | "spawn" | "patterns" | "shortcuts";

const SECTIONS: ReadonlyArray<{ id: SettingsSection; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "spawn", label: "Spawn" },
  { id: "patterns", label: "Run patterns" },
  { id: "shortcuts", label: "Shortcuts" },
];

const [isOpen, setOpen] = createSignal(false);
const [section, setSection] = createSignal<SettingsSection>("appearance");

export function openSettings(which: SettingsSection = "appearance"): void {
  setSection(which);
  setOpen(true);
}

export function closeSettings(): void {
  setOpen(false);
}

export function isSettingsOpen(): boolean {
  return isOpen();
}

async function resetAll(): Promise<void> {
  if (!(await confirm("Reset every setting to its default?"))) return;
  await resetSettings();
  toast("Settings reset", { kind: "success" });
}

export default function SettingsDialog() {
  return (
    <Show when={isOpen()}>
      <div
        class="sp-settings-backdrop"
        onClick={closeSettings}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeSettings();
          }
        }}
      >
        <div
          class="sp-settings"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          onClick={(e) => e.stopPropagation()}
        >
          <nav class="sp-settings__nav" aria-label="Settings sections">
            <For each={SECTIONS}>
              {(item) => (
                <button
                  class="sp-settings__nav-item"
                  classList={{ "is-active": section() === item.id }}
                  ref={(el) => {
                    if (item.id === section()) queueMicrotask(() => el.focus());
                  }}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              )}
            </For>
            <span class="sp-settings__nav-spacer" />
            <button class="sp-settings__nav-item is-danger" onClick={() => void resetAll()}>
              Reset all settings
            </button>
          </nav>
          <div class="sp-settings__body">
            <Switch>
              <Match when={section() === "appearance"}>
                <AppearancePane />
              </Match>
              <Match when={section() === "editor"}>
                <EditorPane />
              </Match>
              <Match when={section() === "spawn"}>
                <SpawnPane />
              </Match>
              <Match when={section() === "patterns"}>
                <PatternsPane />
              </Match>
              <Match when={section() === "shortcuts"}>
                <ShortcutsPane />
              </Match>
            </Switch>
          </div>
          <button class="sp-settings__close" title="Close (Esc)" onClick={closeSettings}>
            ×
          </button>
        </div>
      </div>
    </Show>
  );
}
