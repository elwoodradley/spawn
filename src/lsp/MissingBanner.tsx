/**
 * A slim notice above the editor when pyright is not installed: says what is
 * off and offers the two ways to fix it. Shown once per person; "Dismiss"
 * remembers. Nothing runs without a click.
 */
import { Show } from "solid-js";

import { runCommand } from "../app/commands";
import { settings, updateSettings } from "../app/settings";
import { activeFilePath } from "../app/state";
import { uvAvailable } from "../env/store";
import "./MissingBanner.css";
import { lspStatus } from "./server";

export default function MissingBanner() {
  const visible = () =>
    lspStatus() === "missing" &&
    /\.pyw?$/i.test(activeFilePath() ?? "") &&
    !settings().lsp.dismissedMissingNotice &&
    settings().lsp.enabled;

  return (
    <Show when={visible()}>
      <div class="sp-missing sp-chrome sp-no-print" role="status">
        <span class="sp-missing__text">
          Autocomplete and problem checks are off: pyright isn't installed.
        </span>
        <span class="sp-missing__actions">
          <Show when={uvAvailable()}>
            <button
              class="sp-missing__btn is-primary"
              title="Runs pyright through uv. The first start downloads pyright and its own Node.js into uv's cache; nothing is added to your project."
              onClick={() => void updateSettings({ lsp: { useUv: true } })}
            >
              Run pyright through uv (downloads ~250 MB once)
            </button>
          </Show>
          <button class="sp-missing__btn" onClick={() => void runCommand("settings.open")}>
            Settings
          </button>
          <button
            class="sp-missing__btn"
            title="Hide this notice; Settings › Editor can still turn pyright on"
            onClick={() => void updateSettings({ lsp: { dismissedMissingNotice: true } })}
          >
            Dismiss
          </button>
        </span>
      </div>
    </Show>
  );
}
