/** Read-only table of every chord. */
import { For } from "solid-js";

import { shortcutRows } from "../../app/helpDialogs";

export default function ShortcutsPane() {
  return (
    <div class="sp-settings-pane">
      <h2>Keyboard shortcuts</h2>
      <p class="sp-settings-intro">
        Shortcuts are fixed for now; a remapping editor is on the list.
      </p>
      <table class="sp-shortcuts">
        <tbody>
          <For each={shortcutRows()}>
            {([title, keys]) => (
              <tr>
                <td>{title}</td>
                <td>
                  <kbd>{keys}</kbd>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
