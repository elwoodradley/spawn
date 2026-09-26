/**
 * The run panel: what a training script is doing right now. Elapsed time,
 * iteration rate, progress with an ETA, and a live chart per metric series.
 */
import { For, Show } from "solid-js";

import { elapsedMs, metrics, spawnStatus } from "../spawn/controller";
import { formatDuration, formatRate } from "./chart";
import LossChart from "./LossChart";
import "./RunPanel.css";

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
        when={metrics.series.length > 0}
        fallback={
          <div class="sp-run__empty">
            <p>No metrics yet.</p>
            <p class="sp-run__hint">
              Print <code>loss: 0.234</code>, <code>epoch 3/10</code>, or use tqdm and they show up
              here as the spawn runs. Add your own patterns under the <code>run.patterns</code>{" "}
              setting.
            </p>
          </div>
        }
      >
        <div class="sp-run__charts">
          <For each={metrics.series}>
            {(series, i) => <LossChart series={series} index={i()} />}
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
