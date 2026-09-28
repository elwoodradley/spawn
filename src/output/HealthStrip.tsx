/**
 * The strip above the charts: what the training health check found, one row
 * per finding in plain words, with an icon for how bad it is, the confidence,
 * a dismiss button, and a click that scrolls to the chart concerned.
 *
 * Dismissals live at module level, keyed on the object that identifies the
 * current run, because the panel unmounts whenever the Output tab is shown
 * and must not forget them. A new run starts with a clean slate.
 */
import { createSignal, For, Show } from "solid-js";

import type { Finding, FindingKind } from "../spawn/health";
import "./HealthStrip.css";

export type Tone = "error" | "warn" | "info";

/** Which colour a finding gets, on the strip and as a chart marker. */
export function toneOf(kind: FindingKind): Tone {
  if (kind === "nan" || kind === "inf" || kind === "exploding") return "error";
  if (kind === "stalled") return "info";
  return "warn";
}

const EMPTY: ReadonlySet<string> = new Set();
const [dismissedState, setDismissedState] = createSignal<{
  run: unknown;
  ids: ReadonlySet<string>;
}>({ run: null, ids: EMPTY });

/** Finding ids dismissed for `run` (any object that identifies the current run). */
export function dismissedFindings(run: unknown): ReadonlySet<string> {
  const d = dismissedState();
  return d.run === run ? d.ids : EMPTY;
}

export function dismissFinding(run: unknown, id: string): void {
  setDismissedState((d) => ({ run, ids: new Set([...(d.run === run ? d.ids : EMPTY), id]) }));
}

export default function HealthStrip(props: {
  findings: Finding[];
  onFocus: (finding: Finding) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <Show when={props.findings.length > 0}>
      <div class="sp-health" role="list" aria-label="Training health">
        <For each={props.findings}>
          {(f) => (
            <div
              class="sp-health__item"
              classList={{ [`is-${toneOf(f.kind)}`]: true }}
              role="listitem"
            >
              <span class="sp-health__icon" aria-hidden="true">
                {f.severity === "warn" ? "!" : "i"}
              </span>
              <button
                class="sp-health__text"
                title={`Show the ${f.metric} chart`}
                onClick={() => props.onFocus(f)}
              >
                {f.message}
              </button>
              <span
                class="sp-health__tag"
                title={
                  f.confidence === "likely"
                    ? "The curves show this clearly"
                    : "The curves suggest this, but it is not certain"
                }
              >
                {f.confidence}
              </span>
              <button
                class="sp-health__x"
                title="Dismiss for this run"
                aria-label={`Dismiss: ${f.message}`}
                onClick={() => props.onDismiss(f.id)}
              >
                ×
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
