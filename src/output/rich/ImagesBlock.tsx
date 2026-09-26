/**
 * A batch of images recognised from an array's shape: a wrapping grid of
 * thumbnails with their batch index, click one to see it enlarged.
 */
import { createSignal, For, Show } from "solid-js";

import type { DisplayPayload } from "../../pool/protocol";

type ImagesPayload = Extract<DisplayPayload, { kind: "images" }>;

const ENLARGE = 4;

export default function ImagesBlock(props: { payload: ImagesPayload }) {
  const [selected, setSelected] = createSignal<number | null>(null);

  const src = (thumb: string) => `data:image/png;base64,${thumb}`;
  const shape = () => `(${props.payload.shape.join(", ")})`;
  const shown = () => Math.min(props.payload.count, props.payload.thumbs.length);
  const [tw, th] = [() => props.payload.thumbSize[0], () => props.payload.thumbSize[1]];

  return (
    <div class="sp-rich sp-rich--images">
      <div class="sp-rich__bar">
        <span class="sp-rich__badge">
          {props.payload.count} image{props.payload.count === 1 ? "" : "s"}
        </span>
        <span class="mono">
          {shape()} {props.payload.dtype}
        </span>
        <span class="sp-rich__muted">{props.payload.layout}</span>
        <Show when={props.payload.normalized}>
          <span class="sp-rich__muted" title="values were rescaled per image to fit 0..255">
            normalised
          </span>
        </Show>
        <Show when={props.payload.valueRange}>
          {(r) => (
            <span class="sp-rich__muted mono">
              {formatRange(r()[0])}…{formatRange(r()[1])}
            </span>
          )}
        </Show>
        <Show when={shown() < props.payload.count}>
          <span class="sp-rich__muted">first {shown()} shown</span>
        </Show>
      </div>
      <Show when={selected() !== null && props.payload.thumbs[selected() ?? 0]}>
        {(thumb) => (
          <button
            type="button"
            class="sp-images__large"
            title="click to close"
            onClick={() => setSelected(null)}
          >
            <img
              src={src(thumb())}
              alt={`image ${selected()} enlarged`}
              width={tw() * ENLARGE}
              height={th() * ENLARGE}
            />
            <span class="sp-images__index mono">#{selected()}</span>
          </button>
        )}
      </Show>
      <div class="sp-images__grid">
        <For each={props.payload.thumbs}>
          {(thumb, i) => (
            <button
              type="button"
              class="sp-images__thumb"
              classList={{ "is-selected": selected() === i() }}
              title={`image ${i()} · click to enlarge`}
              onClick={() => setSelected(selected() === i() ? null : i())}
            >
              <img src={src(thumb)} alt={`image ${i()}`} width={tw()} height={th()} />
              <span class="sp-images__index mono">{i()}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function formatRange(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}
