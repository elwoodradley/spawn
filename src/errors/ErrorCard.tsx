/**
 * The card under a traceback: a plain-words title, a short explanation, the
 * facts pulled from the message, what to do, and buttons that name exactly
 * what they will run. One card per error, dismissible; the setting
 * `output.explainErrors` turns them all off.
 *
 * `TracebackCard` decides whether a line in the Output panel closes a
 * traceback; `ConsoleErrorCard` sits under an Interactive Console error.
 */
import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import { settings } from "../app/settings";
import { openFile } from "../app/state";
import { baseName } from "../ipc";
import type { DisplayPayload } from "../pool/protocol";
import { isCroakEnd, parseCroak, type Croak } from "../spawn/croak";
import type { OutputLine } from "../spawn/output";
import Icon from "../ui/Icon";
import "./ErrorCard.css";
import { buildContext, installing, probeFs, resolveActions, type ResolvedAction } from "./fixes";
import { croakFromPayload, match, probe } from "./match";

export default function ErrorCard(props: { croak: Croak; source: "run" | "console" }) {
  const [dismissed, setDismissed] = createSignal(false);
  const context = createMemo(() => buildContext(props.source, props.croak));
  const found = createMemo(() => match(props.croak, context()));
  const [probed] = createResource(found, (m) => probe(m, context(), probeFs, props.croak));
  const explanation = () => probed() ?? found()?.explanation ?? null;
  const [actions] = createResource(explanation, (e) => resolveActions(e.actions ?? [], context()));

  return (
    <Show when={settings().output.explainErrors && !dismissed() && explanation()}>
      {(ex) => (
        <aside class="sp-error-card" aria-label="What this error means">
          <header class="sp-error-card__head">
            <h3 class="sp-error-card__title">{ex().title}</h3>
            <button
              class="sp-error-card__close"
              title="Hide this explanation"
              aria-label="Hide this explanation"
              onClick={() => setDismissed(true)}
            >
              <Icon name="close" size={12} />
            </button>
          </header>
          <For each={ex().body}>{(text) => <p class="sp-error-card__text">{text}</p>}</For>
          <Show when={(ex().facts?.length ?? 0) > 0}>
            <dl class="sp-error-card__facts">
              <For each={ex().facts}>
                {(fact) => (
                  <>
                    <dt>{fact.label}</dt>
                    <dd class="mono">{fact.value}</dd>
                  </>
                )}
              </For>
            </dl>
          </Show>
          <Show when={ex().where}>
            {(where) => (
              <button
                class="sp-error-card__where"
                title={`Open ${where().file} at line ${where().line}`}
                onClick={() => void openFile(where().file, where().line)}
              >
                in {baseName(where().file)}, line {where().line}
              </button>
            )}
          </Show>
          <Show when={(ex().todo?.length ?? 0) > 0}>
            <div class="sp-error-card__todo">
              <span class="sp-error-card__label">What to do</span>
              <ul>
                <For each={ex().todo}>{(item) => <li>{item}</li>}</For>
              </ul>
            </div>
          </Show>
          <Show when={(actions()?.length ?? 0) > 0}>
            <div class="sp-error-card__actions">
              <For each={actions()}>{(action) => <ActionButton action={action} />}</For>
            </div>
          </Show>
        </aside>
      )}
    </Show>
  );
}

function ActionButton(props: { action: ResolvedAction }) {
  const [busy, setBusy] = createSignal(false);
  const [result, setResult] = createSignal<string | null>(null);
  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      setResult(await props.action.run());
    } finally {
      setBusy(false);
    }
  };
  return (
    <span class="sp-error-card__action">
      <button
        class="sp-error-card__button"
        title={props.action.title}
        disabled={busy() || installing() !== null}
        onClick={() => void run()}
      >
        {busy() ? "Running…" : props.action.label}
      </button>
      <Show when={result()}>
        <span class="sp-error-card__result">{result()}</span>
      </Show>
    </span>
  );
}

/**
 * For the Output panel: renders a card when `index` is the last line of a
 * traceback. The traceback's lines are all tagged `croak`, so the closing
 * `Type: message` line followed by anything else (or nothing yet) ends it.
 */
export function TracebackCard(props: { lines: OutputLine[]; index: number }) {
  const closes = () => {
    const line = props.lines[props.index];
    if (!line || line.stream !== "croak" || !isCroakEnd(line.text)) return false;
    const next = props.lines[props.index + 1];
    return next === undefined || next.stream !== "croak";
  };
  const croak = createMemo(() => {
    if (!closes()) return null;
    let start = props.index;
    while (start > 0 && props.lines[start - 1]?.stream === "croak") start--;
    return parseCroak(
      props.lines
        .slice(start, props.index + 1)
        .map((l) => l.text)
        .join("\n"),
    );
  });
  return <Show when={croak()}>{(c) => <ErrorCard croak={c()} source="run" />}</Show>;
}

type ErrorPayload = Extract<DisplayPayload, { kind: "error" }>;

/** For the Interactive Console: the card under an error block. */
export function ConsoleErrorCard(props: { payload: ErrorPayload }) {
  const croak = createMemo(() => croakFromPayload(props.payload));
  return <ErrorCard croak={croak()} source="console" />;
}
