/**
 * The legend under a chart title: every live line with its last value, the
 * signed train/val gap when both exist, and one checkbox per previous run
 * that has a matching series. Identity is never colour alone: the name sits
 * next to its swatch.
 */
import { For, Show } from "solid-js";

import { groupLines, type ChartGroup } from "../spawn/pairs";
import { runLabel } from "../spawn/runHistory";
import { formatValue } from "./chart";
import type { OverlayRun } from "./LossChart";

export default function ChartLegend(props: {
  group: ChartGroup;
  colourOf: (index: number) => string;
  overlays: OverlayRun[];
  onToggleOverlay: (id: number) => void;
}) {
  const lines = () => groupLines(props.group);
  const lastOf = (points: { value: number }[]) => points[points.length - 1]?.value;

  /** val − train at the latest point both have. Positive on loss means overfitting. */
  const gap = () => {
    const t = props.group.train;
    const v = props.group.val;
    if (!t || !v) return null;
    const a = lastOf(t.points);
    const b = lastOf(v.points);
    if (a === undefined || b === undefined) return null;
    return b - a;
  };
  const gapWorse = () => {
    const g = gap();
    if (g === null) return false;
    // Higher val loss is worse; lower val accuracy is worse.
    return /loss|nll|cost|err/i.test(props.group.metric) ? g > 0 : g < 0;
  };

  const names = () => lines().map((s) => s.name);
  const relevant = () =>
    props.overlays.filter((o) => o.run.series.some((s) => names().includes(s.name)));

  return (
    <div class="sp-chart__legend" role="list">
      <For each={lines()}>
        {(s, i) => (
          <span class="sp-chart__legend-item" role="listitem">
            <span class="sp-chart__line-swatch" style={{ color: props.colourOf(i()) }} />
            <span>{s.name}</span>
            <span class="mono">{formatValue(lastOf(s.points) ?? 0)}</span>
          </span>
        )}
      </For>
      <For each={relevant()}>
        {(o) => (
          <label
            class="sp-chart__legend-item is-previous"
            classList={{ "is-off": !o.enabled }}
            title={`${o.run.file} · ${o.run.command}`}
          >
            <input
              type="checkbox"
              aria-label={`Show run ${o.run.id} on this chart`}
              checked={o.enabled}
              onChange={() => props.onToggleOverlay(o.run.id)}
            />
            <span class="sp-chart__line-swatch is-previous" />
            <span>{runLabel(o.run)}</span>
          </label>
        )}
      </For>
      <Show when={gap() !== null}>
        <span
          class="sp-chart__gap-value mono"
          classList={{ "is-worse": gapWorse() }}
          title="val − train at the latest point"
        >
          gap {(gap() ?? 0) >= 0 ? "+" : ""}
          {formatValue(gap() ?? 0)}
        </span>
      </Show>
    </div>
  );
}
