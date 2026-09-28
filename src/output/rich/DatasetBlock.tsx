/**
 * The dataset check card: what the console noticed about a DataFrame or 2-D
 * array right after the cell that created it. Findings are worded for a
 * first ML course; warnings first, notes after, "No problems found" when the
 * list is empty. The column table folds out, and the card can ask the
 * tracker never to check this variable again this session.
 */
import { createSignal, For, Show } from "solid-js";

import { dismissDatasetChecks } from "../../dataset/tracker";
import type { DatasetFinding, DisplayPayload } from "../../pool/protocol";
import Icon from "../../ui/Icon";
import "./DatasetBlock.css";

type DatasetPayload = Extract<DisplayPayload, { kind: "dataset" }>;

const count = (n: number) => n.toLocaleString();

export default function DatasetBlock(props: { payload: DatasetPayload }) {
  const [showColumns, setShowColumns] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);

  const health = () => props.payload.health;
  const findings = () => health().findings;
  const what = () => (health().kind === "array" ? "array" : "DataFrame");

  const dismiss = () => {
    dismissDatasetChecks(props.payload.name);
    setDismissed(true);
  };

  return (
    <div class="sp-rich sp-dataset">
      <div class="sp-rich__bar sp-dataset__bar">
        <span class="sp-dataset__title">
          Dataset check: <span class="mono">{props.payload.name}</span>
        </span>
        <span class="sp-rich__muted">
          {count(health().rows)} rows × {count(health().cols)} columns
        </span>
        <Show when={health().sampled < health().rows}>
          <span class="sp-rich__muted">first {count(health().sampled)} rows checked</span>
        </Show>
        <span class="sp-dataset__actions">
          <button
            class="sp-rich__button"
            aria-expanded={showColumns()}
            onClick={() => setShowColumns((v) => !v)}
          >
            {showColumns() ? "Hide columns" : "Columns"}
          </button>
          <Show
            when={!dismissed()}
            fallback={<span class="sp-rich__muted">not checked again this session</span>}
          >
            <button
              class="sp-rich__button"
              title={`Skip ${props.payload.name} for the rest of this session, even if it changes`}
              onClick={dismiss}
            >
              Don't check this variable again
            </button>
          </Show>
        </span>
      </div>
      <Show
        when={findings().length > 0}
        fallback={
          <div class="sp-dataset__clean">
            <Icon name="check" size={14} /> No problems found in this {what()}
          </div>
        }
      >
        <ul class="sp-dataset__list">
          <For each={findings()}>{(f) => <FindingRow finding={f} />}</For>
        </ul>
      </Show>
      <Show when={health().partial}>
        <div class="sp-dataset__note">
          Some checks were skipped to keep this fast; the {what()} is large or wide.
        </div>
      </Show>
      <Show when={showColumns()}>
        <div class="sp-rich__scroll sp-dataset__columns-wrap">
          <table class="sp-dataset__columns">
            <thead>
              <tr>
                <th>column</th>
                <th>type</th>
                <th class="is-numeric">missing</th>
                <th class="is-numeric">unique</th>
              </tr>
            </thead>
            <tbody>
              <For each={health().columns}>
                {(c) => (
                  <tr>
                    <td class="mono">{c.name}</td>
                    <td class="mono">{c.dtype}</td>
                    <td class="is-numeric" classList={{ "is-flagged": c.missing > 0 }}>
                      {count(c.missing)}
                    </td>
                    <td class="is-numeric">{c.unique === null ? "–" : count(c.unique)}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}

function FindingRow(props: { finding: DatasetFinding }) {
  const warn = () => props.finding.severity === "warn";
  return (
    <li class="sp-dataset__item" classList={{ "is-warn": warn(), "is-info": !warn() }}>
      <span class="sp-dataset__icon" role="img" aria-label={warn() ? "warning" : "note"}>
        {warn() ? "!" : "i"}
      </span>
      <span class="sp-dataset__body">
        <span class="sp-dataset__heading">{props.finding.title}</span>
        <span class="sp-dataset__detail">{props.finding.detail}</span>
      </span>
    </li>
  );
}
