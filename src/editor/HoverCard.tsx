/**
 * The compact card a hover shows. Deliberately not the rich blocks from the
 * output panel: a tooltip must answer "what is this" at a glance and get out
 * of the way. The Variables pane is where a value expands.
 */
import { For, Match, onMount, Show, Switch } from "solid-js";

import { normalize, parseCssColor, previewRange, rampColor, rgbCss } from "../output/rich/heatmap";
import { sanitizeSvg } from "../output/rich/sanitizeSvg";
import type { DisplayPayload } from "../pool/protocol";

const MAX_TEXT_LINES = 6;
const MAX_COLUMNS = 8;
const HEATMAP_PX = 96;
const THUMB_PX = 200;

export function HoverCard(props: { name: string; payload: DisplayPayload }) {
  return (
    <div class="sp-hover__card">
      <div class="sp-hover__name mono">{props.name}</div>
      <Switch>
        <Match when={props.payload.kind === "array" && props.payload}>
          {(p) => <ArrayCard payload={p()} />}
        </Match>
        <Match when={props.payload.kind === "table" && props.payload}>
          {(p) => <TableCard payload={p()} />}
        </Match>
        <Match when={props.payload.kind === "figure" && props.payload}>
          {(p) => <FigureCard payload={p()} />}
        </Match>
        <Match when={props.payload.kind === "text" && props.payload}>
          {(p) => <pre class="sp-hover__text mono">{clip(p().text)}</pre>}
        </Match>
        <Match when={props.payload.kind === "html"}>
          <div class="sp-hover__muted">html repr</div>
        </Match>
      </Switch>
      <div class="sp-hover__hint">open it in Variables to expand</div>
    </div>
  );
}

type ArrayPayload = Extract<DisplayPayload, { kind: "array" }>;
type TablePayload = Extract<DisplayPayload, { kind: "table" }>;
type FigurePayload = Extract<DisplayPayload, { kind: "figure" }>;

function ArrayCard(props: { payload: ArrayPayload }) {
  const p = () => props.payload;
  const head = () =>
    [p().library, `(${p().shape.join(", ")})`, p().dtype, p().device].filter(Boolean).join(" · ");
  const stats = () => {
    const s = p().stats;
    if (!s) return null;
    const parts = [
      `min ${fmt(s.min)}`,
      `max ${fmt(s.max)}`,
      `mean ${fmt(s.mean)}`,
      `std ${fmt(s.std)}`,
    ];
    if (s.nans > 0) parts.push(`${s.nans} NaN`);
    return parts.join(" · ");
  };
  return (
    <>
      <div class="sp-hover__line mono">{head()}</div>
      <Show when={stats()}>
        {(s) => <div class="sp-hover__line sp-hover__muted mono">{s()}</div>}
      </Show>
      <Show when={p().preview.length > 0}>
        <Heatmap preview={p().preview} />
      </Show>
    </>
  );
}

function Heatmap(props: { preview: number[][] }) {
  let canvas: HTMLCanvasElement | undefined;
  onMount(() => {
    if (!canvas) return;
    const rows = props.preview.length;
    const cols = Math.max(...props.preview.map((r) => r.length), 1);
    const cell = Math.max(1, Math.floor(HEATMAP_PX / Math.max(rows, cols)));
    canvas.width = cols * cell;
    canvas.height = rows * cell;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    const from = parseCssColor(style.getPropertyValue("--sp-plot-bg")) ?? [20, 24, 28];
    const to = parseCssColor(style.getPropertyValue("--sp-plot-series-0")) ?? [111, 179, 210];
    const nan = parseCssColor(style.getPropertyValue("--sp-color-croak")) ?? [228, 111, 111];
    const range = previewRange(props.preview) ?? [0, 1];
    props.preview.forEach((row, y) => {
      row.forEach((v, x) => {
        ctx.fillStyle = Number.isFinite(v)
          ? rgbCss(rampColor(normalize(v, range[0], range[1]), from, to))
          : rgbCss(nan);
        ctx.fillRect(x * cell, y * cell, cell, cell);
      });
    });
  });
  return <canvas class="sp-hover__heatmap" ref={(el) => (canvas = el)} />;
}

function TableCard(props: { payload: TablePayload }) {
  const p = () => props.payload;
  const label = () =>
    p().source === "pandas" ? "DataFrame" : p().source === "polars" ? "polars DataFrame" : "table";
  const shown = () => p().columns.slice(0, MAX_COLUMNS);
  const more = () => p().columns.length - shown().length;
  return (
    <>
      <div class="sp-hover__line mono">
        {label()} {p().shape[0]} × {p().shape[1]}
      </div>
      <div class="sp-hover__columns">
        <For each={shown()}>
          {(c) => (
            <span class="sp-hover__column mono">
              {c.name} <span class="sp-hover__muted">{c.dtype}</span>
            </span>
          )}
        </For>
        <Show when={more() > 0}>
          <span class="sp-hover__muted">+{more()} more</span>
        </Show>
      </div>
    </>
  );
}

function FigureCard(props: { payload: FigurePayload }) {
  const p = () => props.payload;
  return (
    <Show
      when={p().format === "png"}
      fallback={
        <div
          class="sp-hover__thumb"
          style={{ "max-width": `${THUMB_PX}px` }}
          innerHTML={sanitizeSvg(p().data)}
        />
      }
    >
      <img
        class="sp-hover__thumb"
        style={{ "max-width": `${THUMB_PX}px` }}
        src={`data:image/png;base64,${p().data}`}
        alt={p().title ?? "figure"}
      />
    </Show>
  );
}

function clip(text: string): string {
  const lines = text.split("\n");
  return lines.length <= MAX_TEXT_LINES
    ? text
    : `${lines.slice(0, MAX_TEXT_LINES).join("\n")}\n… ${lines.length - MAX_TEXT_LINES} more lines`;
}

function fmt(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  if (abs === 0) return "0";
  if (abs >= 1e4 || abs < 1e-3) return v.toExponential(2);
  return v.toPrecision(3).replace(/\.?0+$/, "");
}
