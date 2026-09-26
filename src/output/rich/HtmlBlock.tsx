/**
 * HTML from a library's `_repr_html_`, shown in a fully sandboxed iframe so
 * it cannot touch the app. Sized to its content once it loads.
 */
import { onCleanup } from "solid-js";

import type { DisplayPayload } from "../../pool/protocol";

type Html = Extract<DisplayPayload, { kind: "html" }>;

export default function HtmlBlock(props: { payload: Html }) {
  let frame: HTMLIFrameElement | undefined;
  let observer: ResizeObserver | undefined;

  const doc = () => {
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue("--sp-plot-bg").trim();
    const fg = style.getPropertyValue("--sp-plot-fg").trim();
    const font = style.getPropertyValue("--sp-font-ui").trim();
    const size = style.getPropertyValue("--sp-font-size-ui").trim();
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:${bg};color:${fg};font-family:${font};font-size:${size};}
      table{border-collapse:collapse}td,th{padding:2px 8px}
    </style></head><body>${props.payload.html}</body></html>`;
  };

  const fit = () => {
    const body = frame?.contentDocument?.body;
    if (frame && body) frame.style.height = `${body.scrollHeight + 4}px`;
  };

  const onLoad = () => {
    fit();
    const body = frame?.contentDocument?.body;
    if (body && typeof ResizeObserver !== "undefined") {
      observer?.disconnect();
      observer = new ResizeObserver(fit);
      observer.observe(body);
    }
  };

  onCleanup(() => observer?.disconnect());

  return (
    <div class="sp-rich sp-rich--html">
      <iframe
        ref={(el) => (frame = el)}
        class="sp-rich__frame"
        sandbox=""
        srcdoc={doc()}
        title="html output"
        onLoad={onLoad}
      />
    </div>
  );
}
