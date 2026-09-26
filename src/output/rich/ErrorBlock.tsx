/**
 * A croak from the pool: the traceback with clickable frames, the exception
 * line emphasised.
 */
import { For } from "solid-js";

import { openFile } from "../../app/state";
import type { DisplayPayload } from "../../pool/protocol";
import { parseFrameLine } from "../../spawn/croak";

type ErrorPayload = Extract<DisplayPayload, { kind: "error" }>;

export default function ErrorBlock(props: { payload: ErrorPayload }) {
  const lines = () => props.payload.traceback.split(/\r?\n/);
  return (
    <div class="sp-rich sp-rich--error mono">
      <For each={lines()}>
        {(line) => {
          const frame = parseFrameLine(line);
          return frame && !frame.file.startsWith("<") ? (
            <button
              class="sp-rich__frame-link"
              title={`Open ${frame.file} at line ${frame.line}`}
              onClick={() => void openFile(frame.file, frame.line)}
            >
              {line}
            </button>
          ) : (
            <div class="sp-rich__tb-line">{line || " "}</div>
          );
        }}
      </For>
      <div class="sp-rich__exc">
        <span class="sp-rich__exc-type">{props.payload.type}</span>
        {props.payload.message ? `: ${props.payload.message}` : ""}
      </div>
    </div>
  );
}
