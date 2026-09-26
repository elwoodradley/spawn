/**
 * One live line chart for one series. Small multiples: every series gets its
 * own chart so nothing shares an axis with something of a different scale.
 *
 * Marks follow the house rules: a 2px line, recessive hairline grid, the
 * last value labelled at the line's end, and a crosshair tooltip on hover.
 * Colours come from the theme's plot tokens by series index.
 */
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { Series } from "../spawn/metrics";
import { formatValue, linearScale, nearestIndex, niceTicks } from "./chart";

const PAD = { top: 18, right: 56, bottom: 22, left: 44 };

export default function LossChart(props: { series: Series; index: number }) {
  let host: HTMLElement | undefined;
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
    const ys = pts.map((p) => p.value);
    const xMin = Math.min(...xs, 0);
    const xMax = Math.max(...xs, 1);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    if (!Number.isFinite(yMin)) {
      yMin = 0;
      yMax = 1;
    }
    if (yMin === yMax) {
      const pad = yMin === 0 ? 1 : Math.abs(yMin) * 0.1;
      yMin -= pad;
      yMax += pad;
    }
    const yTicks = niceTicks(yMin, yMax, 3);
    const yLo = Math.min(yMin, yTicks[0] ?? yMin);
    const yHi = Math.max(yMax, yTicks[yTicks.length - 1] ?? yMax);
    const x = linearScale([xMin, xMax], [PAD.left, w - PAD.right]);
    const y = linearScale([yLo, yHi], [h - PAD.bottom, PAD.top]);
    const xTicks = niceTicks(xMin, xMax, 4);
    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.step).toFixed(1)} ${y(p.value).toFixed(1)}`)
      .join(" ");
    return { x, y, xTicks, yTicks, path, xs, w, h };
  });

  const last = () => points()[points().length - 1];

  const onMove = (event: MouseEvent) => {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const { x, xs } = layout();
    const px = event.clientX - rect.left;
    const [d0, d1] = x.domain;
    const value =
      d0 + ((px - PAD.left) / Math.max(1, layout().w - PAD.left - PAD.right)) * (d1 - d0);
    setHover(nearestIndex(xs, value));
  };

  const hovered = () => {
    const i = hover();
    return i === null ? undefined : points()[i];
  };

  return (
    <figure class="sp-chart" ref={(el) => (host = el)}>
      <figcaption class="sp-chart__title">
        <span class="sp-chart__swatch" style={{ background: colour() }} />
        <span class="sp-chart__name">{props.series.name}</span>
        <span class="sp-chart__last mono">{last() ? formatValue(last()?.value ?? 0) : ""}</span>
      </figcaption>
      <svg
        class="sp-chart__svg"
        width={layout().w}
        height={layout().h}
        role="img"
        aria-label={`${props.series.name} over steps`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <For each={layout().yTicks}>
          {(tick) => (
            <g>
              <line
                class="sp-chart__grid"
                x1={PAD.left}
                x2={layout().w - PAD.right}
                y1={layout().y(tick)}
                y2={layout().y(tick)}
              />
              <text
                class="sp-chart__tick"
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
        <For each={layout().xTicks}>
          {(tick) => (
            <text
              class="sp-chart__tick"
              x={layout().x(tick)}
              y={layout().h - 6}
              text-anchor="middle"
            >
              {formatValue(tick)}
            </text>
          )}
        </For>
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
                text={`step ${p().step} · ${formatValue(p().value)}`}
              />
            </g>
          )}
        </Show>
      </svg>
    </figure>
  );
}

function Tooltip(props: { x: number; y: number; w: number; text: string }) {
  const width = () => props.text.length * 6.5 + 12;
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
