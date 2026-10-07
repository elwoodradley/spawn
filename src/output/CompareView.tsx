/**
 * Two kept runs side by side, in words first: which settings changed in the
 * code, how each final metric moved, then a table of every final value and
 * the line diff. Replaces the charts in the Metrics tab until closed.
 */
import { createMemo, For, Show } from "solid-js";

import { compareRuns, fmt, type MetricRow } from "../spawn/compare";
import { runLabel, type RunRecord } from "../spawn/runHistory";
import CodeDiff from "./CodeDiff";
import "./CompareView.css";

export default function CompareView(props: { pair: [RunRecord, RunRecord]; onClose: () => void }) {
  const cmp = createMemo(() => compareRuns(props.pair[0], props.pair[1]));
  const a = () => cmp().a;
  const b = () => cmp().b;

  return (
    <section class="sp-compare" aria-label="Compare runs">
      <header class="sp-compare__head">
        <div class="sp-compare__title">
          <span>
            What changed between run #{a().id} and run #{b().id}?
          </span>
          <span class="sp-compare__meta">
            <span title={a().command}>
              {a().file} · {runLabel(a())}
            </span>
            {" → "}
            <span title={b().command}>
              {b().file} · {runLabel(b())}
            </span>
          </span>
        </div>
        <button
          class="sp-compare__close"
          title="Back to the charts"
          onClick={() => props.onClose()}
        >
          Close
        </button>
      </header>
      <div class="sp-compare__body">
        <ul class="sp-compare__findings">
          <For each={cmp().findings}>
            {(f) => (
              <li
                classList={{
                  "is-better": f.direction === "better",
                  "is-worse": f.direction === "worse",
                  "is-note": f.kind === "note",
                }}
              >
                {f.text}
              </li>
            )}
          </For>
        </ul>
        <Show when={cmp().rows.length > 0}>
          <table class="sp-compare__table">
            <thead>
              <tr>
                <th>final metric</th>
                <th>run #{a().id}</th>
                <th>run #{b().id}</th>
                <th>change</th>
              </tr>
            </thead>
            <tbody>
              <For each={cmp().rows}>{(row) => <Row row={row} />}</For>
            </tbody>
          </table>
        </Show>
        {/* Keyed on the pair: unfolded stretches belong to one diff, not the next. */}
        <Show when={`${a().id}:${b().id}`} keyed>
          {(_pair) => <CodeDiff a={a()} b={b()} />}
        </Show>
      </div>
    </section>
  );
}

function Row(props: { row: MetricRow }) {
  const cell = (v: number | null) => (v === null ? "–" : fmt(v));
  const delta = () => {
    const d = props.row.delta;
    if (d === null) return "";
    if (d === 0) return "0";
    return `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`;
  };
  return (
    <tr>
      <td class="mono">{props.row.name}</td>
      <td class="mono">{cell(props.row.a)}</td>
      <td class="mono">{cell(props.row.b)}</td>
      <td
        class="mono"
        classList={{
          "is-better": props.row.direction === "better",
          "is-worse": props.row.direction === "worse",
        }}
      >
        {delta()}
      </td>
    </tr>
  );
}
