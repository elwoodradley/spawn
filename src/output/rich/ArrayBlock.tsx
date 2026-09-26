/**
 * An array or tensor: shape, dtype, device, stats, and a heatmap of the
 * preview slice. One hue from the plot background to the first series
 * colour; hovering a cell shows its value.
 */
import { createEffect, createSignal, onMount, Show } from "solid-js";

import type { DisplayPayload } from "../../pool/protocol";
import { normalize, parseCssColor, previewRange, rampColor, rgbCss, type Rgb } from "./heatmap";
import { formatCell } from "./table";

type ArrayPayload = Extract<DisplayPayload, { kind: "array" }>;

const MAX_PX = 256;
const FALLBACK_LOW: Rgb = [24, 28, 32];
const FALLBACK_HIGH: Rgb = [111, 179, 210];

export default function ArrayBlock(props: { payload: ArrayPayload }) {
  let canvas: HTMLCanvasElement | undefined;
  const [hover, setHover] = createSignal<{ r: number; c: number; v: number } | null>(null);

  const rows = () => props.payload.preview.length;
  const cols = () => props.payload.preview[0]?.length ?? 0;
  const cell = () => Math.max(1, Math.floor(MAX_PX / Math.max(rows(), cols(), 1)));
  const range = () => previewRange(props.payload.preview);

  const draw = () => {
    if (!canvas || rows() === 0 || cols() === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const style = getComputedStyle(document.documentElement);
    const low = parseCssColor(style.getPropertyValue("--sp-plot-bg")) ?? FALLBACK_LOW;
    const high = parseCssColor(style.getPropertyValue("--sp-plot-series-0")) ?? FALLBACK_HIGH;
    const nan = parseCssColor(style.getPropertyValue("--sp-color-croak")) ?? [228, 111, 111];
    const size = cell();
    canvas.width = cols() * size;
    canvas.height = rows() * size;
    const r = range();
    props.payload.preview.forEach((row, y) => {
      row.forEach((v, x) => {
        ctx.fillStyle = Number.isFinite(v)
          ? rgbCss(rampColor(r ? normalize(v, r[0], r[1]) : 0.5, low, high))
          : rgbCss(nan);
        ctx.fillRect(x * size, y * size, size, size);
      });
    });
  };

  onMount(draw);
  createEffect(draw);

  const onMove = (e: MouseEvent) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * cols());
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * rows());
    const v = props.payload.preview[r]?.[c];
    setHover(v === undefined ? null : { r, c, v });
  };

  const stats = () => props.payload.stats;
  const axesNote = () => {
    const axes = props.payload.previewAxes;
    if (!axes || props.payload.shape.length <= 2) return null;
    return `showing axes ${axes[0]} × ${axes[1]} of ${props.payload.shape.length}, first index elsewhere`;
  };

  return (
    <div class="sp-rich sp-rich--array">
      <div class="sp-rich__bar">
        <span class="sp-rich__badge mono">shape ({props.payload.shape.join(", ")})</span>
        <span class="sp-rich__muted mono">{props.payload.dtype}</span>
        <Show when={props.payload.device}>
          <span class="sp-rich__muted mono">{props.payload.device}</span>
        </Show>
        <Show when={props.payload.requiresGrad}>
          <span class="sp-rich__muted mono">requires_grad</span>
        </Show>
        <span class="sp-rich__muted">{props.payload.library}</span>
      </div>
      <Show when={stats()}>
        {(s) => (
          <div class="sp-rich__stats mono">
            <span>min {formatCell(s().min)}</span>
            <span>max {formatCell(s().max)}</span>
            <span>mean {formatCell(s().mean)}</span>
            <span>std {formatCell(s().std)}</span>
            <Show when={s().nans > 0}>
              <span class="sp-rich__warn">{s().nans} NaN</span>
            </Show>
          </div>
        )}
      </Show>
      <Show when={rows() > 0 && cols() > 0}>
        <div class="sp-rich__heat">
          <canvas
            ref={(el) => (canvas = el)}
            class="sp-rich__canvas"
            style={{ width: `${cols() * cell()}px`, height: `${rows() * cell()}px` }}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            aria-label={`heatmap of ${rows()}×${cols()} values`}
          />
          <div class="sp-rich__heat-side mono">
            <Show when={range()}>
              {(r) => (
                <span class="sp-rich__legend">
                  <span class="sp-rich__legend-bar" /> {formatCell(r()[0])} → {formatCell(r()[1])}
                </span>
              )}
            </Show>
            <Show when={hover()} fallback={<span class="sp-rich__muted">hover for values</span>}>
              {(h) => (
                <span>
                  [{h().r}, {h().c}] = {formatCell(h().v)}
                </span>
              )}
            </Show>
            <Show when={axesNote()}>
              <span class="sp-rich__muted">{axesNote()}</span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
