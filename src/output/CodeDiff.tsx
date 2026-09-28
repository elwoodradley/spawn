/**
 * The code half of a run comparison: a unified line diff of the two
 * snapshots, unchanged stretches folded to three lines of context with a
 * button to unfold each one.
 */
import { createMemo, createSignal, For, Show } from "solid-js";

import { collapseContext, diffLines, diffStats, type DiffOp } from "../spawn/diff";
import type { RunRecord } from "../spawn/runHistory";

export default function CodeDiff(props: { a: RunRecord; b: RunRecord }) {
  const missing = () => (!props.a.snapshot ? props.a : !props.b.snapshot ? props.b : null);
  const diff = createMemo(() => {
    const a = props.a.snapshot?.code;
    const b = props.b.snapshot?.code;
    return a !== undefined && b !== undefined ? diffLines(a, b) : null;
  });
  const chunks = createMemo(() => {
    const d = diff();
    return d ? collapseContext(d.ops) : [];
  });
  const stats = createMemo(() => diffStats(diff()?.ops ?? []));
  const [unfolded, setUnfolded] = createSignal<ReadonlySet<number>>(new Set());
  const unfold = (i: number) => setUnfolded((prev) => new Set(prev).add(i));

  return (
    <section class="sp-diff" aria-label="Code diff">
      <header class="sp-diff__head">
        <span>code</span>
        <Show when={diff()}>
          {(d) => (
            <>
              <span class="sp-diff__stat is-del">−{stats().removed}</span>
              <span class="sp-diff__stat is-add">+{stats().added}</span>
              <Show when={!d().exact}>
                <span class="sp-diff__note">
                  too different to line up; showing the old file then the new one
                </span>
              </Show>
            </>
          )}
        </Show>
      </header>
      <Show when={missing()}>
        {(run) => <p class="sp-diff__empty">Run #{run().id} has no saved code.</p>}
      </Show>
      <Show when={diff() && stats().added + stats().removed === 0}>
        <p class="sp-diff__empty">The code is identical.</p>
      </Show>
      <Show when={diff() && stats().added + stats().removed > 0}>
        <pre class="sp-diff__body">
          <For each={chunks()}>
            {(chunk, i) => (
              <Show
                when={chunk.kind === "lines" || unfolded().has(i())}
                fallback={
                  <button class="sp-diff__fold" onClick={() => unfold(i())}>
                    ⋯ {chunk.ops.length} unchanged {chunk.ops.length === 1 ? "line" : "lines"}
                  </button>
                }
              >
                <For each={chunk.ops}>{(op) => <Line op={op} />}</For>
              </Show>
            )}
          </For>
        </pre>
      </Show>
    </section>
  );
}

function Line(props: { op: DiffOp }) {
  const sign = () => (props.op.kind === "add" ? "+" : props.op.kind === "del" ? "−" : " ");
  return (
    <div class="sp-diff__line" classList={{ [`is-${props.op.kind}`]: true }}>
      <span class="sp-diff__num">{props.op.a ?? ""}</span>
      <span class="sp-diff__num">{props.op.b ?? ""}</span>
      <span class="sp-diff__sign">{sign()}</span>
      <span class="sp-diff__text">{props.op.text}</span>
    </div>
  );
}
