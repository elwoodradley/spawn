/**
 * One live chart for one metric group. Small multiples: every group gets its
 * own chart so nothing shares an axis with something of a different scale.
 *
 * A group with a train and a val series draws both lines and shades the band
 * between them, so overfitting reads as a widening gap. Previous runs' curves
 * of the same name draw behind the live ones as thin dashed lines.
 *
 * Axes are honest about the data: the value axis is labelled at the true
 * minimum and maximum of every visible line, the x axis counts whatever the
 * script counts with whole-number ticks and a baseline, and end labels stay
 * inside the plot area.
 */
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { Series, XUnit } from "../spawn/metrics";
import { groupLines, type ChartGroup } from "../spawn/pairs";
import type { RunRecord } from "../spawn/runHistory";
import {
  formatValue,
  gapPath,
  integerTicks,
  linearScale,
  linePath,
  nearestIndex,
  valueTicks,
} from "./chart";
import ChartLegend from "./ChartLegend";

const PAD = { top: 16, right: 16, bottom: 26, left: 52 };
/** Approximate glyph width of the label font, for keeping labels in bounds. */
const CHAR_W = 6.8;

export interface OverlayRun {
  run: RunRecord;
  enabled: boolean;
}

interface Line {
  name: string;
  points: Series["points"];
  colour: string;
  previous: boolean;
}

export default function LossChart(props: {
  group: ChartGroup;
  xUnit: XUnit;
  overlays: OverlayRun[];
  onToggleOverlay: (id: number) => void;
}) {
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

  const live = createMemo(() => groupLines(props.group));
  const colourOf = (i: number) => `var(--sp-plot-series-${i % seriesCount()})`;

  /** Live lines in fixed colour order, then enabled previous runs behind them. */
  const lines = createMemo<Line[]>(() => {
    const out: Line[] = [];
    const names = live().map((s) => s.name);
    for (const o of props.overlays) {
      if (!o.enabled) continue;
      for (const s of o.run.series) {
        const i = names.indexOf(s.name);
        if (i === -1) continue;
        out.push({
          name: `${s.name} #${o.run.id}`,
          points: s.points,
          colour: colourOf(i),
          previous: true,
        });
      }
    }
    live().forEach((s, i) =>
      out.push({ name: s.name, points: s.points, colour: colourOf(i), previous: false }),
    );
    return out;
  });

  const layout = createMemo(() => {
    const all = lines();
    const { w, h } = size();
    const xs = all.flatMap((l) => l.points.map((p) => p.step));
    const ys = all.flatMap((l) => l.points.map((p) => p.value)).filter(Number.isFinite);
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
    const labelW =
      Math.max(
        0,
        ...live().map((s) => formatValue(s.points[s.points.length - 1]?.value ?? 0).length),
      ) * CHAR_W;
    const right = PAD.right + labelW + 10;
    const x = linearScale([xMin, xMax], [PAD.left, w - right]);
    const y = linearScale([yMin, yMax], [h - PAD.bottom, PAD.top]);
    const xTicks = integerTicks(xMin, xMax, Math.max(2, Math.floor((w - PAD.left - right) / 70)));
    const gap =
      props.group.train && props.group.val
        ? gapPath(props.group.train.points, props.group.val.points, x, y)
        : "";
    // Hover snaps to the x values of the first live line.
    const hoverXs = live()[0]?.points.map((p) => p.step) ?? [];
    return { x, y, xTicks, yTicks, gap, hoverXs, w, h, right };
  });

  const onMove = (event: MouseEvent) => {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const { x, hoverXs, w, right } = layout();
    const px = event.clientX - rect.left;
    const [d0, d1] = x.domain;
    const value = d0 + ((px - PAD.left) / Math.max(1, w - PAD.left - right)) * (d1 - d0);
    setHover(nearestIndex(hoverXs, value));
  };

  const hoverStep = () => {
    const i = hover();
    return i === null ? null : (layout().hoverXs[i] ?? null);
  };

  /** Each live line's point nearest the hovered step. */
  const hoverPoints = () => {
    const step = hoverStep();
    if (step === null) return [];
    return live().flatMap((s, i) => {
      const idx = nearestIndex(
        s.points.map((p) => p.step),
        step,
      );
      const p = s.points[idx];
      return p && p.step === step ? [{ name: s.name, point: p, colour: colourOf(i) }] : [];
    });
  };

  const xLabel = () => (props.xUnit === "sample" ? "sample" : props.xUnit);
  const valColour = () => colourOf(props.group.train ? 1 : 0);

  return (
    <figure class="sp-chart">
      <figcaption class="sp-chart__title">
        <span class="sp-chart__name">{props.group.metric}</span>
      </figcaption>
      <ChartLegend
        group={props.group}
        colourOf={colourOf}
        overlays={props.overlays}
        onToggleOverlay={props.onToggleOverlay}
      />
      <div class="sp-chart__body" ref={(el) => (host = el)}>
        <svg
          class="sp-chart__svg"
          width={layout().w}
          height={layout().h}
          role="img"
          aria-label={`${props.group.metric} by ${xLabel()}`}
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
                  classList={{ "is-end": i() === 0 || i() === layout().yTicks.length - 1 }}
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
          <Show when={layout().gap}>
            <path class="sp-chart__gap" d={layout().gap} style={{ fill: valColour() }} />
          </Show>
          <For each={lines()}>
            {(line) => (
              <path
                class="sp-chart__line"
                classList={{ "is-previous": line.previous }}
                d={linePath(line.points, layout().x, layout().y)}
                style={{ stroke: line.colour }}
              />
            )}
          </For>
          <For each={live()}>
            {(s, i) => (
              <Show when={s.points[s.points.length - 1]}>
                {(p) => (
                  <g>
                    <circle
                      class="sp-chart__end"
                      cx={layout().x(p().step)}
                      cy={layout().y(p().value)}
                      r="4"
                      style={{ fill: colourOf(i()) }}
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
            )}
          </For>
          <Show when={hoverStep() !== null}>
            <g class="sp-chart__hover">
              <line
                class="sp-chart__crosshair"
                x1={layout().x(hoverStep() ?? 0)}
                x2={layout().x(hoverStep() ?? 0)}
                y1={PAD.top}
                y2={layout().h - PAD.bottom}
              />
              <For each={hoverPoints()}>
                {(hp) => (
                  <circle
                    class="sp-chart__dot"
                    cx={layout().x(hp.point.step)}
                    cy={layout().y(hp.point.value)}
                    r="4"
                    style={{ fill: hp.colour }}
                  />
                )}
              </For>
              <Tooltip
                x={layout().x(hoverStep() ?? 0)}
                y={PAD.top}
                w={layout().w}
                text={`${xLabel()} ${hoverStep()} · ${hoverPoints()
                  .map((hp) => `${hp.name} ${formatValue(hp.point.value)}`)
                  .join(" · ")}`}
              />
            </g>
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
