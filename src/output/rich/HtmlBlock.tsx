/**
 * HTML from a library's `_repr_html_`, shown in a sandboxed iframe. The frame
 * gets scripts but no same-origin access, so nothing in it can reach the app,
 * its storage or the file system. A small script inside reports the content
 * height by postMessage and the frame is sized to it.
 */
import { onCleanup, onMount } from "solid-js";

import type { DisplayPayload } from "../../pool/protocol";

type Html = Extract<DisplayPayload, { kind: "html" }>;

/** Message key the frame uses to report its height. */
export const HEIGHT_MESSAGE = "spawn-html-height";
const MAX_HEIGHT = 2000;

const REPORTER = `<script>(function(){
  function send(){parent.postMessage({type:"${HEIGHT_MESSAGE}",height:document.documentElement.scrollHeight},"*");}
  addEventListener("load",send);
  if(typeof ResizeObserver!=="undefined"){new ResizeObserver(send).observe(document.documentElement);}
})();</script>`;

/** The height a frame asked for, or null if the message is not one. */
export function reportedHeight(data: unknown): number | null {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as { type?: unknown; height?: unknown };
  if (msg.type !== HEIGHT_MESSAGE || typeof msg.height !== "number") return null;
  if (!Number.isFinite(msg.height) || msg.height < 0) return null;
  return Math.min(Math.ceil(msg.height), MAX_HEIGHT);
}

export default function HtmlBlock(props: { payload: Html }) {
  let frame: HTMLIFrameElement | undefined;

  const doc = () => {
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue("--sp-plot-bg").trim();
    const fg = style.getPropertyValue("--sp-plot-fg").trim();
    const font = style.getPropertyValue("--sp-font-ui").trim();
    const size = style.getPropertyValue("--sp-font-size-ui").trim();
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:${bg};color:${fg};font-family:${font};font-size:${size};}
      table{border-collapse:collapse}td,th{padding:2px 8px}
    </style></head><body>${props.payload.html}${REPORTER}</body></html>`;
  };

  const onMessage = (event: MessageEvent) => {
    if (!frame || event.source !== frame.contentWindow) return;
    const height = reportedHeight(event.data);
    if (height !== null) frame.style.height = `${height + 4}px`;
  };

  onMount(() => window.addEventListener("message", onMessage));
  onCleanup(() => window.removeEventListener("message", onMessage));

  return (
    <div class="sp-rich sp-rich--html">
      <iframe
        ref={(el) => (frame = el)}
        class="sp-rich__frame"
        sandbox="allow-scripts"
        srcdoc={doc()}
        title="html output"
      />
    </div>
  );
}
