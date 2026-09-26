/**
 * The line list. `<For>` over the store means an append creates one row and
 * a `\r` rewrite touches one text node; nothing else re-renders. A find
 * query highlights hits (and can hide the rest); timestamps add a gutter.
 */
import { For, Show, type JSX } from "solid-js";

import { openFile } from "../app/state";
import type { OutputLine } from "../spawn/output";
import RichBlock from "./rich/RichBlock";
import { formatStamp, lineMatches } from "./view";

export interface OutputLinesProps {
  lines: OutputLine[];
  query?: string;
  filterOnly?: boolean;
  timestamps?: boolean;
}

export default function OutputLines(props: OutputLinesProps) {
  const query = () => props.query ?? "";
  const visible = (line: OutputLine) => !props.filterOnly || lineMatches(line.text, query());
  return (
    <div class="sp-output__lines mono" role="log" aria-live="polite">
      <For each={props.lines}>
        {(line) => (
          <Show when={visible(line)}>
            <Row line={line} query={query()} timestamps={props.timestamps ?? false} />
          </Show>
        )}
      </For>
    </div>
  );
}

/** Split text into plain and highlighted spans around case-insensitive hits. */
export function highlight(text: string, query: string): JSX.Element {
  if (query.length === 0 || !lineMatches(text, query)) return text || " ";
  const parts: JSX.Element[] = [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let from = 0;
  let idx = lower.indexOf(q, from);
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(<mark class="sp-output__hit">{text.slice(idx, idx + q.length)}</mark>);
    from = idx + q.length;
    idx = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

function Row(props: { line: OutputLine; query: string; timestamps: boolean }) {
  const link = () => props.line.link;
  const hit = () => lineMatches(props.line.text, props.query);
  const rich = () => props.line.rich;
  return (
    <div
      class={`sp-output__line is-${props.line.stream}`}
      classList={{ "is-hit": hit() }}
      data-line-id={props.line.id}
    >
      <Show when={props.timestamps}>
        <span class="sp-output__stamp" aria-hidden="true">
          {formatStamp(props.line.at)}
        </span>
      </Show>
      {rich() ? (
        <RichBlock payload={rich() as NonNullable<OutputLine["rich"]>} />
      ) : link() ? (
        <button
          class="sp-output__link"
          title={`Open ${link()?.file} at line ${link()?.line}`}
          onClick={() => {
            const target = link();
            if (target) void openFile(target.file, target.line);
          }}
        >
          {highlight(props.line.text, props.query)}
        </button>
      ) : (
        <span class="sp-output__text">{highlight(props.line.text, props.query)}</span>
      )}
    </div>
  );
}
