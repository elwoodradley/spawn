/**
 * User metric patterns for the run panel. Each row is a name and a regex
 * with one capture group for the number. Rows persist once they are valid.
 */
import { createSignal, For, Show } from "solid-js";

import { settings, updateSettings, type RunPattern } from "../../app/settings";
import { validatePattern, validatePatternName } from "../../app/settingsHelpers";

export default function PatternsPane() {
  // Local drafts so a half-typed regex does not get persisted or rejected.
  const [drafts, setDrafts] = createSignal<RunPattern[]>([...settings().run.patterns]);

  const persist = (rows: RunPattern[]) => {
    setDrafts(rows);
    const valid = rows.filter(
      (r) => validatePatternName(r.name) === null && validatePattern(r.regex) === null,
    );
    void updateSettings({ run: { patterns: valid } });
  };

  const update = (index: number, patch: Partial<RunPattern>) =>
    persist(drafts().map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div class="sp-settings-pane">
      <h2>Run patterns</h2>
      <p class="sp-settings-intro">
        SPAWN already reads <code>loss: 0.23</code>, <code>acc=0.9</code>, tqdm bars, epochs and
        steps. Add a pattern for anything else. Use one capture group for the number, e.g.{" "}
        <code>val loss is (\d+\.\d+)</code>.
      </p>
      <div class="sp-patterns">
        <For each={drafts()}>
          {(row, i) => {
            const nameError = () => validatePatternName(row.name);
            const regexError = () => validatePattern(row.regex);
            return (
              <div class="sp-pattern" classList={{ "is-invalid": !!(nameError() || regexError()) }}>
                <input
                  class="sp-input sp-pattern__name"
                  placeholder="name"
                  value={row.name}
                  spellcheck={false}
                  onInput={(e) => update(i(), { name: e.currentTarget.value })}
                />
                <input
                  class="sp-input mono sp-pattern__regex"
                  placeholder="regex with (one) group"
                  value={row.regex}
                  spellcheck={false}
                  onInput={(e) => update(i(), { regex: e.currentTarget.value })}
                />
                <button
                  class="sp-pattern__remove"
                  title="Remove"
                  onClick={() => persist(drafts().filter((_, j) => j !== i()))}
                >
                  ×
                </button>
                <Show when={nameError() || regexError()}>
                  <span class="sp-pattern__error">{nameError() ?? regexError()}</span>
                </Show>
              </div>
            );
          }}
        </For>
        <Show when={drafts().length === 0}>
          <p class="sp-settings-empty">No custom patterns yet.</p>
        </Show>
      </div>
      <div class="sp-settings-actions">
        <button
          class="sp-dialog__button"
          onClick={() => persist([...drafts(), { name: "", regex: "" }])}
        >
          Add pattern
        </button>
      </div>
    </div>
  );
}
