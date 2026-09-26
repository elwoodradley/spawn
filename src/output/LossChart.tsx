/**
 * One live line chart for one series. Small multiples: every series gets its
 * own chart so nothing shares an axis with something of a different scale.
 *
 * Axes are honest about the data: the value axis is labelled at the true
 * minimum and maximum (so the steep parts always have a reference) with nice
 * ticks between, and the x axis counts whatever the script counts (epochs,
 * steps, or samples) with whole-number ticks and a baseline. The last value
 * is labelled at the line's end and kept inside the plot area.
 */
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { Series, XUnit } from "../spawn/metrics";
import { formatValue, integerTicks, linearScale, nearestIndex, valueTicks } from "./chart";

const PAD = { top: 16, right: 16, bottom: 26, left: 52 };
/** Approximate glyph width of the label font, for keeping labels in bounds. */
const CHAR_W = 6.8;

export default function LossChart(props: { series: Series; index: number; xUnit: XUnit }) {
  let host: HTMLDivElement | undefined;
  const [size, setSize] = createSignal({ w: 320, h: 160 });
  const [hover, setHover] = createSignal<number | null>(null);

  onMount(() => {
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    observer.observe(host);
    onCleanup(() => observer.disconnect());
  });

  const points = () => props.series.points;
  const colour = () => `var(--sp-plot-series-${props.index % seriesCount()})`;

  const layout = createMemo(() => {
    const pts = points();
    const { w, h } = size();
    const xs = pts.map((p) => p.step);
    const ys = pts.map((p) => p.value).filter((v) => Number.isFinite(v));
    const xMin = xs.length ? Math.min(...xs) : 0;
    const xMax = Math.max(xs.length ? Math.max(...xs) : 1, xMin + 1);
    let yMin = ys.length ? Math.min(...ys) : 0;
    let yMax = ys.length ? Math.max(...ys) : 1;
    if (yMin === yMax) {
      const pad = yMin === 0 ? 1 : Math.abs(yMin) * 0.1;
      yMin -= pad;
      yMax += pad;
    }
    const yTicks = valueTicks(yMin, yMax, 3);
    // Room for the end label: it sits to the right of the last point, so the
    // plot area stops short of the edge by the label's width.
    const labelW = (pts.length ? formatValue(pts[pts.length - 1]?.value ?? 0).length : 0) * CHAR_W;
    const right = PAD.right + labelW + 10;
    const x = linearScale([xMin, xMax], [PAD.left, w - right]);
    const y = linearScale([yMin, yMax], [h - PAD.bottom, PAD.top]);
    const xTicks = integerTicks(xMin, xMax, Math.max(2, Math.floor((w - PAD.left - right) / 70)));
    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.step).toFixed(1)} ${y(p.value).toFixed(1)}`)
      .join(" ");
    return { x, y, xTicks, yTicks, path, xs, w, h, right };
  });

  const last = () => points()[points().length - 1];

  const onMove = (event: MouseEvent) => {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const { x, xs, w, right } = layout();
    const px = event.clientX - rect.left;
    const [d0, d1] = x.domain;
    const value = d0 + ((px - PAD.left) / Math.max(1, w - PAD.left - right)) * (d1 - d0);
    setHover(nearestIndex(xs, value));
  };

  const hovered = () => {
    const i = hover();
    return i === null ? undefined : points()[i];
  };

  const xLabel = () => (props.xUnit === "sample" ? "sample" : props.xUnit);

  return (
    <figure class="sp-chart">
      <figcaption class="sp-chart__title">
        <span class="sp-chart__swatch" style={{ background: colour() }} />
        <span class="sp-chart__name">{props.series.name}</span>
        <span class="sp-chart__last mono">{last() ? formatValue(last()?.value ?? 0) : ""}</span>
      </figcaption>
      <div class="sp-chart__body" ref={(el) => (host = el)}>
        <svg
          class="sp-chart__svg"
          width={layout().w}
          height={layout().h}
          role="img"
          aria-label={`${props.series.name} by ${xLabel()}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <For each={layout().yTicks}>
            {(tick, i) => (
              <g>
                <line
                  class="sp-chart__grid"
                  x1={PAD.left}
                  x2={layout().w - layout().right}
                  y1={layout().y(tick)}
                  y2={layout().y(tick)}
                />
                <text
                  class="sp-chart__tick"
                  classList={{
                    "is-end": i() === 0 || i() === layout().yTicks.length - 1,
                  }}
                  x={PAD.left - 6}
                  y={layout().y(tick)}
                  text-anchor="end"
                  dominant-baseline="middle"
                >
                  {formatValue(tick)}
                </text>
              </g>
            )}
          </For>
          <line
            class="sp-chart__axis"
            x1={PAD.left}
            x2={layout().w - layout().right}
            y1={layout().h - PAD.bottom}
            y2={layout().h - PAD.bottom}
          />
          <For each={layout().xTicks}>
            {(tick) => (
              <g>
                <line
                  class="sp-chart__axis"
                  x1={layout().x(tick)}
                  x2={layout().x(tick)}
                  y1={layout().h - PAD.bottom}
                  y2={layout().h - PAD.bottom + 4}
                />
                <text
                  class="sp-chart__tick"
                  x={layout().x(tick)}
                  y={layout().h - 7}
                  text-anchor="middle"
                >
                  {tick}
                </text>
              </g>
            )}
          </For>
          <text
            class="sp-chart__tick sp-chart__axis-name"
            x={layout().w - layout().right}
            y={layout().h - 7}
            text-anchor="start"
            dx="8"
          >
            {xLabel()}
          </text>
          <path class="sp-chart__line" d={layout().path} style={{ stroke: colour() }} />
          <Show when={last()}>
            {(p) => (
              <g>
                <circle
                  class="sp-chart__end"
                  cx={layout().x(p().step)}
                  cy={layout().y(p().value)}
                  r="4"
                  style={{ fill: colour() }}
                />
                <text
                  class="sp-chart__label"
                  x={layout().x(p().step) + 8}
                  y={layout().y(p().value)}
                  dominant-baseline="middle"
                >
                  {formatValue(p().value)}
                </text>
              </g>
            )}
          </Show>
          <Show when={hovered()}>
            {(p) => (
              <g class="sp-chart__hover">
                <line
                  class="sp-chart__crosshair"
                  x1={layout().x(p().step)}
                  x2={layout().x(p().step)}
                  y1={PAD.top}
                  y2={layout().h - PAD.bottom}
                />
                <circle
                  class="sp-chart__dot"
                  cx={layout().x(p().step)}
                  cy={layout().y(p().value)}
                  r="4"
                  style={{ fill: colour() }}
                />
                <Tooltip
                  x={layout().x(p().step)}
                  y={PAD.top}
                  w={layout().w}
                  text={`${xLabel()} ${p().step} · ${formatValue(p().value)}`}
                />
              </g>
            )}
          </Show>
        </svg>
      </div>
    </figure>
  );
}

function Tooltip(props: { x: number; y: number; w: number; text: string }) {
  const width = () => props.text.length * CHAR_W + 12;
  const left = () => (props.x + 10 + width() > props.w ? props.x - 10 - width() : props.x + 10);
  return (
    <g transform={`translate(${left()} ${props.y})`}>
      <rect class="sp-chart__tip" width={width()} height="18" rx="3" />
      <text class="sp-chart__tip-text" x="6" y="13">
        {props.text}
      </text>
    </g>
  );
}

function seriesCount(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--sp-plot-series-count");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 6;
}
