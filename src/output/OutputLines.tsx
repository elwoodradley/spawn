/**
 * The line list. `<For>` over the store means an append creates one row and
 * a `\r` rewrite touches one text node; nothing else re-renders.
 */
import { For } from "solid-js";

import { openFile } from "../app/state";
import type { OutputLine } from "../spawn/output";

export default function OutputLines(props: { lines: OutputLine[] }) {
  return (
    <div class="sp-output__lines mono" role="log" aria-live="polite">
      <For each={props.lines}>{(line) => <Row line={line} />}</For>
    </div>
  );
}

function Row(props: { line: OutputLine }) {
  const link = () => props.line.link;
  return (
    <div class={`sp-output__line is-${props.line.stream}`}>
      {link() ? (
        <button
          class="sp-output__link"
          title={`Open ${link()?.file} at line ${link()?.line}`}
          onClick={() => {
            const target = link();
            if (target) void openFile(target.file, target.line);
          }}
        >
          {props.line.text}
        </button>
      ) : (
        <span class="sp-output__text">{props.line.text || " "}</span>
      )}
    </div>
  );
}
