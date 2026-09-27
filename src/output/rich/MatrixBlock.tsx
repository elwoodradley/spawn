/**
 * A confusion matrix: rows are the true class, columns the predicted one.
 * Cells carry a single-hue ramp from the plot background to the first series
 * colour, the diagonal is outlined, margins show totals, and a per-class
 * table sits beneath. When the console found the label vectors, clicking a cell
 * lists which samples landed there, ready to paste as an index list.
 */
import { createMemo, createSignal, For, Show } from "solid-js";

import { pool } from "../../pool/client";
import type { DisplayPayload } from "../../pool/protocol";
import { toast } from "../../app/toast";
import { parseCssColor, rampColor, rgbCss, type Rgb } from "./heatmap";
import {
  accuracy,
  cellIntensity,
  classRows,
  formatPct,
  indicesAsList,
  prefersLightText,
  sortClassRows,
  type ClassKey,
} from "./matrix";

type MatrixPayload = Extract<DisplayPayload, { kind: "matrix" }>;

const FALLBACK_LOW: Rgb = [24, 28, 32];
const FALLBACK_HIGH: Rgb = [111, 179, 210];

export default function MatrixBlock(props: { payload: MatrixPayload }) {
  const [sortKey, setSortKey] = createSignal<ClassKey>("label");
  const [sortDir, setSortDir] = createSignal<"asc" | "desc">("asc");
  const [picked, setPicked] = createSignal<{ row: number; col: number; ids: number[] } | null>(
    null,
  );
  const [loading, setLoading] = createSignal(false);

  const n = () => props.payload.values.length;
  const label = (i: number) => props.payload.labels?.[i] ?? String(i);
  const max = createMemo(() => Math.max(1, ...props.payload.values.flat()));

  const colours = createMemo(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      low: parseCssColor(style.getPropertyValue("--sp-plot-bg")) ?? FALLBACK_LOW,
      high: parseCssColor(style.getPropertyValue("--sp-plot-series-0")) ?? FALLBACK_HIGH,
    };
  });

  const cellStyle = (value: number) => {
    const bg = rampColor(cellIntensity(value, max()), colours().low, colours().high);
    return {
      background: rgbCss(bg),
      color: prefersLightText(bg) ? "var(--sp-plot-fg)" : "var(--sp-plot-bg)",
    };
  };

  const rows = createMemo(() =>
    sortClassRows(classRows(props.payload.labels, props.payload.perClass), sortKey(), sortDir()),
  );

  const sortBy = (key: ClassKey) => {
    if (sortKey() === key) setSortDir(sortDir() === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  };

  const pick = async (row: number, col: number) => {
    if (!props.payload.samples) return;
    setLoading(true);
    try {
      const ids = await pool().matrixCells(props.payload.ref, row, col);
      setPicked({ row, col, ids });
    } finally {
      setLoading(false);
    }
  };

  const copyIds = async () => {
    const p = picked();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(indicesAsList(p.ids));
      toast("Copied index list", { kind: "success" });
    } catch {
      toast("Could not copy; select the text instead", { kind: "croak" });
    }
  };

  const acc = () => accuracy(props.payload.values);

  return (
    <div class="sp-rich sp-rich--matrix">
      <div class="sp-rich__bar">
        <span class="sp-rich__badge">confusion matrix</span>
        <span class="mono">
          {n()} × {n()}
        </span>
        <Show when={acc() !== null}>
          <span class="sp-rich__muted">accuracy {formatPct(acc())}</span>
        </Show>
        <Show when={props.payload.samples}>
          <span class="sp-rich__muted">click a cell for its samples</span>
        </Show>
      </div>
      <div
        class="sp-matrix"
        style={{ "grid-template-columns": `auto repeat(${n()}, minmax(2.6em, 1fr)) auto` }}
        role="table"
        aria-label="confusion matrix, rows true, columns predicted"
      >
        <div class="sp-matrix__corner">
          <span class="sp-matrix__axis">true ↓ · predicted →</span>
        </div>
        <For each={props.payload.values}>
          {(_, j) => <div class="sp-matrix__col-label">{label(j())}</div>}
        </For>
        <div class="sp-matrix__total-label">total</div>
        <For each={props.payload.values}>
          {(row, i) => (
            <>
              <div class="sp-matrix__row-label">{label(i())}</div>
              <For each={row}>
                {(value, j) => (
                  <button
                    type="button"
                    class="sp-matrix__cell mono"
                    classList={{
                      "is-diagonal": i() === j(),
                      "is-picked": picked()?.row === i() && picked()?.col === j(),
                      "is-clickable": props.payload.samples,
                    }}
                    style={cellStyle(value)}
                    title={`true ${label(i())} · predicted ${label(j())} · ${value}`}
                    onClick={() => void pick(i(), j())}
                    disabled={!props.payload.samples}
                  >
                    {value}
                  </button>
                )}
              </For>
              <div class="sp-matrix__total mono">{props.payload.rowTotals[i()]}</div>
            </>
          )}
        </For>
        <div class="sp-matrix__total-label">total</div>
        <For each={props.payload.colTotals}>
          {(t) => <div class="sp-matrix__total mono">{t}</div>}
        </For>
        <div class="sp-matrix__total mono">
          {props.payload.rowTotals.reduce((a, b) => a + b, 0)}
        </div>
      </div>
      <Show when={picked()}>
        {(p) => (
          <div class="sp-matrix__samples">
            <span>
              {p().ids.length} sample{p().ids.length === 1 ? "" : "s"} with true {label(p().row)}{" "}
              predicted {label(p().col)}
              {p().ids.length >= 200 ? " (first 200)" : ""}
              {loading() ? " …" : ""}
            </span>
            <button type="button" class="sp-rich__button" onClick={() => void copyIds()}>
              Copy as list
            </button>
            <code class="sp-matrix__ids mono">{indicesAsList(p().ids)}</code>
          </div>
        )}
      </Show>
      <table class="sp-matrix__classes">
        <thead>
          <tr>
            <For each={["label", "precision", "recall", "f1", "support"] as ClassKey[]}>
              {(key) => (
                <th>
                  <button type="button" class="sp-matrix__sort" onClick={() => sortBy(key)}>
                    {key === "label" ? "class" : key}
                    {sortKey() === key ? (sortDir() === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={rows()}>
            {(r) => (
              <tr>
                <td>{r.label}</td>
                <td class="mono">{formatPct(r.precision)}</td>
                <td class="mono">{formatPct(r.recall)}</td>
                <td class="mono">{formatPct(r.f1)}</td>
                <td class="mono">{r.support}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
