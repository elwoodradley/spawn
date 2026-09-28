/**
 * The run panel: what a training script is doing right now. Elapsed time,
 * iteration rate, progress with an ETA, a strip of kept runs, and a live
 * chart per metric group (train and val of one metric share a chart).
 */
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  untrack,
} from "solid-js";

import { settings } from "../app/settings";
import { elapsedMs, metrics, spawnCommand, spawnStatus } from "../spawn/controller";
import { analyzeHealth, type Finding } from "../spawn/health";
import { groupSeries } from "../spawn/pairs";
import { promote } from "../spawn/promote";
import { removeRun, runLabel, runs } from "../spawn/runHistory";
import { formatDuration, formatRate, formatValue } from "./chart";
import HealthStrip, { dismissedFindings, dismissFinding, toneOf } from "./HealthStrip";
import LossChart, { type ChartMarker, type OverlayRun } from "./LossChart";
import "./RunPanel.css";

/** How often the health check re-reads the curves while a run streams. */
const HEALTH_INTERVAL_MS = 300;

export default function RunPanel() {
  const progress = metrics.progress;
  const eta = () => {
    const p = progress();
    if (!p) return null;
    if (p.etaSeconds !== null) return p.etaSeconds;
    // Epoch-based progress has no ETA of its own; extrapolate from elapsed.
    if (p.fraction <= 0) return null;
    const elapsed = elapsedMs() / 1000;
    return elapsed / p.fraction - elapsed;
  };
  const percent = () => Math.round((progress()?.fraction ?? 0) * 100);

  const promoted = createMemo(() => promote(metrics.series));
  const groups = createMemo(() => groupSeries(promoted().charted));

  /** Runs the user switched off in a legend; everything else overlays. */
  const [hidden, setHidden] = createSignal<ReadonlySet<number>>(new Set());
  const toggle = (id: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const overlays = createMemo<OverlayRun[]>(() =>
    settings().run.overlayPrevious
      ? runs().map((run) => ({ run, enabled: !hidden().has(run.id) }))
      : [],
  );

  /**
   * Findings are recomputed on a timer while the run streams rather than on
   * every printed line: the analysis is O(n) but a flood prints thousands of
   * lines a second. The store is read untracked; `tick` drives the memo.
   */
  const [tick, setTick] = createSignal(0);
  createEffect(
    on(spawnStatus, (status) => {
      if (status !== "running") {
        setTick((t) => t + 1);
        return;
      }
      const timer = setInterval(() => setTick((t) => t + 1), HEALTH_INTERVAL_MS);
      onCleanup(() => clearInterval(timer));
    }),
  );
  const findings = createMemo<Finding[]>(() => {
    tick();
    if (!settings().run.health) return [];
    return untrack(() =>
      analyzeHealth({
        series: metrics.series,
        nonFinite: metrics.nonFinite(),
        xUnit: metrics.xUnit(),
      }),
    );
  });
  const visibleFindings = () => {
    const dismissed = dismissedFindings(spawnCommand());
    return findings().filter((f) => !dismissed.has(f.id));
  };
  const markersFor = (metric: string): ChartMarker[] =>
    visibleFindings()
      .filter((f) => f.metric.toLowerCase() === metric.toLowerCase())
      .map((f) => ({ step: f.step, label: f.label, tone: toneOf(f.kind) }));

  let chartsHost: HTMLDivElement | undefined;
  const [focused, setFocused] = createSignal<string | null>(null);
  let focusTimer: ReturnType<typeof setTimeout> | null = null;
  const focusChart = (finding: Finding) => {
    const slot = chartsHost?.querySelector<HTMLElement>(
      `[data-metric="${CSS.escape(finding.metric)}"]`,
    );
    slot?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFocused(finding.metric);
    if (focusTimer !== null) clearTimeout(focusTimer);
    focusTimer = setTimeout(() => setFocused(null), 1500);
  };
  onCleanup(() => {
    if (focusTimer !== null) clearTimeout(focusTimer);
  });

  return (
    <section class="sp-run" aria-label="Run">
      <div class="sp-run__stats">
        <Stat label="elapsed" value={formatDuration(elapsedMs() / 1000)} />
        <Stat label="rate" value={formatRate(metrics.rate())} />
        <Show when={metrics.epoch()}>
          {(e) => (
            <Stat
              label="epoch"
              value={e().total !== null ? `${e().current}/${e().total}` : String(e().current)}
            />
          )}
        </Show>
        <Show when={progress()}>
          {(p) => (
            <div class="sp-run__progress" title={`${p().current}/${p().total} from ${p().source}`}>
              <div
                class="sp-run__bar"
                role="progressbar"
                aria-valuenow={percent()}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div class="sp-run__fill" style={{ width: `${percent()}%` }} />
              </div>
              <span class="sp-run__eta mono">
                {percent()}% ·{" "}
                {spawnStatus() === "running" ? `eta ${formatDuration(eta())}` : "done"}
              </span>
            </div>
          )}
        </Show>
      </div>
      <Show when={runs().length > 0 || spawnCommand()}>
        <div class="sp-run__runs" aria-label="Kept runs">
          <span class="sp-run__runs-label">runs</span>
          <For each={runs()}>
            {(run) => (
              <span class="sp-run__run" title={run.command}>
                <span class="sp-run__run-dot" classList={{ [`is-${run.outcome}`]: true }} />
                <span>{run.file}</span>
                <span>{runLabel(run)}</span>
                <button
                  class="sp-run__run-x"
                  title="Forget this run"
                  aria-label={`Forget run ${run.id}`}
                  onClick={() => removeRun(run.id)}
                >
                  ×
                </button>
              </span>
            )}
          </For>
          <Show when={spawnCommand()}>
            {(cmd) => (
              <span class="sp-run__run is-now">
                <span
                  class="sp-run__run-dot"
                  classList={{ "is-ok": spawnStatus() === "running" }}
                />
                <span>{cmd().args[cmd().args.length - 1]?.split(/[\\/]/).pop()}</span>
                <span>now</span>
              </span>
            )}
          </Show>
        </div>
      </Show>
      <HealthStrip
        findings={visibleFindings()}
        onFocus={focusChart}
        onDismiss={(id) => dismissFinding(spawnCommand(), id)}
      />
      <Show when={metrics.patternErrors().length > 0}>
        <p class="sp-run__error">
          Custom pattern problem:{" "}
          {metrics
            .patternErrors()
            .map((e) => `${e.name} (${e.message})`)
            .join(", ")}
        </p>
      </Show>
      <Show
        when={groups().length > 0}
        fallback={
          <div class="sp-run__empty">
            <p>No metrics yet.</p>
            <p class="sp-run__hint">
              Print <code>loss: 0.234</code>, <code>epoch 3/10</code>, or use tqdm and they show up
              here while the program runs. <code>val_loss</code> lands on the same chart as{" "}
              <code>loss</code>. Add your own patterns in Settings.
            </p>
          </div>
        }
      >
        <Show when={promoted().scalars.length > 0}>
          <div
            class="sp-run__scalars"
            title="Values printed once or twice; three points make a chart"
          >
            <For each={promoted().scalars}>
              {(s) => (
                <span class="mono">
                  <span class="sp-run__scalar-name">{s.name}</span>
                  <span class="sp-run__scalar-value">
                    {formatValue(s.points[s.points.length - 1]?.value ?? 0)}
                  </span>
                </span>
              )}
            </For>
          </div>
        </Show>
        <div class="sp-run__charts" ref={(el) => (chartsHost = el)}>
          <For each={groups()}>
            {(group) => (
              <div
                class="sp-run__slot"
                classList={{ "is-focused": focused() === group.metric }}
                data-metric={group.metric}
              >
                <LossChart
                  group={group}
                  xUnit={metrics.xUnit()}
                  overlays={overlays()}
                  onToggleOverlay={toggle}
                  markers={markersFor(group.metric)}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div class="sp-run__stat">
      <span class="sp-run__stat-label">{props.label}</span>
      <span class="sp-run__stat-value mono">{props.value}</span>
    </div>
  );
}
